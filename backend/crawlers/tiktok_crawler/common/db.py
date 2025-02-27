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
            for video_url in video_urls:
                # video_idを抽出
                video_id = None
                if '/video/' in video_url:
                    video_id = video_url.split('/video/')[1]
                elif '/photo/' in video_url:
                    video_id = video_url.split('/photo/')[1]
                
                if video_id and '?' in video_id:
                    video_id = video_id.split('?')[0]
                
                sql = """
                INSERT INTO video_url_data
                    (video_url, video_id, username, is_new_video, needs_update) 
                VALUES 
                    (%s, %s, %s, 1, 1)
                ON DUPLICATE KEY UPDATE
                    needs_update = 1
                """
                cursor.execute(sql, (video_url, video_id, username))
                
        connection.commit()
        return True
    except Exception as e:
        logger.error(f"Error inserting video URL {video_url}: {e}")
        logger.info(f"Extracted video_id: {video_id}")
        return False

def extract_video_id(video_url):
    # Implementation of extract_video_id function
    pass

logger = logging.getLogger(__name__) 