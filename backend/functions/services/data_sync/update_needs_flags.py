import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def update_needs_flags(event, context):
    """
    PubSubトリガーで実行される関数。以下の処理を行う
    1. video_light_raw_dataのneeds_updateフラグを更新
    2. frontend_dataの増加数カウンタをリセット
    3. video_masterのfront_needs_updateフラグをリセット
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== フラグ更新処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        pubsub_message = base64.b64decode(event['data']).decode('utf-8')
        message_data = json.loads(pubsub_message)
        logger.info(f"Pub/Subメッセージを受信: {message_data}")
        
        # 完了ステータスのメッセージかどうかを確認
        if message_data.get("status") != "completed":
            logger.info(f"処理完了以外のステータスのため、更新をスキップします: {message_data.get('status')}")
            return {"status": "skipped", "reason": "Not a completion message"}
        
        # 1. video_light_raw_dataのneeds_updateフラグを更新
        logger.info("1. video_light_raw_dataのneeds_updateフラグの更新を開始")
        update_raw_data_query = """
        UPDATE video_light_raw_data AS vl
        JOIN   video_master        AS vm ON vm.video_id = vl.video_id
        SET    vl.needs_update = 0
        WHERE  vl.needs_update = 1
          AND  vm.created_at < DATE_SUB(CURDATE(), INTERVAL 9 DAY)
          AND  vm.playCountIncrease < 1000;
        """
        
        raw_data_affected_rows = execute_write_query(update_raw_data_query)
        logger.info(f"video_light_raw_dataの更新完了: {raw_data_affected_rows}件更新")
        
        # 2. frontend_dataの増加数カウンタをリセット
        logger.info("2. frontend_dataの増加数カウンタのリセットを開始")
        reset_frontend_data_query = """
        UPDATE frontend_data
        SET play_count_increase = 0,
            likes_count_increase = 0,
            comment_count_increase = 0,
            save_count_increase = 0
        WHERE video_id IN (
            SELECT video_id 
            FROM video_master 
            WHERE front_needs_update = 0
        );
        """
        
        frontend_data_affected_rows = execute_write_query(reset_frontend_data_query)
        logger.info(f"frontend_dataの更新完了: {frontend_data_affected_rows}件更新")
        
        # 3. video_masterのfront_needs_updateを全て0にする
        logger.info("3. video_masterのfront_needs_updateフラグの更新を開始")
        reset_master_flag_query = """
        UPDATE video_master
        SET front_needs_update = 0
        WHERE front_needs_update = 1;
        """
         # 3.5 video_masterのplay_needs_updateを全て0にする
        logger.info("3.5 video_masterのplay_needs_updateフラグの更新を開始")
        reset_play_needs_update_query = """
        UPDATE video_master
        SET play_needs_update = 0
        WHERE play_needs_update = 1;
        """
        

        master_affected_rows = execute_write_query(reset_master_flag_query)
        logger.info(f"video_masterの更新完了: {master_affected_rows}件更新")
        
        # 4. video_masterのis_new_videoを全て0にする
        logger.info("4. video_masterのis_new_videoフラグの更新を開始")
        reset_is_new_video_query = """
        UPDATE video_master
        SET is_new_video = 0
        WHERE is_new_video = 1;
        """
        
        is_new_video_affected_rows = execute_write_query(reset_is_new_video_query)
        logger.info(f"video_masterのis_new_video更新完了: {is_new_video_affected_rows}件更新")
        
        # 処理完了後、video_history_syncにPub/Subメッセージを送信
        logger.info("動画履歴同期処理のトリガーメッセージを送信します")
        publish_message("video-history-sync", {
            "status": "completed",
            "message": "フラグ更新処理が完了しました。動画履歴同期処理を開始します。",
            "timestamp": datetime.now().isoformat()
        })
        
        return {
            "status": "success",
            "message": "フラグ更新処理が完了しました",
            "raw_data_affected": raw_data_affected_rows,
            "frontend_data_affected": frontend_data_affected_rows,
            "master_affected": master_affected_rows,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"フラグ更新処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== フラグ更新処理の終了 ====") 