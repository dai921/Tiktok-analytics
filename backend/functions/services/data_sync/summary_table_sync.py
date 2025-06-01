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
        
        return {
            "status": "success",
            "message": "商品日次集計が完了しました",
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
