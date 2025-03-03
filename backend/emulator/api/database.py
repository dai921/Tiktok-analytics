import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
import json
import os
from datetime import date
from logger_config import setup_logger
import logging

print("database.py is being loaded")
logger = setup_logger()

def get_db_connection():
    """データベース接続を取得"""
    print("get_db_connection was called!")
    try:
        connection = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST', 'host.docker.internal'),
            user=os.getenv('MYSQL_USER', 'tiktok_user'),
            password=os.getenv('MYSQL_PASSWORD', 'tiktok_pass'),
            database=os.getenv('MYSQL_DATABASE', 'tiktok_data'),
            port=int(os.getenv('MYSQL_PORT', '3306'))
        )
        logger.debug("Database connection successful")
        return connection
    except Exception as e:
        logging.error(f"Database connection failed: {str(e)}")
        raise

def format_video(row):
    """データベースの行をAPIレスポンス形式に変換"""
    return {
        "id": row[0],
        "url": row[1],
        "thumbnail": {
            "valueType": "IMAGE",
            "url": row[2]
        } if row[2] else None,
        "createdAt": row[3].strftime("%y/%m/%d") if row[3] else None,
        "views": row[4] or 0,
        "viewsIncrease": row[5] or 0,
        "accountName": row[6],
        "likes": row[7] or 0,
        "comments": row[8] or 0,
        "hashtags": json.loads(row[9]) if row[9] else [],
        "audioInfo": json.loads(row[10]) if row[10] else {},
        "description": row[11]
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