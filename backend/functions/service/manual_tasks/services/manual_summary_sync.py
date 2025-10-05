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
    既存データからproduct_daily_summaryテーブルとgenre_daily_summaryテーブルに過去データを取り込む
    HTTPトリガーで実行可能
    
    Args:
        request (flask.Request): HTTPリクエスト
    
    Returns:
        dict: 処理結果を含むJSON
    """
    logger.info("==== 日次集計バックフィル処理の開始 ====")
    
    try:
        # リクエストパラメータの取得
        request_json = request.get_json(silent=True)
        request_args = request.args
        
        # パラメータの解析
        start_date = None
        end_date = None
        specific_date = None
        product_name = None  # 新しく追加
        genre_name = None    # 新しく追加
        
        if request_json:
            start_date = request_json.get('start_date')
            end_date = request_json.get('end_date')
            specific_date = request_json.get('date')
            product_name = request_json.get('product_name')  # 新しく追加
            genre_name = request_json.get('genre_name')      # 新しく追加
        elif request_args:
            start_date = request_args.get('start_date')
            end_date = request_args.get('end_date')
            specific_date = request_args.get('date')
            product_name = request_args.get('product_name')  # 新しく追加
            genre_name = request_args.get('genre_name')      # 新しく追加
        
        # 特定の日付が指定されている場合
        if specific_date:
            return process_specific_dates([specific_date], None, None, product_name, genre_name)
            
        # 期間が指定されている場合
        if start_date or end_date:
            return process_date_range(start_date, end_date, product_name, genre_name)
            
        # 日付指定がない場合は全ての日付を処理
        return process_all_dates(product_name, genre_name)
        
    except Exception as e:
        error_message = f"日次集計バックフィル処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 日次集計バックフィル処理の終了 ====")

def process_date_range(start_date=None, end_date=None, product_name=None, genre_name=None):
    """期間を指定して商品日次集計を実行する"""
    # 日付の指定がない場合の処理
    jst = timezone('Asia/Tokyo')
    if not end_date:
        end_date = datetime.now(jst).strftime('%Y-%m-%d')
    
    if not start_date:
        start_date = (datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=30)).strftime('%Y-%m-%d')
    
    logger.info(f"バックフィル期間: {start_date} から {end_date}")
    if product_name:
        logger.info(f"対象商材: {product_name}")
    if genre_name:
        logger.info(f"対象ジャンル: {genre_name}")
    
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
    return process_specific_dates(date_strings, start_date, end_date, product_name, genre_name)

def process_all_dates(product_name=None, genre_name=None):
    """全ての日付について商品日次集計を実行する"""
    logger.info("全ての日付に対して日次集計を実行します")
    if product_name:
        logger.info(f"対象商材: {product_name}")
    if genre_name:
        logger.info(f"対象ジャンル: {genre_name}")
    
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
    return process_specific_dates(date_strings, None, None, product_name, genre_name)

def process_specific_dates(date_strings, start_date=None, end_date=None, product_name=None, genre_name=None):
    """指定された日付のリストについて商品日次集計とジャンル日次集計を実行する"""
    processed_dates = []
    
    # 各日付について商品データとジャンルデータを集計
    for collection_date in date_strings:
        # 商品ごとの集計を実行（商材フィルター付き）
        if not genre_name:  # ジャンル指定がない場合のみ商品処理
            process_product_summary(collection_date, product_name)
        
        # ジャンルごとの集計を実行（ジャンルフィルター付き）
        if not product_name:  # 商材指定がない場合のみジャンル処理
            process_genre_summary(collection_date, genre_name)
        
        logger.info(f"日付 {collection_date} の日次集計が完了しました")
        processed_dates.append(collection_date)
    
    return {
        "status": "success",
        "message": "商品・ジャンル日次集計バックフィルが完了しました",
        "start_date": start_date,
        "end_date": end_date,
        "product_name": product_name,  # 新しく追加
        "genre_name": genre_name,      # 新しく追加
        "processed_dates": processed_dates,
        "execution_time": datetime.now().isoformat()
    }

def process_product_summary(collection_date, product_name=None):
    """指定された日付の商品日次集計を実行する（商材フィルター付き）"""
    # 商品ごとの集計クエリ（商材フィルター追加）
    base_query = """
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
    """
    
    # 商材フィルター追加
    params = [collection_date, collection_date, collection_date, collection_date]
    if product_name:
        base_query += " AND pm.product_name = %s"
        params.append(product_name)
    
    base_query += """
    GROUP BY 
        pm.product_name, pm.product_category
    ON DUPLICATE KEY UPDATE
        plays_increase = VALUES(plays_increase),
        over_100k = VALUES(over_100k),
        post_count = VALUES(post_count)
    """
    
    # クエリを実行
    execute_write_query(base_query, tuple(params))
    if product_name:
        logger.info(f"日付 {collection_date} の商材 {product_name} の日次集計が完了しました")
    else:
        logger.info(f"日付 {collection_date} の商品日次集計が完了しました")

def process_genre_summary(collection_date, genre_name=None):
    """指定された日付の動画ジャンル日次集計を実行する（ジャンルフィルター付き）"""
    # ジャンルごとの集計クエリ（ジャンルフィルター追加）
    base_query = """
    INSERT INTO genre_daily_summary 
    (fetch_date, video_genre, plays_increase, over_100k, post_count)
    SELECT 
        %s as fetch_date,
        TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS video_genre,
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
    CROSS JOIN 
        (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
    WHERE 
        pch.collection_date = %s
        AND pch.play_count_increase IS NOT NULL
        AND fd.category IS NOT NULL
        AND fd.category != ''
        AND n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
        AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
    """
    
    # ジャンルフィルター追加
    params = [collection_date, collection_date, collection_date, collection_date]
    if genre_name:
        base_query += " AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) = %s"
        params.append(genre_name)
    
    base_query += """
    GROUP BY 
        video_genre
    ON DUPLICATE KEY UPDATE
        plays_increase = VALUES(plays_increase),
        over_100k = VALUES(over_100k),
        post_count = VALUES(post_count)
    """
    
    # クエリを実行
    execute_write_query(base_query, tuple(params))
    if genre_name:
        logger.info(f"日付 {collection_date} のジャンル {genre_name} の日次集計が完了しました")
    else:
        logger.info(f"日付 {collection_date} の動画ジャンル日次集計が完了しました")

def main():
    """コマンドラインからの実行用メイン関数"""
    parser = argparse.ArgumentParser(description='商品・ジャンル日次集計バックフィル処理')
    parser.add_argument('--date', type=str, help='特定の日付を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--start', type=str, help='開始日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--end', type=str, help='終了日を指定 (YYYY-MM-DD形式)')
    parser.add_argument('--all', action='store_true', help='全ての日付を処理')
    parser.add_argument('--product', type=str, help='特定の商材名を指定')  # 新しく追加
    parser.add_argument('--genre', type=str, help='特定のジャンル名を指定')    # 新しく追加
    args = parser.parse_args()
    
    # 引数に基づいて処理を実行
    if args.date:
        result = process_specific_dates([args.date], None, None, args.product, args.genre)
    elif args.start or args.end or not args.all:
        result = process_date_range(args.start, args.end, args.product, args.genre)
    else:
        result = process_all_dates(args.product, args.genre)
    
    print(json.dumps(result, indent=2, default=str))
    return result

if __name__ == "__main__":
    main()
