import os
import json
import logging
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

def update_product_top100_videos(event, context):
    """
    summary_table_syncの後に実行され、product_daily_top100_videosテーブルとgenre_daily_top100_videosテーブルを更新する
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== 商品・ジャンル別TOP100動画更新処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            
            # 商品日次集計からの完了メッセージを確認
            if message_data.get("status") != "success":
                logger.info(f"summary_table_syncが成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            # 収集日を取得
            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) - timedelta(days=1)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")
        
        # 商品別TOP100動画を更新
        update_product_top100_by_date(collection_date)
        
        # ジャンル別TOP100動画を更新
        update_genre_top100_by_date(collection_date)
        
        logger.info(f"商品・ジャンル別TOP100動画更新が完了しました。収集日: {collection_date}")
        
        return {
            "status": "success",
            "message": "商品・ジャンル別TOP100動画更新が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"商品・ジャンル別TOP100動画更新処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 商品・ジャンル別TOP100動画更新処理の終了 ====")

def update_product_top100_by_date(collection_date):
    """
    指定された日付の商品別TOP100動画を更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== 商品別TOP100動画更新処理の開始 ====")
    
    try:
        # 全商品リストを取得（カテゴリが空または'複数'のものを除外）
        products_query = """
        SELECT DISTINCT product_name, product_category 
        FROM product_master
        WHERE product_category != '' AND product_category != '複数'
        """
        products = execute_query(products_query)
        
        for product in products:
            product_name = product['product_name']
            product_category = product['product_category']
            
            logger.info(f"商品 '{product_name}' のTOP100動画を処理中...")
            
            # 既存のデータを削除（同じ日付・商品の組み合わせ）
            delete_query = """
            DELETE FROM product_daily_top100_videos
            WHERE fetch_date = %s AND product = %s
            """
            execute_write_query(delete_query, (collection_date, product_name))
            
            # 商品別TOP100動画を取得して挿入
            insert_query = """
            INSERT INTO product_daily_top100_videos 
            (video_id, fetch_date, product, product_category, plays_increase, likes_increase, post_time, thumbnail_url)
            SELECT 
                fd.video_id,
                %s as fetch_date,
                fd.product,
                %s as product_category,
                fd.play_count_increase as plays_increase,
                fd.likes_count_increase as likes_increase,
                fd.created_at as post_time,
                fd.thumbnail_url
            FROM 
                frontend_data fd
            WHERE 
                fd.product = %s
                AND fd.created_at <= %s
                AND fd.play_count_increase IS NOT NULL
                AND fd.likes_count_increase IS NOT NULL
            ORDER BY 
                fd.play_count_increase DESC, fd.video_id DESC
            LIMIT 100
            """
            
            execute_write_query(insert_query, (collection_date, product_category, product_name, collection_date))
            
            logger.info(f"商品 '{product_name}' のTOP100動画を更新しました")
        
        logger.info(f"全商品のTOP100動画更新が完了しました。収集日: {collection_date}")
    
    except Exception as e:
        error_message = f"商品別TOP100動画更新処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== 商品別TOP100動画更新処理の終了 ====")

def update_genre_top100_by_date(collection_date):
    """
    指定された日付のジャンル別TOP100動画を更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== ジャンル別TOP100動画更新処理の開始 ====")
    
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
        genres = execute_query(genres_query)
        
        # 各ジャンルに対してTOP100動画を挿入
        for genre in genres:
            genre_name = genre['video_genre']
            
            logger.info(f"ジャンル '{genre_name}' のTOP100動画を処理中...")
            
            # 既存のデータを削除（同じ日付・ジャンルの組み合わせ）
            delete_query = """
            DELETE FROM genre_daily_top100_videos
            WHERE fetch_date = %s AND video_genre = %s
            """
            execute_write_query(delete_query, (collection_date, genre_name))
            
            # ジャンル別TOP100動画を取得して挿入
            insert_query = """
            INSERT INTO genre_daily_top100_videos 
            (video_id, fetch_date, video_genre, plays_increase, likes_increase, post_time, thumbnail_url)
            SELECT 
                fd.video_id,
                %s as fetch_date,
                %s as video_genre,
                fd.play_count_increase as plays_increase,
                fd.likes_count_increase as likes_increase,
                fd.created_at as post_time,
                fd.thumbnail_url
            FROM 
                frontend_data fd
            CROSS JOIN 
                (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
            WHERE 
                fd.category IS NOT NULL
                AND fd.category != ''
                AND fd.created_at <= %s
                AND n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
                AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
                AND fd.play_count_increase IS NOT NULL
                AND fd.likes_count_increase IS NOT NULL
                AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) = %s
            ORDER BY 
                fd.play_count_increase DESC, fd.video_id DESC
            LIMIT 100
            """
            
            execute_write_query(insert_query, (collection_date, genre_name, collection_date, genre_name))
            
            logger.info(f"ジャンル '{genre_name}' のTOP100動画を更新しました")
        
        logger.info(f"全ジャンルのTOP100動画更新が完了しました。収集日: {collection_date}")
    
    except Exception as e:
        error_message = f"ジャンル別TOP100動画更新処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== ジャンル別TOP100動画更新処理の終了 ====")
