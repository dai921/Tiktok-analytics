import os
from dotenv import load_dotenv
import mysql.connector
from google.cloud import pubsub_v1
import json
from datetime import datetime
import pymysql
import logging

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
    try:
        print("==== collect_urls関数を実行中... ====")
        print(f"リクエストメソッド: {request.method}")
        print(f"リクエストヘッダー: {dict(request.headers)}")
        
        # DBからneeds_updateが立っているアカウントを取得（最大3件）
        print("==== 更新が必要なアカウントを取得中... ====")
        conn = get_db_connection()
        accounts = []
        
        with conn.cursor() as cursor:
            # クエリ実行 - 最大3件に制限
            sql = """
            SELECT id, account_url, account_name, is_new_account 
            FROM account_list 
            WHERE needs_update = TRUE
            LIMIT 4
            """
            print(f"==== 実行するSQL: {sql}")
            cursor.execute(sql)
            accounts = cursor.fetchall()
            print(f"==== 取得したアカウント数: {len(accounts)}")
            
            # 取得結果のプレビュー
            for account in accounts:
                print(f"==== 取得アカウント: {account}")
        
        conn.close()
        
        if not accounts:
            print("==== 更新が必要なアカウントが見つかりませんでした")
            return "No accounts to update found", 200
        
        # Pub/Subにメッセージ送信
        publisher = pubsub_v1.PublisherClient()
        topic_name = "process-account-list"
        topic_path = publisher.topic_path(project_id, topic_name)
        
        print(f"==== Pub/Subトピック: {topic_path}")
        
        # アカウントリストをJSON形式で送信
        data = json.dumps({"accounts": accounts}).encode("utf-8")
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        
        print(f"==== メッセージを送信しました。ID: {message_id}")
        return f"Processed {len(accounts)} accounts for update", 200
        
    except Exception as e:
        import traceback
        print(f"==== エラー発生: {e}")
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