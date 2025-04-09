import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
import json
import os
from datetime import date, datetime
from src.utils.logger_config import setup_logger
import logging
from src.config import get_db_config  # 新しい設定モジュールをインポート

print("database.py is being loaded")
logger = setup_logger()

def get_db_connection():
    """データベース接続を取得"""
    print("get_db_connection was called!")
    try:
        db_config = get_db_config()
        
        # Cloud Run環境かどうかを検出
        if os.environ.get("K_SERVICE"):
            # Cloud SQL接続名を構築
            instance_connection_name = "tiktok-analytics-prod-451609:asia-northeast1:tiktok-analytics-db"
            unix_socket = f"/cloudsql/{instance_connection_name}"
            
            # unix_socketを使用した接続
            connection = mysql.connector.connect(
                unix_socket=unix_socket,
                user=db_config.get("user"),
                password=db_config.get("password"),
                database=db_config.get("database")
            )
            logger.info(f"Unix socketを使用して接続しました: {unix_socket}")
        else:
            # 通常のTCP接続
            connection = mysql.connector.connect(
                host=db_config.get("host"),
                user=db_config.get("user"),
                password=db_config.get("password"),
                database=db_config.get("database"),
                port=int(db_config.get("port", 3306))
            )
            logger.info(f"TCP接続を使用: {db_config.get('host')}:{db_config.get('port')}")
        
        logger.debug("Database connection successful")
        return connection
    except Exception as e:
        logging.error(f"Database connection failed: {str(e)}")
        raise

def format_video(row):
    try:
        # 日付処理
        created_at = row[2]  # created_atのインデックス
        if isinstance(created_at, date):
            created_at_str = created_at.isoformat()
        else:
            created_at_str = str(created_at)

        # サムネイル処理
        thumbnail = row[1]  # thumbnail_urlのインデックス
        if thumbnail and isinstance(thumbnail, str) and thumbnail.startswith('gs://'):
            bucket_name = thumbnail.split('/')[2]
            object_path = '/'.join(thumbnail.split('/')[3:])
            thumbnail = f"https://storage.googleapis.com/{bucket_name}/{object_path}"

        # ハッシュタグ処理
        hashtags = []
        hashtags_raw = row[16]  # hashtagsのインデックス
        if hashtags_raw:
            try:
                if isinstance(hashtags_raw, str):
                    if hashtags_raw.startswith('['):
                        hashtags = json.loads(hashtags_raw)
                    else:
                        hashtags = [tag.strip() for tag in hashtags_raw.split(',') if tag.strip()]
            except json.JSONDecodeError:
                hashtags = []

        # 音楽情報処理
        music_info = {}
        music_raw = row[17]  # music_infoのインデックス
        if music_raw:
            try:
                if isinstance(music_raw, str):
                    if music_raw.startswith('{'):
                        music_info = json.loads(music_raw)
                    else:
                        music_info = {"title": music_raw}
            except json.JSONDecodeError:
                music_info = {"title": str(music_raw)}

        return {
            "url": row[0],
            "thumbnail_url": thumbnail,
            "created_at": created_at_str,
            "play_count": int(row[3]) if row[3] else 0,
            "play_count_increase": int(row[4]) if row[4] else 0,
            "ten_days_increase": int(row[5]) if row[5] else 0,
            "account_name": row[6],
            "display_name": row[7],
            "content_type": row[8],
            "likes_count": int(row[9]) if row[9] else 0,
            "comment_count": int(row[10]) if row[10] else 0,
            "likes_count_increase": int(row[11]) if row[11] else 0,
            "ten_days_likes_increase": int(row[12]) if row[12] else 0,
            "comment_count_increase": int(row[13]) if row[13] else 0,
            "ten_days_comment_increase": int(row[14]) if row[14] else 0,
            "account_type": row[15] if row[15] else None,
            "hashtags": hashtags,
            "music_info": music_info,
            "audioInfo": music_info,  # 互換性のために残す
            "caption": row[18] if row[18] else None,
            "category": row[19] if row[19] else None,
            "product": row[20] if row[20] else None
        }
    except Exception as e:
        logger.error(f"Error formatting video: {e}")
        logger.error(f"Row data: {row}")
        return {
            "url": row[0] if len(row) > 0 else "",
            "thumbnail_url": "",
            "created_at": "",
            "error": str(e)
        }

def get_db():
    db = get_db_connection()
    try:
        yield db
    finally:
        db.close()

# データベースマイグレーション用の関数
def init_db():
    # This function is not provided in the new code block or the original file
    # It's assumed to exist as it's called in the if __name__ == "__main__" block
    pass

if __name__ == "__main__":
    init_db()