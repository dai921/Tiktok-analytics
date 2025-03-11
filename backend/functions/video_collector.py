import os
import mysql.connector
import logging
from google.cloud import pubsub_v1
from typing import List, Dict, Any, Tuple
from datetime import datetime
import functions_framework
import pymysql

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_db_connection():
    """データベース接続を取得する"""
    host = "localhost"
    port = 3306
    user = "tiktok_user"
    password = "tiktok_pass"
    database = "tiktok_data"
    
    try:
        logger.info(f"データベース接続試行: '{host}':{port}/{database} ユーザー: '{user}'")
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5
        )
        logger.info("データベース接続成功!")
        return connection
    except Exception as e:
        logger.error(f"データベース接続エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise

class ProcessingManager:
    def __init__(self, processor_name: str, target_table: str):
        self.processor_name = processor_name
        self.target_table = target_table

    def update_last_processed_time(self):
        """最終処理時間を更新"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                sql = """
                UPDATE processing_cursors
                SET last_reset_time = NOW(),
                    updated_at = NOW()
                WHERE processor_name = %s AND target_table = %s
                """
                cursor.execute(sql, (self.processor_name, self.target_table))
                conn.commit()
                logger.info("最終処理時間を更新しました")
        finally:
            if conn:
                conn.close()

class VideoCollector:
    def __init__(self):
        # PubSub設定
        if not os.getenv('PUBSUB_EMULATOR_HOST'):
            os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
        
        self.project_id = os.getenv('PROJECT_ID', 'local-project')
        self.publisher = pubsub_v1.PublisherClient()
        self.topic_path = self.publisher.topic_path(
            self.project_id, 'video-processing'
        )
        self.processing_manager = ProcessingManager('video_collector', 'video_url_data')

    def get_videos_to_update(self) -> List[Dict[str, Any]]:
        """更新が必要なすべてのビデオデータを一度に取得"""
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                query = """
                    SELECT 
                        id,
                        video_url,
                        username,
                        video_id,
                        is_new_video,
                        content_type
                    FROM 
                        video_url_data
                    WHERE 
                        needs_update = TRUE
                    ORDER BY 
                        id
                """
                cursor.execute(query)
                results = cursor.fetchall()
                
                logger.info(f"取得した動画数: {len(results)}")
                
                return results
        except Exception as e:
            logger.error(f"データ取得エラー: {str(e)}")
            raise
        finally:
            if 'conn' in locals() and conn:
                conn.close()

    def publish_video_data(self, video_data: Dict[str, Any]) -> str:
        """動画データをPub/Subに送信"""
        try:
            # メッセージデータを文字列に変換
            import json
            message_data = json.dumps(video_data).encode('utf-8')
            
            # メッセージを送信
            future = self.publisher.publish(self.topic_path, message_data)
            message_id = future.result()
            logger.info(f"メッセージを送信しました。Message ID: {message_id}")
            return message_id
        except Exception as e:
            logger.error(f"メッセージの送信に失敗: {str(e)}")
            raise

    def process_videos(self) -> Dict[str, Any]:
        """すべての更新が必要な動画データを取得してPub/Subに送信"""
        try:
            # 更新が必要な動画をすべて取得
            videos = self.get_videos_to_update()
            
            if not videos:
                return {
                    "success": True,
                    "message": "処理対象の動画がありません",
                    "processed_count": 0
                }
            
            # 各動画データをPub/Subに送信
            processed_videos = []
            for video in videos:
                message_id = self.publish_video_data(video)
                processed_videos.append({
                    "video_id": video['video_id'],
                    "message_id": message_id
                })
                logger.info(f"動画ID {video['video_id']} のデータを送信しました")
            
            # 処理完了後に最終処理時間を更新
            self.processing_manager.update_last_processed_time()
            
            return {
                "success": True,
                "message": f"{len(videos)}件の動画を処理しました",
                "processed_count": len(processed_videos),
                "processed_videos": processed_videos
            }
            
        except Exception as e:
            logger.error(f"動画処理中にエラーが発生: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "processed_count": 0
            }

@functions_framework.http
def collect_videos(request):
    """HTTPリクエストハンドラ"""
    logger.info("==== collect_videos関数の実行開始 ====")
    logger.info(f"リクエストメソッド: {request.method}")
    
    try:
        # VideoCollectorのインスタンスを作成し、処理を実行
        collector = VideoCollector()
        result = collector.process_videos()
        
        # 結果をログ出力
        status_code = 200 if result.get("success", False) else 500
        logger.info(f"処理完了 - ステータス: {status_code}")
        logger.info(f"処理結果: {result}")
        
        return result, status_code
        
    except ValueError as e:
        # パラメータのパース失敗など
        logger.error(f"不正なリクエスト: {str(e)}")
        return {
            "success": False,
            "error": f"Invalid request: {str(e)}"
        }, 400
        
    except Exception as e:
        # 予期せぬエラー
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }, 500
    finally:
        logger.info("==== collect_videos関数の実行終了 ====")

if __name__ == "__main__":
    logger.info("==== 処理開始 ====")
    try:
        collector = VideoCollector()
        result = collector.process_videos()
        
        if result["success"]:
            logger.info(f"処理が成功しました: {result['processed_count']}件の動画を処理")
        else:
            logger.error(f"処理中にエラーが発生しました: {result.get('error')}")
            
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise
    finally:
        logger.info("==== 処理終了 ====")
