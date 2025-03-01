import mysql.connector
from mysql.connector import Error
from datetime import datetime, timedelta
import logging
import os
from typing import Dict, Any
import functions_framework
import json
import base64
from google.cloud import pubsub_v1

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数を取得
environment = os.getenv('ENVIRONMENT', 'development')
pubsub_host = os.getenv('PUBSUB_EMULATOR_HOST')
project_id = os.getenv('PROJECT_ID', 'local-project')

# Pub/Sub設定
SUBSCRIPTION_NAME = "trigger-video-url-data-update"

if environment == 'development':
    os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
    logger.info(f"開発環境: Pub/Subエミュレータを使用 ({pubsub_host})")
else:
    logger.info(f"本番環境: GCPマネージドPub/Subを使用 (プロジェクト: {project_id})")

# Pub/Subクライアントの初期化
subscriber = pubsub_v1.SubscriberClient()
subscription_path = subscriber.subscription_path(project_id, SUBSCRIPTION_NAME)

class VideoUrlDataUpdater:
    def __init__(self):
        self.config = {
            'host': os.environ.get('MYSQL_HOST', 'localhost'),
            'user': os.environ.get('MYSQL_USER', 'tiktok_user'),
            'password': os.environ.get('MYSQL_PASSWORD', 'tiktok_pass'),
            'database': os.environ.get('MYSQL_DATABASE', 'tiktok_data'),
            'port': int(os.environ.get('MYSQL_PORT', 3306))
        }
        self.conn = None
        self.cursor = None

    def connect(self):
        try:
            self.conn = mysql.connector.connect(**self.config)
            self.cursor = self.conn.cursor(dictionary=True)
            logger.info("MySQLデータベースに接続しました")
        except Error as e:
            logger.error(f"MySQL接続エラー: {str(e)}")
            raise

    def close(self):
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("MySQLデータベース接続を閉じました")

    def update_needs_update_flag(self) -> Dict[str, Any]:
        try:
            self.connect()
            logger.info("video_url_dataの更新フラグ更新を開始")
            
            # 15日前の日付を計算
            fifteen_days_ago = (datetime.now() - timedelta(days=15)).date()
            
            update_query = """
            UPDATE video_url_data vud
            INNER JOIN video_master vm ON vud.video_id = vm.video_id
            SET vud.needs_update = TRUE
            WHERE 
                (
                    (vm.created_at >= %s AND (vm.playCountIncrease > 0 OR vm.playCountIncrease IS NULL))
                    OR vm.created_at IS NULL
                )
                AND vud.needs_update = FALSE
                AND (vm.status != 'deleted' OR vm.status IS NULL)
            """
            
            self.cursor.execute(update_query, (fifteen_days_ago,))
            updated_count = self.cursor.rowcount
            self.conn.commit()
            
            logger.info(f"更新完了: {updated_count}件のレコードを更新")
            
            return {
                "status": "success",
                "updated_count": updated_count,
                "execution_time": datetime.now().isoformat()
            }
            
        except Exception as e:
            if self.conn:
                self.conn.rollback()
            logger.error(f"更新処理中にエラーが発生: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "execution_time": datetime.now().isoformat()
            }
            
        finally:
            self.close()

@functions_framework.cloud_event
def update_video_url_data(cloud_event):
    """
    Pub/Subメッセージで実行される関数
    """
    start_time = datetime.now()

    try:
        # Pub/Subメッセージの処理
        if cloud_event.data:
            data = base64.b64decode(cloud_event.data["message"]["data"]).decode()
            logger.info(f"Pub/Subメッセージを受信: {data}")

        logger.info(f"同期処理開始: {start_time}")

        updater = VideoUrlDataUpdater()
        result = updater.update_needs_update_flag()
        
        execution_time = (datetime.now() - start_time).total_seconds()
        result["execution_time_seconds"] = execution_time
        
        logger.info(f"同期処理完了: {result}")
        return json.dumps(result), 200 if result["status"] == "success" else 500
        
    except Exception as e:
        error_message = f"予期せぬエラーが発生: {str(e)}"
        logger.error(error_message)
        return json.dumps({
            "status": "error",
            "error": error_message,
            "execution_time": datetime.now().isoformat()
        }), 500

if __name__ == "__main__":
    try:
        logger.info("video_url_dataの更新処理を直接実行します")
        updater = VideoUrlDataUpdater()
        result = updater.update_needs_update_flag()
        logger.info(f"実行結果: {result}")
    except Exception as e:
        logger.error(f"実行中にエラーが発生: {str(e)}")