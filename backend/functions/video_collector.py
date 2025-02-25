import os
from dotenv import load_dotenv
import mysql.connector
from google.cloud import pubsub_v1

load_dotenv()

def collect_videos(request):
    try:
        # データベース接続
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        cursor = conn.cursor()

        # 更新が必要なアカウントを取得
        cursor.execute('''
            SELECT account_url, account_name, is_new_account 
            FROM account_list 
            WHERE needs_update = TRUE
        ''')
        accounts = cursor.fetchall()

        if not accounts:
            return 'No accounts need updating', 200

        # Pub/Subクライアントの設定
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(os.getenv('PROJECT_ID'), 'video-crawl-requests')

        # 各アカウントの処理をPub/Subに送信
        for account in accounts:
            message = {
                'account_url': account[0],
                'account_name': account[1],
                'is_new_account': account[2]
            }
            publisher.publish(topic_path, str(message).encode('utf-8'))

        cursor.close()
        conn.close()

        return f'Sent {len(accounts)} accounts for processing', 200

    except Exception as e:
        print(f"Error: {str(e)}")
        return str(e), 500

def process_crawl_complete(event, context):
    """Pub/Subからの完了通知を処理"""
    try:
        # メッセージからアカウントURLを取得
        message = event['data'].decode('utf-8')
        account_url = eval(message)['account_url']

        # データベース接続
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        cursor = conn.cursor()

        # アカウントの更新
        cursor.execute('''
            UPDATE account_list 
            SET is_new_account = FALSE, needs_update = FALSE 
            WHERE account_url = %s
        ''', (account_url,))

        conn.commit()
        cursor.close()
        conn.close()

        return 'Success', 200

    except Exception as e:
        print(f"Error: {str(e)}")
        return str(e), 500 