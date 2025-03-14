import os
from dotenv import load_dotenv
import json
from datetime import datetime
import logging
import concurrent.futures
import functions_framework
import sys
from typing import List, Dict, Any, Tuple
import base64
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message

# 設定の初期化
initialize_config()

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID', 'local-project')

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# 環境に応じたログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"プロジェクトID: {project_id}")

class CursorManager:
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

@functions_framework.cloud_event
def process_pubsub(cloud_event):
    """
    スプレッドシート同期完了後のURL収集を行うCloud Function
    Args:
        cloud_event (CloudEvent): Pub/Subからのメッセージを含むCloudEvent
    Returns:
        dict: 処理結果
    """
    logger.info(f"====== URL収集処理開始：{datetime.now().isoformat()} ======")
    try:
        # Pub/Subメッセージからデータを取得
        pubsub_message = base64.b64decode(cloud_event.data["message"]["data"]).decode('utf-8')
        trigger_data = json.loads(pubsub_message)
        logger.info(f"トリガー情報: {trigger_data}")
        
        return collect_urls()
    except Exception as e:
        logger.error(f"URL収集処理エラー: {str(e)}")
        return {"error": str(e)}, 500

def collect_urls() -> Tuple[Dict[str, Any], int]:
    """URLの収集処理を実行 - バッチ処理なしですべてのアカウントを一度に処理"""
    logger.info("==== collect_urls関数の実行開始 ====")
    try:
        # 処理時間管理のみに使用
        cursor_manager = CursorManager('url_collector', 'account_list')
        
        logger.info("==== データベースからアカウント取得開始 ====")
        
        # 更新が必要なアカウントをすべて取得
        total_query = """
            SELECT COUNT(*) as total
            FROM account_list 
            WHERE needs_update = 1
        """
        total_result = execute_query(total_query)
        total_needs_update = total_result[0]['total'] if total_result else 0
        
        if not total_needs_update:
            logger.info("更新が必要なアカウントが見つかりませんでした")
            return {"message": "No accounts to update found"}, 200
        
        # 更新が必要なアカウントをすべて取得（バッチなし）
        accounts_query = """
        SELECT id, account_url, account_name, is_new_account 
        FROM account_list 
        WHERE needs_update = 1
        """
        accounts = execute_query(accounts_query)
        
        if not accounts:
            return {"message": "No accounts to process"}, 200

        # 最終処理時間を更新
        cursor_manager.update_last_processed_time()
        
        # message_dataの構造
        message_data = {
            "accounts": [
                {
                    "account_url": account["account_url"],
                    "account_name": account["account_name"],
                    "is_new_account": bool(account["is_new_account"]),
                    "account_id": account["id"]
                } for account in accounts
            ],
            "processing_info": {
                "is_final_batch": True,
                "total_accounts": len(accounts),
                "total_needs_update": total_needs_update,
            }
        }
        
        # pubsub_utils.pyのpublish_message関数を使用
        try:
            logger.info("==== Pub/Sub送信処理開始 ====")
            logger.info(f"送信データ: {json.dumps(message_data)}")
            
            message_id = publish_message('process-account-list', message_data)
            
            logger.info(f"送信成功 - Message ID: {message_id}")
            return {
                "message": f"Processed {len(accounts)} accounts",
                "message_id": message_id,
                "total_accounts": len(accounts)
            }, 200
            
        except Exception as e:
            logger.error(f"Pub/Sub送信エラー: {type(e).__name__}: {str(e)}")
            return {
                "message": f"Processed {len(accounts)} accounts (Pub/Sub error: {str(e)})",
                "total_accounts": len(accounts)
            }, 200
        
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}, 500

def process_crawl_complete(event, context):
    """クローリング完了通知を処理"""
    try:
        data = json.loads(event['data'].decode('utf-8'))
        account_url = data['account_url']
        status = data.get('status')
        video_count = data.get('video_count', 0)

        if status != 'success':
            logger.error(f"Crawl failed for account: {account_url}")
            return 'Failed', 500

        # アカウントの更新状態を更新
        update_query = '''
            UPDATE account_list 
            SET is_new_account = FALSE, 
                needs_update = FALSE,
                last_crawl_date = NOW(),
                last_video_count = %(video_count)s
            WHERE account_url = %(account_url)s
        '''
        params = {
            'video_count': video_count,
            'account_url': account_url
        }
        
        execute_write_query(update_query, params)
        logger.info(f"Updated account status: {account_url} (videos: {video_count})")
        return 'Success', 200

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return str(e), 500
    

def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "spreadsheet-completion"  # 既存のサブスクリプション名を使用
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                process_pubsub(data)
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
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
    logger.info("スタンドアロンモードで動画処理プロセッサーを起動しています...")
    try:
        # データベース接続テスト
        with get_connection() as connection:
            logger.info("データベース接続テスト成功")
        
        # サブスクリプション設定
        future = setup_subscription()
        
        if future:
            try:
                logger.info("メッセージを待機中...")
                future.result()
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