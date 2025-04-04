import os
import mysql.connector
from dotenv import load_dotenv
from datetime import datetime
import logging

load_dotenv()

def get_db_connection():
    """データベース接続を取得"""
    return mysql.connector.connect(
        host=os.getenv('MYSQL_HOST'),
        user=os.getenv('MYSQL_USER'),
        password=os.getenv('MYSQL_PASSWORD'),
        database=os.getenv('MYSQL_DATABASE')
    )

def save_video_urls(connection, video_urls, username):
    """動画URLをデータベースに保存"""
    try:
        with connection.cursor() as cursor:
            for video_data in video_urls:
                video_url = video_data['url']
                video_id = video_data['video_id']
                # typeを日本語に変換
                content_type = "動画" if video_data['type'] == 'video' else "カルーセル"
                
                sql = """
                INSERT INTO video_url_data
                    (video_url, video_id, username, is_new_video, needs_update, content_type) 
                VALUES 
                    (%s, %s, %s, 1, 1, %s)
                ON DUPLICATE KEY UPDATE
                    needs_update = 1,
                    content_type = VALUES(content_type)
                """
                cursor.execute(sql, (video_url, video_id, username, content_type))
                
        connection.commit()
        return True
    except Exception as e:
        logger.error(f"Error inserting video URL {video_data}: {e}")
        logger.info(f"Extracted video_id: {video_id}")
        return False

def extract_video_id(video_url):
    # Implementation of extract_video_id function
    pass

logger = logging.getLogger(__name__) 