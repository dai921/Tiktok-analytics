import os
from dotenv import load_dotenv
import mysql.connector
from google.cloud import pubsub_v1
import json
from datetime import datetime
import pymysql
import logging

# 環境変数を強制的に設定（最初に行う）
os.environ['ENVIRONMENT'] = 'development'
os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
os.environ['PROJECT_ID'] = 'local-project'

# 環境変数の読み込み
environment = os.getenv('ENVIRONMENT', 'development')
if environment == 'development':
    # 開発環境の場合のみエミュレータ設定
    os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
    print(f"開発環境: Pub/Subエミュレータを使用 ({os.environ['PUBSUB_EMULATOR_HOST']})")
else:
    print(f"本番環境: GCPマネージドPub/Subを使用 (プロジェクト: {os.environ.get('PROJECT_ID', 'local-project')})")

# デバッグ用コード追加
print("==== Database Connection Info ====")
print(f"ENVIRONMENT: {os.environ.get('ENVIRONMENT', '未設定')}")
print(f"PUBSUB_EMULATOR_HOST: {os.environ.get('PUBSUB_EMULATOR_HOST', '未設定')}")
print(f"PROJECT_ID: {os.environ.get('PROJECT_ID', '未設定')}")

def get_db_connection():
    """データベース接続を取得する"""
    host = "127.0.0.1"  # 明示的IPアドレスを使用
    port = int(os.environ.get("MYSQL_PORT", 3306))
    user = os.environ.get("MYSQL_USER", "tiktok_user")
    password = os.environ.get("MYSQL_PASSWORD", "tiktok_pass")
    database = os.environ.get("MYSQL_DATABASE", "tiktok_data")
    
    try:
        print(f"データベース接続試行: {host}:{port}/{database} ユーザー: {user}")
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
    try:
        print("collect_urls関数を実行中...")
        
        # DBからneeds_updateが立っているアカウントを取得（最大3件）
        print("更新が必要なアカウントを取得中...")
        conn = get_db_connection()
        accounts = []
        
        with conn.cursor() as cursor:
            # クエリ実行 - 最大3件に制限
            # 実際のテーブル構造に合わせたカラム名を使用
            database_name = os.environ.get("MYSQL_DATABASE", "tiktok_data")
            sql = f"""
            SELECT id, account_url, account_name, is_new_account 
            FROM {database_name}.account_list 
            WHERE needs_update = TRUE
            LIMIT 3
            """
            cursor.execute(sql)
            accounts = cursor.fetchall()
            print(f"取得したアカウント数: {len(accounts)}")
            
            # 取得結果のプレビュー
            for account in accounts:
                print(f"取得アカウント: {account}")
        
        conn.close()
        
        if not accounts:
            print("更新が必要なアカウントが見つかりませんでした")
            return "No accounts to update found", 200
        
        # Pub/Subにメッセージ送信
        publisher = pubsub_v1.PublisherClient()
        project_id = os.environ.get("PROJECT_ID", "local-project")
        topic_name = "process-account-list"
        topic_path = publisher.topic_path(project_id, topic_name)
        
        print(f"Pub/Subトピック: {topic_path}")
        
        # アカウントリストをJSON形式で送信
        data = json.dumps({"accounts": accounts}).encode("utf-8")
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        
        print(f"メッセージを送信しました。ID: {message_id}")
        return f"Processed {len(accounts)} accounts for update", 200
        
    except Exception as e:
        import traceback
        print(f"エラー発生: {e}")
        print(traceback.format_exc())
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