import os
import mysql.connector
import logging
from google.cloud import pubsub_v1
from typing import List, Dict, Any

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VideoCollector:
    def __init__(self, batch_size: int = 500):
        self.batch_size = batch_size
        # データベース接続設定
        self.connection = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST', 'localhost'),
            port=int(os.getenv('MYSQL_PORT', 3306)),
            user=os.getenv('MYSQL_USER', 'tiktok_user'),
            password=os.getenv('MYSQL_PASSWORD', 'tiktok_pass'),
            database=os.getenv('MYSQL_DATABASE', 'tiktok_data')
        )
        self.cursor = self.connection.cursor(dictionary=True)

        # PubSub設定
        if not os.getenv('PUBSUB_EMULATOR_HOST'):
            os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
        
        self.project_id = os.getenv('PROJECT_ID', 'local-project')
        self.publisher = pubsub_v1.PublisherClient()
        self.topic_path = self.publisher.topic_path(
            self.project_id, 'video-processing'
        )

    def get_videos_to_update(self) -> List[Dict[str, Any]]:
        """needs_updateがTrueのビデオデータを取得"""
        try:
            query = """
                SELECT 
                    video_url,
                    username,
                    video_id,
                    is_new_video
                FROM 
                    video_url_data
                WHERE 
                    needs_update = TRUE
                LIMIT %s
            """
            self.cursor.execute(query, (self.batch_size,))
            results = self.cursor.fetchall()
            logger.info(f"取得した動画数: {len(results)}")
            return results
        except mysql.connector.Error as e:
            logger.error(f"データベースエラー: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"予期せぬエラー: {str(e)}")
            raise

    def publish_video_data(self, video_data: Dict[str, Any]) -> None:
        """動画データをPubSubに送信"""
        try:
            # メッセージデータを文字列に変換
            import json
            message_data = json.dumps(video_data).encode('utf-8')
            
            # メッセージを送信
            future = self.publisher.publish(self.topic_path, message_data)
            message_id = future.result()
            logger.info(f"メッセージを送信しました。Message ID: {message_id}")
        except Exception as e:
            logger.error(f"メッセージの送信に失敗: {str(e)}")
            raise

    def process_videos(self) -> None:
        """動画データを取得してPubSubに送信"""
        try:
            # 更新が必要な動画を取得
            videos = self.get_videos_to_update()
            
            # 各動画データをPubSubに送信
            for video in videos:
                self.publish_video_data(video)
                logger.info(f"動画ID {video['video_id']} のデータを送信しました")
        except Exception as e:
            logger.error(f"動画処理中にエラーが発生: {str(e)}")
            raise
        finally:
            # データベース接続をクローズ
            if hasattr(self, 'cursor') and self.cursor:
                self.cursor.close()
            if hasattr(self, 'connection') and self.connection:
                self.connection.close()

def main():
    try:
        collector = VideoCollector()
        collector.process_videos()
        logger.info("全ての動画データの処理が完了しました")
    except Exception as e:
        logger.error(f"エラーが発生しました: {str(e)}")
        raise

if __name__ == "__main__":
    main()
