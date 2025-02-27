import os
from dotenv import load_dotenv
import mysql.connector
from google.cloud import pubsub_v1
import json
from datetime import datetime
import pymysql
import logging
import concurrent.futures
import sys

# 代わりに環境変数を取得するように変更
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
    stream=sys.stdout  # 標準出力に出力
)
logger = logging.getLogger(__name__)

def get_db_connection():
    """データベース接続を取得する"""
    # テスト用にハードコードされた値を使用（テストスクリプトと同じ）
    host = "localhost"
    port = 3306
    user = "tiktok_user"
    password = "tiktok_pass"
    database = "tiktok_data"
    
    try:
        print(f"データベース接続試行: '{host}':{port}/{database} ユーザー: '{user}'")
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
        print(f"データベース接続成功!")
        return connection
    except Exception as e:
        print(f"データベース接続エラー: {e}")
        import traceback
        print(traceback.format_exc())
        raise

def collect_urls(request):
    """needs_updateフラグが立っているアカウントを取得しPub/Subに送信する"""
    logger.info("==== collect_urls関数の実行開始 ====")
    logger.info(f"リクエストメソッド: {request.method}")
    
    try:
        # DBからneeds_updateが立っているアカウントを取得
        logger.info("==== データベースからアカウント取得開始 ====")
        accounts = []
        conn = get_db_connection()
        
        with conn.cursor() as cursor:
            sql = """
            SELECT id, account_url, account_name, is_new_account 
            FROM account_list 
            WHERE needs_update = TRUE
            LIMIT 4
            """
            logger.info(f"実行SQL: {sql}")
            cursor.execute(sql)
            accounts = cursor.fetchall()
            logger.info(f"取得アカウント数: {len(accounts)}")
            
            # 取得したアカウントの内容を表示
            for account in accounts:
                logger.info(f"アカウント情報: {account}")
        
        conn.close()
        logger.info("==== データベース接続クローズ ====")
        
        if not accounts:
            logger.info("==== 更新が必要なアカウントが見つかりませんでした ====")
            return "No accounts to update found", 200
        
        # Pub/Sub送信処理
        logger.info("==== Pub/Sub送信処理開始 ====")
        # Pub/Sub設定
        os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'  # 明示的に設定
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
            
            # メッセージ送信（シンプルに）
            data = json.dumps(message_data).encode("utf-8")
            logger.info(f"送信データ: {data.decode('utf-8')}")
            
            future = publisher.publish(topic_path, data)
            message_id = future.result(timeout=30)  # タイムアウトを30秒に
            
            logger.info(f"送信成功 - Message ID: {message_id}")
            return f"Processed {len(accounts)} accounts, Message ID: {message_id}", 200
            
        except Exception as e:
            logger.error(f"Pub/Sub送信エラー: {type(e).__name__}: {str(e)}")
            return f"Processed {len(accounts)} accounts (Pub/Sub error: {str(e)})", 200
            
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}", 500

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