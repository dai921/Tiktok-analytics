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

@functions_framework.http
def collect_urls(request):
    """カーソルベースでneeds_updateフラグが立っているアカウントを取得しPub/Subに送信する"""
    logger.info("==== collect_urls関数の実行開始 ====")
    logger.info(f"リクエストメソッド: {request.method}")
    
    conn = None
    try:
        # カーソル管理の初期化
        cursor_manager = CursorManager('url_collector', 'account_list')
        
        # カーソルのリセットチェックと状態取得
        cursor_manager.reset_if_needed()
        cursor_state = cursor_manager.get_cursor_state()
        cursor_id = cursor_state['last_cursor_id']
        batch_size = cursor_state['batch_size']
        
        logger.info(f"現在のカーソル位置: {cursor_id}")
        
        # DBからneeds_updateが立っているアカウントを取得
        logger.info("==== データベースからアカウント取得開始 ====")
        accounts = []
        conn = get_db_connection()
        
        with conn.cursor() as cursor:
            sql = """
            SELECT id, account_url, account_name, is_new_account 
            FROM account_list 
            WHERE needs_update = TRUE
            AND id > %s
            ORDER BY id
            LIMIT %s
            """
            logger.info(f"実行SQL: {sql}")
            cursor.execute(sql, (cursor_id, batch_size))
            accounts = cursor.fetchall()
            
            if accounts:
                # 次のカーソル値を設定
                next_cursor = accounts[-1]['id']
                cursor_manager.update_cursor(next_cursor)
                logger.info(f"次のカーソル値を設定: {next_cursor}")
            else:
                next_cursor = cursor_id
            
            logger.info(f"取得アカウント数: {len(accounts)}")
            
            # 取得したアカウントの内容を表示
            for account in accounts:
                logger.info(f"アカウント情報: {account}")
    
        if not accounts:
            logger.info("==== 更新が必要なアカウントが見つかりませんでした ====")
            return {"message": "No accounts to update found", "next_cursor": cursor_id}, 200
        
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
            message_data = {
                "accounts": [
                    {
                        "account_url": account["account_url"],
                        "account_name": account["account_name"],
                        "is_new_account": bool(account["is_new_account"])
                    } for account in accounts
                ]
            }
            
            data = json.dumps(message_data).encode("utf-8")
            logger.info(f"送信データ: {data.decode('utf-8')}")
            
            future = publisher.publish(topic_path, data)
            message_id = future.result(timeout=30)
            
            logger.info(f"送信成功 - Message ID: {message_id}")
            return {
                "message": f"Processed {len(accounts)} accounts",
                "message_id": message_id,
                "next_cursor": next_cursor
            }, 200
            
        except Exception as e:
            logger.error(f"Pub/Sub送信エラー: {type(e).__name__}: {str(e)}")
            return {
                "message": f"Processed {len(accounts)} accounts (Pub/Sub error: {str(e)})",
                "next_cursor": next_cursor
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