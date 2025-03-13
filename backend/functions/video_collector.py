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

    def update_last_processed_time(self):
        """最終処理時間を更新"""
        try:
            sql = """
            UPDATE processing_cursors
            SET last_reset_time = NOW(),
                updated_at = NOW()
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
            """
            params = {
                'processor_name': self.processor_name,
                'target_table': self.target_table
            }
            execute_write_query(sql, params)
            logger.info("最終処理時間を更新しました")
        except DatabaseError as e:
            logger.error(f"処理時間更新エラー: {str(e)}")
            raise

class VideoCollector:
    def __init__(self):
        # 処理管理クラスの初期化
        self.processing_manager = ProcessingManager('video_collector', 'video_url_data')

    def get_videos_to_update(self) -> List[Dict[str, Any]]:
        """更新が必要なすべてのビデオデータを一度に取得"""
        try:
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
                LIMIT 5
            """
            results = execute_query(query)
            
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

@functions_framework.cloud_event
def collect_videos(cloud_event):
    """Pub/Subメッセージで実行される関数"""
    logger.info("==== collect_videos関数の実行開始 ====")
    
    try:
        # Pub/Subメッセージの処理（必要な場合）
        if cloud_event.data:
            data = base64.b64decode(cloud_event.data["message"]["data"]).decode()
            logger.info(f"Pub/Subメッセージを受信: {data}")
        
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
    
    logger.info("スタンドアロンモードで動画収集プロセッサーを起動しています...")
    
    try:

            with get_connection() as connection:
                logger.info("データベース接続テスト成功")
            
            # サブスクリプション設定
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
