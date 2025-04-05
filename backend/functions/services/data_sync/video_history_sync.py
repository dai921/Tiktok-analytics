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

def sync_video_history(event, context):
    """
    video_masterの情報をvideo_view_historyに同期する
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== 動画履歴同期処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
        else:
            logger.info("データなしのトリガー実行")
            message_data = {}
        
        # 完了ステータスのメッセージかどうかを確認
        if message_data.get("status") != "completed":
            logger.info(f"処理完了以外のステータスのため、同期をスキップします: {message_data.get('status')}")
            return {"status": "skipped", "reason": "Not a completion message"}
        
        # 集計日（現在日付の前日）- UTC+9で計算
        collection_date = (datetime.now() + timedelta(hours=9) - timedelta(days=1)).strftime('%Y-%m-%d')
        
        # video_masterからデータを取得して同期
        sync_query = """
        INSERT INTO play_count_history 
        (video_id, video_url, collection_date, play_count_increase)
        SELECT 
            video_id,
            url,
            %s as collection_date,
            playCountIncrease
        FROM 
            video_master
        WHERE 
            video_id IS NOT NULL
            AND playCountIncrease IS NOT NULL
        ON DUPLICATE KEY UPDATE
            play_count_increase = VALUES(play_count_increase)
        """
        
        # クエリを実行
        execute_write_query(sync_query, (collection_date,))
        
        logger.info(f"動画履歴の同期が完了しました。収集日: {collection_date}")
        
        return {
            "status": "success",
            "message": "動画履歴の同期が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"同期処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 動画履歴同期処理の終了 ====") 