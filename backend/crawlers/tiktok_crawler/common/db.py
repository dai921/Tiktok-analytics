import os
import mysql.connector
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

def get_db_connection():
    """データベース接続を取得"""
    return mysql.connector.connect(
        host=os.getenv('MYSQL_HOST'),
        user=os.getenv('MYSQL_USER'),
        password=os.getenv('MYSQL_PASSWORD'),
        database=os.getenv('MYSQL_DATABASE')
    )

def save_video_urls(account_url: str, video_urls: list):
    """動画URLをデータベースに保存"""
    mysql_host = os.getenv('MYSQL_HOST', 'host.docker.internal')
    print(f"Connecting to MySQL at {mysql_host}...")
    try:
        conn = mysql.connector.connect(
            host=mysql_host,
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE'),
            port=3306
        )
        cursor = conn.cursor()

        # テーブル構造を確認
        cursor.execute("DESCRIBE video_url_data")
        columns = cursor.fetchall()
        print("Table structure:", columns)

        # video_url_dataテーブルに保存
        for video_url in video_urls:
            try:
                video_id = video_url.split('/video/')[1].split('?')[0]
                username = account_url.split('@')[1].split('?')[0]
                
                # video_idから数値部分のみを抽出してbigintとして使用
                video_url_number = int(video_id)
                
                insert_query = """
                INSERT INTO video_url_data 
                (video_url, video_id, username, is_new_video, needs_update)
                VALUES (%s, %s, %s, TRUE, TRUE)
                ON DUPLICATE KEY UPDATE
                needs_update = TRUE
                """
                
                cursor.execute(insert_query, (
                    video_url_number,  # video_idの数値部分
                    video_id,          # 元のvideo_id文字列
                    username,
                    datetime.now().date()
                ))
                
            except Exception as e:
                print(f"Error inserting video URL {video_url}: {str(e)}")
                print(f"Extracted values - video_id: {video_id}, video_url_number: {video_url_number}")
                continue

        conn.commit()
        print(f"Successfully saved {len(video_urls)} video URLs for {account_url}")

    except Exception as e:
        print(f"Database error: {str(e)}")
        raise
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close() 