from datetime import datetime, timedelta
import logging
import os
from typing import Dict, Any
import functions_framework
import json
import base64
import requests
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
import argparse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID', 'local-project')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"プロジェクトID: {project_id}")

# Pub/Sub設定
SUBSCRIPTION_NAME = "trigger-video-url-data-update"
VIDEO_COLLECTOR_TOPIC = "trigger-video-collector"  # video_collector.pyをトリガーするトピック名

def update_needs_update_flag() -> Dict[str, Any]:
    try:
        logger.info("video_url_dataの更新フラグ更新を開始")
        
        # 14日前の日付を計算
        fourteen_days_ago = (datetime.now() - timedelta(days=14)).date()
        
        # Step 1と2をまとめた単一のクエリ
        update_query = """
            UPDATE video_url_data vud
            INNER JOIN video_master vm
                ON vud.video_id = vm.video_id
            SET vud.needs_update = TRUE
            WHERE
                vud.needs_update = FALSE
                AND (
                        vm.created_at IS NULL
                        OR vm.created_at >= %(fourteen_days_ago)s
                        OR (vm.created_at < %(fourteen_days_ago)s
                            AND vm.play_count >= 100000
                            AND vm.playCountIncrease > 1000)           
                )
                AND vm.status != 'deleted'
        """
        
        params = {
            'fourteen_days_ago': fourteen_days_ago
        }
        
        updated_count = execute_write_query(update_query, params)
        
        logger.info(f"更新完了: {updated_count}件のレコードをTRUEに設定")
        
        return {
            "status": "success",
            "updated_count": updated_count,
            "execution_time": datetime.now().isoformat()
        }
        
    except DatabaseError as e:
        logger.error(f"更新処理中にエラーが発生: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "execution_time": datetime.now().isoformat()
        }

def update_video_url_data(event, context):
    """
    Pub/Subメッセージで実行される関数
    """
    start_time = datetime.now()

    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(message_data)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
        else:
            logger.info("データなしのトリガー実行")
            message_data = {}

        logger.info(f"同期処理開始: {start_time}")

        result = update_needs_update_flag()
        
        execution_time = (datetime.now() - start_time).total_seconds()
        result["execution_time_seconds"] = execution_time
        
        if result["status"] == "success":
            # 処理成功時、video-collector関数をトリガー
            notify_completion()
        
        logger.info(f"データ更新処理完了: {result}")
        return json.dumps(result), 200 if result["status"] == "success" else 500
        
    except Exception as e:
        error_message = f"予期せぬエラーが発生: {str(e)}"
        logger.error(error_message)
        return json.dumps({
            "status": "error",
            "error": error_message,
            "execution_time": datetime.now().isoformat()
        }), 500



def notify_completion():
    """
    video-collector関数をトリガーするためのPub/Subメッセージを送信する
    """
    try:
        message_data = {
            "event": "video_url_data_update_completed",
            "timestamp": datetime.now().isoformat()
        }
        
        # Pub/Subメッセージを送信
        message_id = publish_message('trigger-video-collector', message_data)
        
        logger.info(f"video-collector関数へのPub/Subメッセージ送信完了: メッセージID {message_id}")
        return True
    except Exception as e:
        logger.error(f"Pub/Subメッセージ送信エラー: {str(e)}")
        return False

def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "trigger-video-url-data-update" 
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                
                # 2引数形式に合わせたイベントオブジェクトを作成
                event = {
                    'data': base64.b64encode(json.dumps(data).encode())
                }
                context = None
                
                update_video_url_data(event, context)
                
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"予期せぬエラーが発生: {e}")
                import traceback
                logger.error(traceback.format_exc())
            finally:
                message.ack()
  
        
        streaming_pull_future = subscriber.subscribe(subscription_path, callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

if __name__ == "__main__":
    import sys
    import argparse
    
    # コマンドライン引数パーサーの追加
    parser = argparse.ArgumentParser(description='video_url_data更新プロセッサー')
    parser.add_argument('--test', action='store_true', help='テストモードで直接実行（Pub/Subを待たずに処理を実行）')
    args = parser.parse_args()
    
    logger.info("スタンドアロンモードでvideo_url_data更新プロセッサーを起動しています...")
    
    try:
        # データベース接続テスト
        with get_connection() as connection:
            logger.info("データベース接続テスト成功")
        
        # テストモードの場合は直接処理を実行
        if args.test:
            logger.info("テストモードで直接実行します")
            # 空のイベントとコンテキストを作成して関数を呼び出す
            empty_event = {'data': base64.b64encode(json.dumps({}).encode())}
            result, status_code = update_video_url_data(empty_event, None)
            logger.info(f"テスト実行結果: {result}, ステータスコード: {status_code}")
        else:
            # 通常のサブスクリプションモード
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
        logger.error(f"初期化中にエラーが発生: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
else:
    logger.info("Functions Frameworkモードで準備完了")