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

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def backfill_product_daily_summary(request):
    """
    既存データからproduct_daily_summaryテーブルに過去データを取り込む
    HTTPトリガーで実行可能
    
    Args:
        request (flask.Request): HTTPリクエスト
    
    Returns:
        dict: 処理結果を含むJSON
    """
    logger.info("==== 商品日次集計バックフィル処理の開始 ====")
    
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
            
        # 日付指定がない場合は全ての日付を処理
        return process_all_dates()
        
    except Exception as e:
        error_message = f"商品日次集計バックフィル処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 商品日次集計バックフィル処理の終了 ====")

def process_date_range(start_date=None, end_date=None):
    """期間を指定して商品日次集計を実行する"""
    # 日付の指定がない場合の処理
    jst = timezone('Asia/Tokyo')
    if not end_date:
        end_date = datetime.now(jst).strftime('%Y-%m-%d')
    
    if not start_date:
        start_date = (datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=30)).strftime('%Y-%m-%d')
    
    logger.info(f"バックフィル期間: {start_date} から {end_date}")
    
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

def process_all_dates():
    """全ての日付について商品日次集計を実行する"""
    logger.info("全ての日付に対して商品日次集計を実行します")
    
    # 全ての日付リストを取得
    all_dates_query = """
    SELECT DISTINCT collection_date 
    FROM play_count_history 
    ORDER BY collection_date
    """
    
    dates = execute_query(all_dates_query)
    
    if not dates:
        logger.info("処理対象のデータがありません")
        return {"status": "success", "message": "処理対象のデータがありません"}
    
    # 日付リストを文字列に変換
    date_strings = [date_row['collection_date'].strftime('%Y-%m-%d') for date_row in dates]
    
    # 全ての日付のデータを処理
    return process_specific_dates(date_strings)

def process_specific_dates(date_strings, start_date=None, end_date=None):
    """指定された日付のリストについて商品日次集計を実行する"""
    processed_dates = []
    
    # 各日付について商品データを集計
    for collection_date in date_strings:
        # 商品ごとの集計クエリ
        product_summary_query = """
        INSERT INTO product_daily_summary 
        (fetch_date, product, product_category, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            pm.product_name as product,
            pm.product_category,
            COALESCE(SUM(pch.play_count_increase), 0) as plays_increase,
            COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as over_100k,
            COUNT(DISTINCT CASE 
                WHEN fd.created_at BETWEEN DATE_SUB(%s, INTERVAL 1 DAY) AND %s 
                THEN fd.video_id 
                ELSE NULL 
            END) as post_count
        FROM 
            play_count_history pch
        JOIN 
            frontend_data fd ON pch.video_id = fd.video_id
        JOIN 
            product_master pm ON fd.product = pm.product_name
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
        GROUP BY 
            pm.product_name, pm.product_category
        ON DUPLICATE KEY UPDATE
            plays_increase = VALUES(plays_increase),
            over_100k = VALUES(over_100k),
            post_count = VALUES(post_count)
        """
        
        # クエリを実行
        execute_write_query(product_summary_query, (collection_date, collection_date, collection_date, collection_date))
        logger.info(f"日付 {collection_date} の商品日次集計が完了しました")
        processed_dates.append(collection_date)
    
    return {
        "status": "success",
        "message": "商品日次集計バックフィルが完了しました",
        "start_date": start_date,
        "end_date": end_date,
        "processed_dates": processed_dates,
        "execution_time": datetime.now().isoformat()
    }

def main():
    """コマンドラインからの実行用メイン関数"""
    parser = argparse.ArgumentParser(description='商品日次集計バックフィル処理')
    parser.add_argument('--date', type=str, help='特定の日付を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--start', type=str, help='開始日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--end', type=str, help='終了日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--all', action='store_true', help='全ての日付を処理')
    args = parser.parse_args()
    
    # 引数に基づいて処理を実行
    if args.date:
        result = process_specific_dates([args.date])
    elif args.start or args.end or not args.all:
        result = process_date_range(args.start, args.end)
    else:
        result = process_all_dates()
    
    print(json.dumps(result, indent=2, default=str))
    return result

if __name__ == "__main__":
    main()
