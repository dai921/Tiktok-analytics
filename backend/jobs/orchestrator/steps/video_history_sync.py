import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from backend.jobs.core.db_utils import execute_query, execute_write_query
from backend.jobs.core.config import initialize_config
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def sync_video_history(collection_date: Optional[str] = None) -> Dict[str, Any]:
    """
    frontend_dataの情報をplay_count_historyに同期する（非Pub/Sub）
    """
    logger.info("==== 動画履歴同期処理の開始 ====")

    try:
        # 集計日（デフォルト: JST基準で2日前）
        if collection_date is None:
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')

        # 履歴データの同期クエリ
        sync_query = """
        INSERT INTO play_count_history 
        (video_id, video_url, collection_date, 
         play_count, likes_count, comment_count, save_count,
         play_count_increase, likes_count_increase, 
         comment_count_increase, save_count_increase,parent_account_type)
        SELECT 
            video_id,
            url,
            %s as collection_date,
            play_count,
            likes_count,
            comment_count,
            save_count,
            play_count_increase,
            likes_count_increase,
            comment_count_increase,
            save_count_increase,
            parent_account_type
        FROM 
            frontend_data
        WHERE 
            video_id IS NOT NULL
            AND play_count_increase IS NOT NULL
        ON DUPLICATE KEY UPDATE
            play_count = VALUES(play_count),
            likes_count = VALUES(likes_count),
            comment_count = VALUES(comment_count),
            save_count = VALUES(save_count),
            play_count_increase = VALUES(play_count_increase),
            likes_count_increase = VALUES(likes_count_increase),
            comment_count_increase = VALUES(comment_count_increase),
            save_count_increase = VALUES(save_count_increase),
            parent_account_type = VALUES(parent_account_type)
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
