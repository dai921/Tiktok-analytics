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

class CursorManager:
    def __init__(self, processor_name: str, target_table: str):
        self.processor_name = processor_name
        self.target_table = target_table
        self.conn = None

    def get_cursor_state(self) -> Dict[str, Any]:
        """カーソルの状態を取得"""
        try:
            self.conn = get_db_connection()
            with self.conn.cursor() as cursor:
                sql = """
                SELECT last_cursor_id, last_reset_time, batch_size, reset_interval
                FROM processing_cursors
                WHERE processor_name = %s AND target_table = %s
                """
                cursor.execute(sql, (self.processor_name, self.target_table))
                result = cursor.fetchone()
                if not result:
                    raise ValueError(f"Cursor state not found for {self.processor_name}")
                return result
        finally:
            if self.conn:
                self.conn.close()

    def update_cursor(self, cursor_id: int):
        """カーソル位置を更新"""
        try:
            self.conn = get_db_connection()
            with self.conn.cursor() as cursor:
                sql = """
                UPDATE processing_cursors
                SET last_cursor_id = %s,
                    updated_at = NOW()
                WHERE processor_name = %s AND target_table = %s
                """
                cursor.execute(sql, (cursor_id, self.processor_name, self.target_table))
                self.conn.commit()
                logger.info(f"カーソル位置を更新: {cursor_id}")
        finally:
            if self.conn:
                self.conn.close()

    def reset_if_needed(self) -> bool:
        """必要に応じてカーソルをリセット"""
        try:
            state = self.get_cursor_state()
            current_time = datetime.now()
            time_diff = (current_time - state['last_reset_time']).total_seconds()
            
            if time_diff >= state['reset_interval']:
                self.conn = get_db_connection()
                with self.conn.cursor() as cursor:
                    sql = """
                    UPDATE processing_cursors
                    SET last_cursor_id = 0,
                        last_reset_time = NOW(),
                        updated_at = NOW()
                    WHERE processor_name = %s AND target_table = %s
                    """
                    cursor.execute(sql, (self.processor_name, self.target_table))
                    self.conn.commit()
                    logger.info("カーソルをリセットしました")
                return True
            return False
        finally:
            if self.conn:
                self.conn.close()

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
        self.cursor_manager = CursorManager('video_collector', 'video_url_data')

    def get_videos_to_update(self, cursor_id: int = 0) -> Tuple[List[Dict[str, Any]], int]:
        """カーソルベースでneeds_updateがTrueのビデオデータを取得"""
        try:
            # カーソルのリセットチェックと状態取得
            self.cursor_manager.reset_if_needed()
            cursor_state = self.cursor_manager.get_cursor_state()
            batch_size = cursor_state['batch_size']

            conn = get_db_connection()
            with conn.cursor() as cursor:
                query = """
                    SELECT 
                        id,
                        video_url,
                        username,
                        video_id,
                        is_new_video
                    FROM 
                        video_url_data
                    WHERE 
                        needs_update = TRUE
                        AND id > %s
                    ORDER BY 
                        id
                    LIMIT %s
                """
                cursor.execute(query, (cursor_id, batch_size))
                results = cursor.fetchall()
                
                # 次のカーソル値を設定（結果がある場合は最後のIDを使用）
                if results:
                    next_cursor = results[-1]['id']
                    self.cursor_manager.update_cursor(next_cursor)
                else:
                    next_cursor = cursor_id

                logger.info(f"取得した動画数: {len(results)}, 次のカーソル: {next_cursor}")
                
                return results, next_cursor
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

    def process_videos(self, cursor_id: int = 0) -> Dict[str, Any]:
        """カーソルベースで動画データを取得してPub/Subに送信"""
        try:
            # 更新が必要な動画を取得
            videos, next_cursor = self.get_videos_to_update(cursor_id)
            
            if not videos:
                return {
                    "success": True,
                    "message": "処理対象の動画がありません",
                    "next_cursor": cursor_id,
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
            
            return {
                "success": True,
                "message": f"{len(videos)}件の動画を処理しました",
                "next_cursor": next_cursor,
                "processed_count": len(processed_videos),
                "processed_videos": processed_videos
            }
            
        except Exception as e:
            logger.error(f"動画処理中にエラーが発生: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "next_cursor": cursor_id,
                "processed_count": 0
            }

@functions_framework.http
def collect_videos(request):
    """HTTPリクエストハンドラ"""
    try:
        # リクエストからカーソル値を取得
        cursor_id = int(request.args.get('cursor', 0))
        logger.info(f"リクエスト受信: cursor={cursor_id}")
        
        collector = VideoCollector()
        result = collector.process_videos(cursor_id)
        
        return result, 200 if result["success"] else 500
        
    except Exception as e:
        logger.error(f"エラーが発生しました: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "next_cursor": cursor_id
        }, 500

if __name__ == "__main__":
    try:
        collector = VideoCollector()
        cursor = 0
        total_processed = 0
        
        while True:
            result = collector.process_videos(cursor)
            
            if not result["success"]:
                logger.error(f"エラーが発生しました: {result.get('error')}")
                break
                
            total_processed += result["processed_count"]
            logger.info(f"現在までの処理件数: {total_processed}")
            
            if not result["next_cursor"]:
                logger.info(f"全ての動画の処理が完了しました（合計: {total_processed}件）")
                break
                
            cursor = result["next_cursor"]
            logger.info(f"次のバッチを処理します。カーソル: {cursor}")
            
    except Exception as e:
        logger.error(f"エラーが発生しました: {str(e)}")
        raise
