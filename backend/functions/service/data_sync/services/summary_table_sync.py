import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def update_product_daily_summary(event, context):
    """
    video_history_syncの後に実行され、product_daily_summaryテーブルを更新する
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== 商品日次集計処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            
            # 動画履歴同期からの完了メッセージを確認
            if message_data.get("status") != "success":
                logger.info(f"video_history_syncが成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            # 収集日を取得（video_history_syncから受け取る）
            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")
        
        # 商品ごとの集計クエリ - 修正版
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
        
        logger.info(f"商品日次集計が完了しました。収集日: {collection_date}")
        
        # 動画ジャンル集計も実行
        update_genre_daily_summary(collection_date)
        
        # 次の処理（top100_videos_sync）にメッセージを送信
        logger.info("TOP100動画更新処理のトリガーメッセージを送信します")
        publish_message("top100-videos-sync", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "summary_table_sync",
            "message": "商品・ジャンル日次集計が完了しました。TOP100動画更新処理を開始します。"
        })
        
        return {
            "status": "success",
            "message": "商品・ジャンル日次集計が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"商品日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 商品日次集計処理の終了 ====")

def update_genre_daily_summary(collection_date):
    """
    genre_daily_summaryテーブルを更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== 動画ジャンル日次集計処理の開始 ====")
    
    try:
        # ジャンルごとの集計クエリ
        genre_summary_query = """
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
        GROUP BY 
            video_genre
        ON DUPLICATE KEY UPDATE
            plays_increase = VALUES(plays_increase),
            over_100k = VALUES(over_100k),
            post_count = VALUES(post_count)
        """
        
        # クエリを実行
        execute_write_query(genre_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        logger.info(f"動画ジャンル日次集計が完了しました。収集日: {collection_date}")
        
    except Exception as e:
        error_message = f"動画ジャンル日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== 動画ジャンル日次集計処理の終了 ====")
