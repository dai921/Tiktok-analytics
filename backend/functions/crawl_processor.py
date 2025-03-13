import os
import json
import logging
from datetime import datetime
import time
import sys
import functions_framework
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message

# ロギング設定
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

@functions_framework.cloud_event
def process_pubsub(cloud_event):
    """
    Pub/Subメッセージを処理するCloud Function
    Args:
        cloud_event (CloudEvent): Pub/Subからのメッセージを含むCloudEvent
    Returns:
        dict: 処理結果
    """
    logger.info(f"====== process_pubsub 開始：{datetime.now().isoformat()} ======")
    return process_crawl_complete(cloud_event)

def process_crawl_complete(cloud_event):
    """クロール完了通知を処理"""
    start_time = time.time()
    logger.info(f"====== process_crawl_complete 開始：{datetime.now().isoformat()} ======")
    
    try:
        # Pub/Subメッセージからデータを取得
        if isinstance(cloud_event, dict):
            if 'data' in cloud_event:
                # Cloud Functions形式のメッセージ
                import base64
                pubsub_message = base64.b64decode(cloud_event['data']).decode('utf-8')
                message_data = json.loads(pubsub_message)
            else:
                # 直接のJSONメッセージ
                message_data = cloud_event
        else:
            # CloudEventオブジェクト
            message_data = json.loads(cloud_event.data)
        
        logger.info(f"受信したメッセージ: {message_data}")
        
        # メッセージデータをパース
        account_url = message_data.get('account_url')
        status = message_data.get('status')
        is_new_account = message_data.get('is_new_account', False)
        video_count = message_data.get('video_count', 0)
        timestamp = message_data.get('timestamp', datetime.now().timestamp())
        processing_info = message_data.get('processing_info')  # processing_infoを取得
        
        if not account_url or not status:
            logger.error("必須フィールドがありません: account_url または status")
            return {'success': False, 'error': '必須フィールドがありません'}
        
        # アカウントの更新状態を更新
        try:
            if status == "deleted_account":
                # 削除済みアカウントの場合のみneeds_updateをFALSEに設定
                update_sql = """
                UPDATE account_list 
                SET is_new_account = FALSE,
                    last_crawl_date = CURRENT_TIMESTAMP,
                    last_video_count = %(video_count)s,
                    status = %(status)s,
                    needs_update = FALSE
                WHERE account_url = %(account_url)s
                """
            else:
                # その他のステータスの場合は既存の更新内容のみ
                update_sql = """
                UPDATE account_list 
                SET is_new_account = FALSE,
                    last_crawl_date = CURRENT_TIMESTAMP,
                    last_video_count = %(video_count)s,
                    status = %(status)s
                WHERE account_url = %(account_url)s
                """
            
            params = {
                'video_count': video_count,
                'status': status,
                'account_url': account_url
            }
            
            execute_write_query(update_sql, params)
            logger.info(f"アカウント {account_url} の状態を更新しました（ステータス: {status}）")

            # 最後のアカウントの処理が完了した場合、video-url-data-updateトピックにメッセージを送信
            if processing_info and processing_info.get('is_final_batch'):
                logger.info("最後のアカウントの処理が完了しました。video-url-data-updateトリガーを送信します。")
                
                # 更新トリガーメッセージを作成
                trigger_message = {
                    'trigger_time': datetime.now().isoformat(),
                    'trigger_type': 'accounts_processed',
                    'accounts_info': {
                        'total_accounts': processing_info.get('total_accounts'),
                        'total_needs_update': processing_info.get('total_needs_update')
                    }
                }
                
                # Pub/Subユーティリティを使用してメッセージを送信
                message_id = publish_message('video-url-data-update', trigger_message)
                logger.info(f"video-url-data-update トリガーを送信しました。Message ID: {message_id}")
            
            # 処理完了
            total_time = time.time() - start_time
            logger.info(f"処理が完了しました （合計時間: {total_time:.2f}秒）")
            return {"success": True, "execution_time": total_time}
                
        except DatabaseError as e:
            logger.error(f"データベース操作中にエラーが発生しました: {e}")
            return {"success": False, "error": str(e)}
        
    except Exception as e:
        logger.error(f"処理中にエラーが発生しました: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
    finally:
        total_time = time.time() - start_time
        logger.info(f"====== process_crawl_complete 終了: {total_time:.2f}秒 ======")

# スタンドアロン実行用
def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        # Pub/Subクライアント
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        project_id = os.environ.get("PROJECT_ID", "local-project")
        subscription_name = "process-crawl-complete-sub"
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        logger.info(f"PROJECT_ID: {project_id}")
        
        # コールバック関数
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                process_pubsub(data)  # {"data": data}ではなく、直接dataを渡す
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
                import traceback
                logger.error(traceback.format_exc())
            finally:
                # メッセージを確認応答
                message.ack()
        
        # メッセージハンドラ設定
        streaming_pull_future = subscriber.subscribe(subscription_path, callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        
        # バックグラウンドで実行
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

# メイン実行部分
if __name__ == "__main__":
    # スタンドアロンモードとして起動
    logger.info("スタンドアロンモードでクロール完了プロセッサーを起動しています...")
    try:
        # データベース接続テスト
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
        logger.error(f"初期化中にエラーが発生: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
else:
    # Cloud Functions用の設定のみ残し、サブスクリプション設定は削除
    logger.info("Functions Frameworkモードで準備完了") 