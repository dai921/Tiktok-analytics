import os
import json
import logging
import argparse
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from pytz import timezone
from collections import defaultdict

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def sync_corporate_daily_top100_videos(request):
    """
    企業系動画のTOP100ランキングデータを同期する
    HTTPトリガーで実行可能
    
    Args:
        request (flask.Request): HTTPリクエスト
    
    Returns:
        dict: 処理結果を含むJSON
    """
    logger.info("==== 企業系動画TOP100ランキング同期処理の開始 ====")
    
    try:
        # リクエストパラメータの取得
        request_json = request.get_json(silent=True)
        request_args = request.args
        
        # パラメータの解析
        start_date = None
        end_date = None
        specific_date = None
        
        if request_json:
            start_date = request_json.get('start_date')
            end_date = request_json.get('end_date')
            specific_date = request_json.get('date')
        elif request_args:
            start_date = request_args.get('start_date')
            end_date = request_args.get('end_date')
            specific_date = request_args.get('date')
        
        # 特定の日付が指定されている場合
        if specific_date:
            return process_specific_dates([specific_date])
            
        # 期間が指定されている場合
        if start_date or end_date:
            return process_date_range(start_date, end_date)
            
        # 日付指定がない場合は昨日のデータを処理
        return process_yesterday()
        
    except Exception as e:
        error_message = f"企業系動画TOP100ランキング同期処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 企業系動画TOP100ランキング同期処理の終了 ====")

def process_yesterday():
    """昨日の企業系動画TOP100ランキングを同期する"""
    jst = timezone('Asia/Tokyo')
    yesterday = (datetime.now(jst) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    logger.info(f"昨日のデータを処理します: {yesterday}")
    return process_specific_dates([yesterday])

def process_date_range(start_date=None, end_date=None):
    """期間を指定して企業系動画TOP100ランキングを同期する"""
    # 日付の指定がない場合の処理
    jst = timezone('Asia/Tokyo')
    if not end_date:
        end_date = (datetime.now(jst) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    if not start_date:
        start_date = (datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=7)).strftime('%Y-%m-%d')
    
    logger.info(f"同期期間: {start_date} から {end_date}")
    
    # 対象期間の日付リストを取得
    date_range_query = """
    SELECT DISTINCT collection_date 
    FROM play_count_history 
    WHERE collection_date BETWEEN %s AND %s 
    ORDER BY collection_date
    """
    
    dates = execute_query(date_range_query, (start_date, end_date))
    
    if not dates:
        logger.info(f"指定期間にデータがありません: {start_date} から {end_date}")
        return {"status": "success", "message": "指定期間にデータがありません", "start_date": start_date, "end_date": end_date}
    
    # 日付リストを文字列に変換
    date_strings = [date_row['collection_date'].strftime('%Y-%m-%d') for date_row in dates]
    
    # 指定された日付のデータを処理
    return process_specific_dates(date_strings, start_date, end_date)

def process_specific_dates(date_strings, start_date=None, end_date=None):
    """指定された日付のリストについて企業系動画TOP100ランキングを同期する"""
    processed_dates = []
    
    # 各日付について企業系動画のTOP100を同期
    for collection_date in date_strings:
        sync_corporate_top100_for_date(collection_date)
        
        logger.info(f"日付 {collection_date} の企業系動画TOP100ランキング同期が完了しました")
        processed_dates.append(collection_date)
    
    return {
        "status": "success",
        "message": "企業系動画TOP100ランキング同期が完了しました",
        "start_date": start_date,
        "end_date": end_date,
        "processed_dates": processed_dates,
        "execution_time": datetime.now().isoformat()
    }

def parse_account_types(account_type_str):
    """
    アカウントタイプ文字列を解析し、account_typeとsecond_account_typeに分ける
    
    Args:
        account_type_str (str): カンマ区切りのアカウントタイプ文字列
        
    Returns:
        tuple: (account_type, second_account_type)
    """
    if not account_type_str:
        return None, None
    
    # カンマで分割
    parts = [part.strip() for part in account_type_str.replace('、', ',').split(',') if part.strip()]
    
    if len(parts) == 1:
        # 分割されない場合はそのまま返す
        return parts[0], None
    elif len(parts) >= 2:
        # '採用'または'集客'が含まれているかチェック
        recruitment_hiring_parts = [part for part in parts if part in ['採用', '集客']]
        other_parts = [part for part in parts if part not in ['採用', '集客']]
        
        if recruitment_hiring_parts:
            # '採用'または'集客'がある場合
            second_account_type = recruitment_hiring_parts[0]  # 最初に見つかった方を使用
            account_type = other_parts[0] if other_parts else parts[0]
            return account_type, second_account_type
        else:
            # '採用'も'集客'もない場合は最初の2つを使用
            return parts[0], parts[1]
    
    return None, None

def sync_corporate_top100_for_date(collection_date):
    """指定された日付の企業系動画TOP100ランキングを同期する"""
    
    # 企業系動画の全データを取得するクエリ
    select_query = """
    SELECT 
        pch.video_id,
        pch.play_count_increase,
        pch.likes_count_increase,
        pch.comment_count_increase,
        pch.save_count_increase,
        fd.created_at,
        fd.thumbnail_url,
        fd.account_type
    FROM 
        play_count_history pch
    JOIN 
        frontend_corporate_data fd ON pch.video_id = fd.video_id
    WHERE 
        pch.collection_date = %s
        AND pch.play_count_increase IS NOT NULL
        AND pch.play_count_increase > 0
        AND fd.parent_account_type = '企業アカウント'
    ORDER BY 
        pch.play_count_increase DESC
    """
    
    params = [collection_date]
    results = execute_query(select_query, params)
    
    if not results:
        logger.info(f"日付 {collection_date} の企業系動画データが見つかりません")
        return
    
    # アカウントタイプの組み合わせごとにグループ化
    account_type_groups = defaultdict(list)
    
    for row in results:
        account_type_str = row['account_type']
        account_type, second_account_type = parse_account_types(account_type_str)
        
        # アカウントタイプの組み合わせをキーとして使用
        key = (account_type, second_account_type)
        account_type_groups[key].append({
            'video_id': row['video_id'],
            'play_count_increase': row['play_count_increase'],
            'likes_count_increase': row['likes_count_increase'],
            'comment_count_increase': row['comment_count_increase'],
            'save_count_increase': row['save_count_increase'],
            'created_at': row['created_at'],
            'thumbnail_url': row['thumbnail_url'],
            'account_type': account_type,
            'second_account_type': second_account_type
        })
    
    # 各アカウントタイプの組み合わせごとにTOP100を取得して挿入
    total_insert_count = 0
    
    for (account_type, second_account_type), videos in account_type_groups.items():
        # 再生数増加でソートしてTOP100を取得
        sorted_videos = sorted(videos, key=lambda x: x['play_count_increase'], reverse=True)[:100]
        
        logger.info(f"アカウントタイプ組み合わせ ({account_type}, {second_account_type}): {len(sorted_videos)}件のTOP動画を処理")
        
        # 各動画をデータベースに挿入
        for video in sorted_videos:
            insert_query = """
            INSERT INTO corporate_daily_top100_videos 
            (video_id, fetch_date, account_type, second_account_type, plays_increase, 
             likes_increase, comments_increase, saves_increase, post_time, thumbnail_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                account_type = VALUES(account_type),
                second_account_type = VALUES(second_account_type),
                plays_increase = VALUES(plays_increase),
                likes_increase = VALUES(likes_increase),
                comments_increase = VALUES(comments_increase),
                saves_increase = VALUES(saves_increase),
                post_time = VALUES(post_time),
                thumbnail_url = VALUES(thumbnail_url)
            """
            
            insert_params = [
                video['video_id'],
                collection_date,
                video['account_type'],
                video['second_account_type'],
                video['play_count_increase'],
                video['likes_count_increase'] or 0,
                video['comment_count_increase'] or 0,
                video['save_count_increase'] or 0,
                video['created_at'],
                video['thumbnail_url']
            ]
            
            execute_write_query(insert_query, insert_params)
            total_insert_count += 1
    
    logger.info(f"日付 {collection_date} の企業系動画TOP100ランキング同期が完了しました。")
    logger.info(f"アカウントタイプ組み合わせ数: {len(account_type_groups)}, 総処理件数: {total_insert_count}")

def main():
    """コマンドラインからの実行用メイン関数"""
    parser = argparse.ArgumentParser(description='企業系動画TOP100ランキング同期処理')
    parser.add_argument('--date', type=str, help='特定の日付を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--start', type=str, help='開始日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--end', type=str, help='終了日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--yesterday', action='store_true', help='昨日のデータを処理')
    args = parser.parse_args()
    
    # 引数に基づいて処理を実行
    if args.date:
        result = process_specific_dates([args.date])
    elif args.start or args.end:
        result = process_date_range(args.start, args.end)
    elif args.yesterday:
        result = process_yesterday()
    else:
        result = process_yesterday()  # デフォルトは昨日
    
    print(json.dumps(result, indent=2, default=str))
    return result

if __name__ == "__main__":
    main()
