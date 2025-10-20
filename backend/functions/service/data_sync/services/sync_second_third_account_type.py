import os
import json
import logging
from datetime import datetime
import base64

from core.db_utils import execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()


def sync_second_third_account_type(event, context):
    """
    frontend_data / frontend_corporate_data の second_account_type, third_account_type を
    account_list 経由で corporate_accounts から同期する。

    - frontend_data: parent_account_type = '企業アカウント' のみ対象
    - 両テーブルとも second/third のいずれかが空欄（NULL/空文字）のものだけ更新
    その後、video_history_sync をトリガーする
    """
    logger.info("==== second/third_account_type 同期処理の開始 ====")

    try:
        # Pub/Subメッセージの検証（completed のみ実行）
        if 'data' in event:
            message_data = json.loads(base64.b64decode(event['data']).decode('utf-8'))
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            if message_data.get("status") != "completed":
                logger.info(f"完了メッセージではないためスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Not a completion message"}
        else:
            logger.info("データなしのトリガー実行（手動実行）")

        # 1) frontend_data（企業アカウントのみ）
        update_fd_query = """
        UPDATE frontend_data fad
        INNER JOIN account_list al 
          ON fad.account_name = al.favorite_user_username
        INNER JOIN corporate_accounts ca 
          ON al.id = ca.account_id
        SET 
          fad.second_account_type = ca.second_account_type,
          fad.third_account_type = ca.third_account_type
        WHERE 
          fad.parent_account_type = '企業アカウント'
          AND (
            COALESCE(TRIM(fad.second_account_type), '') = ''
            OR COALESCE(TRIM(fad.third_account_type), '') = ''
          )
        """

        try:
            affected_fd = execute_write_query(update_fd_query)
            logger.info(f"frontend_data 同期完了: {affected_fd} 件更新")
        except Exception as e:
            logger.error(f"frontend_data 同期中にエラー: {str(e)}")

        # 2) frontend_corporate_data
        update_fcd_query = """
        UPDATE frontend_corporate_data fcd
        INNER JOIN account_list al 
          ON fcd.account_name = al.favorite_user_username
        INNER JOIN corporate_accounts ca 
          ON al.id = ca.account_id
        SET 
          fcd.second_account_type = ca.second_account_type,
          fcd.third_account_type = ca.third_account_type
        WHERE 
          (
            COALESCE(TRIM(fcd.second_account_type), '') = ''
            OR COALESCE(TRIM(fcd.third_account_type), '') = ''
          )
        """

        try:
            affected_fcd = execute_write_query(update_fcd_query)
            logger.info(f"frontend_corporate_data 同期完了: {affected_fcd} 件更新")
        except Exception as e:
            logger.error(f"frontend_corporate_data 同期中にエラー: {str(e)}")

        # 次の処理（video_history_sync）へ
        logger.info("動画履歴同期処理のトリガーメッセージを送信します")
        publish_message("video-history-sync", {
            "status": "completed",
            "message": "second/third_account_type 同期が完了しました。動画履歴同期を開始します。",
            "timestamp": datetime.now().isoformat()
        })

        return {
            "status": "success",
            "message": "second/third_account_type 同期が完了しました",
            "execution_time": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"同期処理中にエラーが発生しました: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": str(e), "time": datetime.now().isoformat()}
    finally:
        logger.info("==== second/third_account_type 同期処理の終了 ====")


