import os
import logging
from typing import List, Dict, Any, Tuple
from datetime import datetime
import functions_framework
import json
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message
import base64
import argparse

# 設定の初期化
initialize_config()

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID', 'local-project')

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pub/Sub設定を追加

class ProcessingManager:
    def __init__(self, processor_name: str, target_table: str):
        self.processor_name = processor_name
        self.target_table = target_table
        self.last_cursor_id = self.get_last_cursor_id()
        self.batch_number = self.get_batch_number()

    def get_last_cursor_id(self) -> int:
        """最後に処理したカーソルIDを取得"""
        try:
            sql = """
            SELECT last_cursor_id 
            FROM processing_cursors
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
            """
            params = {
                'processor_name': self.processor_name,
                'target_table': self.target_table
            }
            result = execute_query(sql, params)
            return result[0]['last_cursor_id'] if result else 0
        except DatabaseError as e:
            logger.error(f"カーソルID取得エラー: {str(e)}")
            return 0
            
    def get_batch_number(self) -> int:
        """現在のバッチ番号を取得"""
        try:
            sql = """
            SELECT batch_number 
            FROM processing_cursors
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
            """
            params = {
                'processor_name': self.processor_name,
                'target_table': self.target_table
            }
            result = execute_query(sql, params)
            return result[0]['batch_number'] if result and 'batch_number' in result[0] else 0
        except DatabaseError as e:
            logger.error(f"バッチ番号取得エラー: {str(e)}")
            return 0

    def update_last_processed_time(self, last_cursor_id: int = None, batch_number: int = None, reset_cursor: bool = False):
        """最終処理時間を更新"""
        try:
            sql = """
            UPDATE processing_cursors
            SET last_reset_time = NOW(),
                updated_at = NOW()
            """
            
            params = {
                'processor_name': self.processor_name,
                'target_table': self.target_table
            }
            
            # カーソルをリセットする場合
            if reset_cursor:
                sql += ", last_cursor_id = 0, batch_number = 0"
                logger.info("カーソル値をリセットします")
            else:
                # カーソルIDが指定されている場合は更新
                if last_cursor_id is not None:
                    sql += ", last_cursor_id = %(last_cursor_id)s"
                    params['last_cursor_id'] = last_cursor_id
                
                # バッチ番号が指定されている場合は更新
                if batch_number is not None:
                    sql += ", batch_number = %(batch_number)s"
                    params['batch_number'] = batch_number
                
            sql += " WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s"
            
            execute_write_query(sql, params)
            
            log_message = "最終処理時間を更新しました"
            if last_cursor_id is not None:
                log_message += f" (カーソルID: {last_cursor_id})"
            if batch_number is not None:
                log_message += f" (バッチ番号: {batch_number})"
            if reset_cursor:
                log_message += " (カーソルをリセットしました)"
                
            logger.info(log_message)
            
        except DatabaseError as e:
            logger.error(f"処理時間更新エラー: {str(e)}")
            raise

class VideoCollector:
    def __init__(self):
        # 処理管理クラスの初期化
        self.processing_manager = ProcessingManager('video_collector', 'video_url_data')

    def get_total_videos_to_update(self) -> int:
        """更新が必要な動画の総数を取得"""
        try:
            query = """
                SELECT COUNT(*) as total
                FROM video_url_data
                WHERE needs_update = TRUE
            """
            result = execute_query(query)
            total = result[0]['total'] if result else 0
            logger.info(f"更新が必要な動画の総数: {total}")
            return total
        except DatabaseError as e:
            logger.error(f"総数取得エラー: {str(e)}")
            return 0

    def get_videos_to_update(self) -> List[Dict[str, Any]]:
        """更新が必要なすべてのビデオデータを一度に取得"""
        try:
            # 前回のカーソルIDを取得
            last_cursor_id = self.processing_manager.last_cursor_id
            
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
                    AND id > %(last_cursor_id)s
                ORDER BY 
                    id
                LIMIT 5
            """
            params = {'last_cursor_id': last_cursor_id}
            results = execute_query(query, params)
            
            logger.info(f"取得した動画数: {len(results)}")
            
            return results
        except DatabaseError as e:
            logger.error(f"データ取得エラー: {str(e)}")
            raise

    def publish_video_data(self, video_data: Dict[str, Any]) -> str:
        """動画データをPub/Subに送信"""
        try:
            # pubsub_utilsのpublish_message関数を使用してメッセージを送信
            message_id = publish_message('video-processing', video_data)
            logger.info(f"メッセージを送信しました。Message ID: {message_id}")
            return message_id
        except Exception as e:
            logger.error(f"メッセージの送信に失敗: {str(e)}")
            raise

    def process_videos(self) -> Dict[str, Any]:
        """すべての更新が必要な動画データを取得してPub/Subに送信"""
        try:
            # 更新が必要な動画の総数を取得
            total_videos = self.get_total_videos_to_update()
            
            # 更新が必要な動画をバッチで取得
            videos = self.get_videos_to_update()
            
            # 現在のバッチ番号を取得
            current_batch = self.processing_manager.batch_number
            next_batch = current_batch + 1
            
            if not videos:
                return {
                    "success": True,
                    "message": "処理対象の動画がありません",
                    "processed_count": 0,
                    "total_videos": total_videos,
                    "batch_number": current_batch
                }
            
            # 各動画データをPub/Subに送信
            processed_videos = []
            
            # 処理したビデオがある場合のみ最大IDを更新するため、初期値はNoneに
            last_cursor_id = None
            
            for video in videos:
                message_id = self.publish_video_data(video)
                processed_videos.append({
                    "video_id": video['video_id'],
                    "message_id": message_id
                })
                
                # 最初のビデオならそのIDを、それ以降は最大値を記録
                if last_cursor_id is None:
                    last_cursor_id = video['id']
                else:
                    last_cursor_id = max(last_cursor_id, video['id'])
                    
                logger.info(f"動画ID {video['video_id']} のデータを送信しました")
            
            # このバッチで処理した件数
            processed_count = len(processed_videos)
            
            # すべての動画を処理したかどうかを確認
            remaining_videos = total_videos - processed_count
            is_last_batch = remaining_videos <= 0 or len(videos) < 5000
            
            # 処理完了後に最終処理時間とカーソルIDを更新
            if last_cursor_id is not None:
                # すべての動画を処理した場合はカーソルをリセット
                if is_last_batch:
                    logger.info("すべての動画処理が完了しました。カーソルをリセットします。")
                    self.processing_manager.update_last_processed_time(reset_cursor=True)
                else:
                    # まだ処理すべき動画が残っている場合は、カーソルとバッチ番号を更新
                    self.processing_manager.update_last_processed_time(last_cursor_id, next_batch)
            
            return {
                "success": True,
                "message": f"{processed_count}件の動画を処理しました",
                "processed_count": processed_count,
                "total_videos": total_videos,
                "remaining_videos": max(0, remaining_videos),
                "batch_number": next_batch if not is_last_batch else 0,
                "is_last_batch": is_last_batch,
                "processed_videos": processed_videos,
                "last_cursor_id": last_cursor_id if not is_last_batch else 0
            }
            
        except Exception as e:
            logger.error(f"動画処理中にエラーが発生: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "processed_count": 0
            }

def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "trigger-video-collector"  # 既存のサブスクリプション名を使用   
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                
                # Cloud Eventオブジェクトをシミュレート
                class MockCloudEvent:
                    def __init__(self, data):
                        self.data = {"message": {"data": base64.b64encode(json.dumps(data).encode()).decode()}}
                
                cloud_event = MockCloudEvent(data)
                collect_videos(cloud_event)
                
                # メッセージを確認応答
                message.ack()
                
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
                import traceback
                logger.error(traceback.format_exc())
        
        streaming_pull_future = subscriber.subscribe(subscription_path, callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def collect_videos(event,context):
    """
    Pub/Subメッセージで実行される関数
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    logger.info("==== collect_videos関数の実行開始 ====")
    
    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(message_data)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
        else:
            logger.info("データなしのトリガー実行")
            message_data = {}
        
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
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='動画収集プロセッサー')
    parser.add_argument('--test-run', action='store_true', help='テスト実行モード（Pub/Sub待機なし）')
    args = parser.parse_args()
    
    logger.info("スタンドアロンモードで動画収集プロセッサーを起動しています...")
    
    try:
        with get_connection() as connection:
            logger.info("データベース接続テスト成功")
        
        if args.test_run:
            # テスト実行モード - Pub/Sub待機なしで直接処理を実行
            logger.info("テスト実行モードで処理を開始します")
            collector = VideoCollector()
            result = collector.process_videos()
            logger.info(f"処理結果: {result}")
        else:
            # 通常モード - Pub/Subサブスクリプション設定
            future = setup_subscription()
            
            if future:
                try:
                    # 処理が継続するよう結果を待機
                    logger.info("メッセージを待機中...")
                    future.result()  # このコールはブロッキング
                except KeyboardInterrupt:
                    future.cancel()
                    logger.info("キーボード割り込みにより停止しました")
                except Exception as e:
                    future.cancel()
                    logger.error(f"エラーが発生しました: {e}")
            else:
                logger.error("サブスクリプションの設定に失敗しました")
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
    finally:
        logger.info("==== 処理終了 ====")
else:
    logger.info("Functions Frameworkモードで準備完了")
