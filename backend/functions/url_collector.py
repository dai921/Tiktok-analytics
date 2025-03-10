import os
from dotenv import load_dotenv
import mysql.connector
from google.cloud import pubsub_v1
import json
from datetime import datetime
import pymysql
import logging
import concurrent.futures
import functions_framework
import sys
from typing import List, Dict, Any, Tuple
import base64

# 環境変数を取得
environment = os.getenv('ENVIRONMENT', 'development')
pubsub_host = os.getenv('PUBSUB_EMULATOR_HOST')
project_id = os.getenv('PROJECT_ID', 'local-project')

# 環境に応じたログ出力
if environment == 'development':
    print(f"開発環境: Pub/Subエミュレータを使用 ({pubsub_host})")
else:
    print(f"本番環境: GCPマネージドPub/Subを使用 (プロジェクト: {project_id})")

# デバッグ用コード追加
print("==== Database Connection Info ====")
print(f"ENVIRONMENT: {environment}")
print(f"PUBSUB_EMULATOR_HOST: {pubsub_host}")
print(f"PROJECT_ID: {project_id}")

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
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

    def get_cursor_state(self) -> Dict[str, Any]:
        """カーソルの状態を取得"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                sql = """
                SELECT last_cursor_id, last_reset_time, batch_size, 
                       reset_interval, batch_number
                FROM processing_cursors
                WHERE processor_name = %s AND target_table = %s
                """
                cursor.execute(sql, (self.processor_name, self.target_table))
                result = cursor.fetchone()
                if not result:
                    raise ValueError(f"Cursor state not found for {self.processor_name}")
                return result
        finally:
            if conn:
                conn.close()

    def update_cursor(self, cursor_id: int):
        """カーソル位置を更新"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                sql = """
                UPDATE processing_cursors
                SET last_cursor_id = %s,
                    updated_at = NOW()
                WHERE processor_name = %s AND target_table = %s
                """
                cursor.execute(sql, (cursor_id, self.processor_name, self.target_table))
                conn.commit()
                logger.info(f"カーソル位置を更新: {cursor_id}")
        finally:
            if conn:
                conn.close()

    def reset_if_needed(self) -> bool:
        """必要に応じてカーソルをリセット"""
        conn = None
        try:
            # カーソル状態を取得
            state = self.get_cursor_state()
            current_time = datetime.now()
            time_diff = (current_time - state['last_reset_time']).total_seconds()
            
            if time_diff >= state['reset_interval']:
                # リセットが必要な場合は新しい接続を作成
                conn = get_db_connection()
                with conn.cursor() as cursor:
                    sql = """
                    UPDATE processing_cursors
                    SET last_cursor_id = 0,
                        last_reset_time = NOW(),
                        updated_at = NOW()
                    WHERE processor_name = %s AND target_table = %s
                    """
                    cursor.execute(sql, (self.processor_name, self.target_table))
                    conn.commit()
                    logger.info("カーソルをリセットしました")
                return True
            return False
        finally:
            if conn:
                conn.close()

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
        if hasattr(cloud_event, 'data'):
            message_data = base64.b64decode(cloud_event.data).decode('utf-8')
            trigger_data = json.loads(message_data)
            logger.info(f"トリガー情報: {trigger_data}")
        
        return collect_urls()
    except Exception as e:
        logger.error(f"URL収集処理エラー: {str(e)}")
        return {"error": str(e)}, 500

def collect_urls() -> Tuple[Dict[str, Any], int]:
    """URLの収集処理を実行"""
    logger.info("==== collect_urls関数の実行開始 ====")
    conn = None
    try:
        # カーソル管理の初期化
        cursor_manager = CursorManager('url_collector', 'account_list')
        cursor_state = cursor_manager.get_cursor_state()
        batch_size = cursor_state['batch_size']
        current_batch = cursor_state.get('batch_number', 0)  # batch_numberも取得
        
        conn = get_db_connection()
        logger.info("==== データベースからアカウント取得開始 ====")
        
        with conn.cursor() as cursor:
            # 更新が必要な総数を取得
            cursor.execute("""
                SELECT COUNT(*) as total
                FROM account_list 
                WHERE needs_update = TRUE
            """)
            total_needs_update = cursor.fetchone()['total']
            
            if not total_needs_update:
                logger.info("更新が必要なアカウントが見つかりませんでした")
                return {"message": "No accounts to update found"}, 200
            
            # 未処理のアカウントを取得（batch_size分）
            sql = """
            SELECT id, account_url, account_name, is_new_account 
            FROM account_list 
            WHERE needs_update = TRUE
            AND id > %s  -- last_cursor_idより大きいIDのレコードを取得
            LIMIT %s
            """
            cursor.execute(sql, (cursor_state['last_cursor_id'], batch_size))
            accounts = cursor.fetchall()
            
            if not accounts:
                return {"message": "No accounts to process"}, 200

            # 新しいバッチ番号を計算
            new_batch = current_batch + 1
            processed_total = (new_batch - 1) * batch_size + len(accounts)
            is_final_batch = processed_total >= total_needs_update
            
            # カーソル位置とバッチ番号を一度に更新
            cursor.execute("""
                UPDATE processing_cursors
                SET last_cursor_id = %s,
                    batch_number = %s,
                    updated_at = NOW()
                WHERE processor_name = 'url_collector' 
                AND target_table = 'account_list'
            """, (accounts[-1]['id'], new_batch))
            
            # message_dataの構造を修正
            message_data = {
                "accounts": [
                    {
                        "account_url": account["account_url"],
                        "account_name": account["account_name"],
                        "is_new_account": bool(account["is_new_account"]),
                        "account_id": account["id"]
                    } for account in accounts
                ]
            }

            # 最後のアカウントの場合のみprocessing_infoを追加
            if is_final_batch and accounts:  # accountsが空でないことを確認
                message_data["processing_info"] = {
                    "is_final_batch": True,
                    "batch_number": new_batch,
                    "total_needs_update": total_needs_update,
                    "last_account_id": accounts[-1]["id"]
                }
                
                # 最後のバッチの場合はbatch_numberをリセット
                cursor.execute("""
                    UPDATE processing_cursors
                    SET batch_number = 0
                    WHERE processor_name = 'url_collector' 
                    AND target_table = 'account_list'
                """)
            
            conn.commit()
            
            # Pub/Sub送信処理
            logger.info("==== Pub/Sub送信処理開始 ====")
            os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
            publisher = pubsub_v1.PublisherClient()
            topic_name = "process-account-list"
            topic_path = publisher.topic_path(project_id.strip(), topic_name.strip())
            
            logger.info(f"Pub/Sub設定:")
            logger.info(f"- エミュレーターホスト: '{os.getenv('PUBSUB_EMULATOR_HOST')}'")
            logger.info(f"- Topic Path: '{topic_path}'")
            
            try:
                data = json.dumps(message_data).encode("utf-8")
                logger.info(f"送信データ: {data.decode('utf-8')}")
                
                future = publisher.publish(topic_path, data)
                message_id = future.result(timeout=30)
                
                logger.info(f"送信成功 - Message ID: {message_id}")
                return {
                    "message": f"Processed {len(accounts)} accounts",
                    "message_id": message_id,
                    "next_cursor": accounts[-1]['id']
                }, 200
                
            except Exception as e:
                logger.error(f"Pub/Sub送信エラー: {type(e).__name__}: {str(e)}")
                return {
                    "message": f"Processed {len(accounts)} accounts (Pub/Sub error: {str(e)})",
                    "next_cursor": accounts[-1]['id']
                }, 200
            
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}, 500
    finally:
        if conn:
            conn.close()
            logger.info("==== データベース接続クローズ ====")

def process_crawl_complete(event, context):
    """クローリング完了通知を処理"""
    try:
        data = json.loads(event['data'].decode('utf-8'))
        account_url = data['account_url']
        status = data.get('status')
        video_count = data.get('video_count', 0)

        if status != 'success':
            print(f"Crawl failed for account: {account_url}")
            return 'Failed', 500

        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        cursor = conn.cursor()

        # アカウントの更新状態を更新
        cursor.execute('''
            UPDATE account_list 
            SET is_new_account = FALSE, 
                needs_update = FALSE,
                last_crawl_date = NOW(),
                last_video_count = %s
            WHERE account_url = %s
        ''', (video_count, account_url))

        conn.commit()
        cursor.close()
        conn.close()

        print(f"Updated account status: {account_url} (videos: {video_count})")
        return 'Success', 200

    except Exception as e:
        print(f"Error: {str(e)}")
        if 'conn' in locals() and conn.is_connected():
            conn.close()
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
        connection = get_db_connection()
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