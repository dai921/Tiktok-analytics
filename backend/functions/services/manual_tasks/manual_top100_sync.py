import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from flask import jsonify, Request
import argparse
import sys

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def collect_historical_top100_videos(request):
    """
    既存データからproduct_daily_top100_videosテーブルとgenre_daily_top100_videosテーブルにデータを収集するHTTPトリガー関数
    
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        flask.Response: 処理結果のJSONレスポンス
    """
    logger.info("==== 過去データの商品・ジャンル別TOP100動画収集処理の開始 ====")
    
    try:
        # リクエストパラメータを取得
        request_json = request.get_json(silent=True)
        
        # 日付範囲の取得（指定がなければデフォルト値を使用）
        start_date = request_json.get('start_date') if request_json else None
        end_date = request_json.get('end_date') if request_json else None
        product = request_json.get('product') if request_json else None
        genre = request_json.get('genre') if request_json else None
        data_type = request_json.get('type', 'both') if request_json else 'both'  # product, genre, both
        
        if not start_date:
            # デフォルトは90日前から
            start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        
        if not end_date:
            # デフォルトは昨日まで
            end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        result = process_top100_data(start_date, end_date, product, genre, data_type)
        return jsonify(result)
        
    except Exception as e:
        error_message = f"過去データのTOP100動画収集処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        return jsonify({
            "status": "error", 
            "error": error_message, 
            "time": datetime.now().isoformat()
        }), 500
    
    finally:
        logger.info("==== 過去データの商品・ジャンル別TOP100動画収集処理の終了 ====")

def process_top100_data(start_date, end_date, specific_product=None, specific_genre=None, data_type='both'):
    """
    指定された日付範囲のTOP100動画データを処理する
    
    Args:
        start_date (str): 開始日（YYYY-MM-DD形式）
        end_date (str): 終了日（YYYY-MM-DD形式）
        specific_product (str, optional): 特定の商品名（指定した場合はその商品のみ処理）
        specific_genre (str, optional): 特定のジャンル名（指定した場合はそのジャンルのみ処理）
        data_type (str): 処理するデータ種別 ('product', 'genre', 'both')
    Returns:
        dict: 処理結果
    """
    # 処理対象の日付リストを取得
    date_query = """
    SELECT DISTINCT collection_date 
    FROM play_count_history
    WHERE collection_date BETWEEN %s AND %s
    ORDER BY collection_date
    """
    dates = execute_query(date_query, (start_date, end_date))
    
    if not dates:
        return {
            "status": "warning",
            "message": f"指定期間 {start_date} から {end_date} のデータが見つかりませんでした"
        }
    
    results = {
        "product": {"processed_count": 0, "success_count": 0, "error_count": 0},
        "genre": {"processed_count": 0, "success_count": 0, "error_count": 0}
    }
    
    # 商品データの処理
    if data_type in ['product', 'both']:
        process_product_top100(dates, specific_product, results["product"])
    
    # ジャンルデータの処理
    if data_type in ['genre', 'both']:
        process_genre_top100(dates, specific_genre, results["genre"])
    
    # 検証結果の検証
    validation_issues = []
    
    return {
        "status": "success",
        "message": "過去データの商品・ジャンル別TOP100動画収集が完了しました",
        "start_date": start_date,
        "end_date": end_date,
        "results": results,
        "execution_time": datetime.now().isoformat(),
        "validation_issues": validation_issues,
        "has_issues": len(validation_issues) > 0
    }

def process_product_top100(dates, specific_product=None, result_counter=None):
    """
    商品別TOP100動画データを処理する
    
    Args:
        dates (list): 処理対象の日付リスト
        specific_product (str, optional): 特定の商品名
        result_counter (dict): 処理結果カウンター
    """
    if result_counter is None:
        result_counter = {"processed_count": 0, "success_count": 0, "error_count": 0}
    
    # 商品リストを取得（カテゴリが空または'複数'のものを除外）
    products_query = """
    SELECT DISTINCT product_name, product_category 
    FROM product_master
    WHERE product_category != '' AND product_category != '複数'
    """
    
    # 特定の商品が指定されている場合は条件を追加
    if specific_product:
        products_query += " AND product_name = %s"
        products = execute_query(products_query, (specific_product,))
    else:
        products = execute_query(products_query)
    
    # 日付と商品の組み合わせごとに処理
    for date_obj in dates:
        collection_date = date_obj['collection_date']
        logger.info(f"日付 {collection_date} の商品TOP100処理を開始")
        
        for product in products:
            product_name = product['product_name']
            product_category = product['product_category']
            
            # 各日付・商品の組み合わせで、まず既存のランキングデータを削除
            # これは一貫性を保つために必要（部分的な更新を避けるため）
            delete_query = """
            DELETE FROM product_daily_top100_videos
            WHERE fetch_date = %s AND product = %s
            """
            execute_write_query(delete_query, (collection_date, product_name))
            
            # 商品別TOP100動画を一括挿入（改善版 - ランク付け排除）
            insert_query = """
            INSERT INTO product_daily_top100_videos 
            (video_id, fetch_date, product, product_category, plays_increase, likes_increase, post_time, thumbnail_url)
            SELECT 
                pch.video_id,
                %s as fetch_date,
                fd.product,
                %s as product_category,
                pch.play_count_increase as plays_increase,
                pch.likes_count_increase as likes_increase,
                fd.created_at as post_time,
                fd.thumbnail_url
            FROM 
                play_count_history pch
            JOIN 
                frontend_data fd ON pch.video_id = fd.video_id
            WHERE 
                fd.product = %s
                AND pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
                AND pch.likes_count_increase IS NOT NULL
            ORDER BY 
                pch.play_count_increase DESC, pch.video_id DESC
            LIMIT 100
            """
            
            try:
                execute_write_query(insert_query, (collection_date, product_category, product_name, collection_date))
                result_counter["success_count"] += 1
                logger.info(f"商品 '{product_name}' の日付 {collection_date} のデータを処理しました")
            except Exception as e:
                result_counter["error_count"] += 1
                logger.error(f"商品 '{product_name}' の日付 {collection_date} の処理中にエラー発生: {str(e)}")
                # エラーが発生しても処理を続行
                continue
            
            result_counter["processed_count"] += 1
        
        logger.info(f"日付 {collection_date} の商品TOP100処理が完了しました")
    
    logger.info(f"過去データの商品別TOP100動画収集が完了しました。処理件数: {result_counter['processed_count']}、成功: {result_counter['success_count']}、エラー: {result_counter['error_count']}")

def process_genre_top100(dates, specific_genre=None, result_counter=None):
    """
    ジャンル別TOP100動画データを処理する
    
    Args:
        dates (list): 処理対象の日付リスト
        specific_genre (str, optional): 特定のジャンル名
        result_counter (dict): 処理結果カウンター
    """
    if result_counter is None:
        result_counter = {"processed_count": 0, "success_count": 0, "error_count": 0}
    
    for date_obj in dates:
        collection_date = date_obj['collection_date']
        logger.info(f"日付 {collection_date} のジャンルTOP100処理を開始")
        
        try:
            # 一時テーブルを使わずに直接ジャンルリストを取得
            genres_query = """
            SELECT DISTINCT 
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS video_genre
            FROM 
                frontend_data fd
            CROSS JOIN 
                (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
            WHERE 
                fd.category IS NOT NULL
                AND fd.category != ''
                AND n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
                AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
            HAVING 
                video_genre != ''
            """
            
            # 特定のジャンルが指定されている場合は条件を追加
            if specific_genre:
                genres_query += " AND video_genre = %s"
                genres = execute_query(genres_query, (specific_genre,))
            else:
                genres = execute_query(genres_query)
            
            # 各ジャンルに対してTOP100動画を処理
            for genre in genres:
                genre_name = genre['video_genre']
                
                # 既存のデータを削除
                delete_query = """
                DELETE FROM genre_daily_top100_videos
                WHERE fetch_date = %s AND video_genre = %s
                """
                execute_write_query(delete_query, (collection_date, genre_name))
                
                # ジャンル別TOP100動画を挿入（一時テーブル不使用）
                insert_query = """
                INSERT INTO genre_daily_top100_videos 
                (video_id, fetch_date, video_genre, plays_increase, likes_increase, post_time, thumbnail_url)
                SELECT 
                    pch.video_id,
                    %s as fetch_date,
                    %s as video_genre,
                    pch.play_count_increase as plays_increase,
                    pch.likes_count_increase as likes_increase,
                    fd.created_at as post_time,
                    fd.thumbnail_url
                FROM 
                    play_count_history pch
                JOIN 
                    frontend_data fd ON pch.video_id = fd.video_id
                CROSS JOIN 
                    (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
                WHERE 
                    pch.collection_date = %s
                    AND fd.category IS NOT NULL
                    AND fd.category != ''
                    AND n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
                    AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
                    AND pch.play_count_increase IS NOT NULL
                    AND pch.likes_count_increase IS NOT NULL
                    AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) = %s
                ORDER BY 
                    pch.play_count_increase DESC, pch.video_id DESC
                LIMIT 100
                """
                
                try:
                    execute_write_query(insert_query, (collection_date, genre_name, collection_date, genre_name))
                    result_counter["success_count"] += 1
                    logger.info(f"ジャンル '{genre_name}' の日付 {collection_date} のデータを処理しました")
                except Exception as e:
                    result_counter["error_count"] += 1
                    logger.error(f"ジャンル '{genre_name}' の日付 {collection_date} の処理中にエラー発生: {str(e)}")
                    continue
                
                result_counter["processed_count"] += 1
            
        except Exception as e:
            logger.error(f"日付 {collection_date} のジャンル処理中にエラー発生: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            continue
            
        logger.info(f"日付 {collection_date} のジャンルTOP100処理が完了しました")
    
    logger.info(f"過去データのジャンル別TOP100動画収集が完了しました。処理件数: {result_counter['processed_count']}、成功: {result_counter['success_count']}、エラー: {result_counter['error_count']}")

def main():
    """
    コマンドラインからの実行用メイン関数
    """
    parser = argparse.ArgumentParser(description='商品・ジャンル別TOP100動画の過去データ収集')
    parser.add_argument('--start-date', type=str, help='処理開始日 (YYYY-MM-DD形式)')
    parser.add_argument('--end-date', type=str, help='処理終了日 (YYYY-MM-DD形式)')
    parser.add_argument('--product', type=str, help='特定の商品のみ処理する場合の商品名')
    parser.add_argument('--genre', type=str, help='特定のジャンルのみ処理する場合のジャンル名')
    parser.add_argument('--type', type=str, choices=['product', 'genre', 'both'], default='both',
                        help='処理するデータ種別 (product/genre/both)')
    
    args = parser.parse_args()
    
    # デフォルト値の設定
    start_date = args.start_date
    end_date = args.end_date
    specific_product = args.product
    specific_genre = args.genre
    data_type = args.type
    
    if not start_date:
        # デフォルトは90日前
        start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        print(f"開始日が指定されていないため、デフォルト値 {start_date} を使用します")
    
    if not end_date:
        # デフォルトは昨日
        end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        print(f"終了日が指定されていないため、デフォルト値 {end_date} を使用します")
    
    if specific_product:
        print(f"特定の商品 '{specific_product}' のみを処理します")
    
    if specific_genre:
        print(f"特定のジャンル '{specific_genre}' のみを処理します")
    
    print(f"処理期間: {start_date} から {end_date}")
    print(f"処理タイプ: {data_type}")
    
    # データ処理を実行
    result = process_top100_data(start_date, end_date, specific_product, specific_genre, data_type)
    
    # 結果を表示
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    return 0

# スクリプトとして直接実行された場合
if __name__ == "__main__":
    sys.exit(main())
