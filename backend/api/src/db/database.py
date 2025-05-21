from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import json
import os
from datetime import date, datetime
from src.utils.logger_config import setup_logger
import logging
from src.config import get_db_config  # 新しい設定モジュールをインポート

print("database.py is being loaded")
logger = setup_logger()
# ★これを get_db_connection() の "上" に追加
cfg = get_db_config()                # host / user / password / database / port
MYSQL_HOST = cfg.get("host", "127.0.0.1")          # ← Auth Proxy なので localhost
MYSQL_PORT = cfg.get("port", 3306)
MYSQL_USER = cfg["user"]
MYSQL_PASS = cfg["password"]
MYSQL_DATABASE = cfg["database"]

engine = create_engine(
    f"mysql+mysqldb://{MYSQL_USER}:{MYSQL_PASS}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}",
    pool_size=60,      # 1 Pod 上限
    max_overflow=0,    # 超えたら待機
    pool_timeout=30,
    pool_pre_ping=True
)
logger.info("MySQL engine initialised pool_size=60")

def get_db_connection():
    """プールから 1 つ借りるだけ（毎回 0.5ms 程度）"""
    return engine.connect()

def execute_query(query, params=None):
    """SQLクエリを実行して結果を辞書のリストとして返す"""
    with engine.connect() as conn:
        # SQLAlchemyのtext()でクエリをラップ
        sql = text(query)
        result = conn.execute(sql, params or {})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

def fetch_one(query, params=None):
    """SQLクエリを実行して1行の結果を辞書として返す"""
    with engine.connect() as conn:
        # SQLAlchemyのtext()でクエリをラップ
        sql = text(query)
        result = conn.execute(sql, params or {})
        row = result.fetchone()
        if row:
            return dict(zip(result.keys(), row))
        return None

def execute_update(query, params=None):
    """更新クエリを実行する"""
    with engine.connect() as conn:
        # SQLAlchemyのtext()でクエリをラップ
        sql = text(query)
        conn.execute(sql, params or {})
        conn.commit()

def format_video(row):
    try:
        # 日付処理
        created_at = row['created_at']  # created_atキー
        if isinstance(created_at, date):
            created_at_str = created_at.isoformat()
        else:
            created_at_str = str(created_at)

        # サムネイル処理
        thumbnail = row['thumbnail_url']  # thumbnail_urlキー
        if thumbnail and isinstance(thumbnail, str) and thumbnail.startswith('gs://'):
            bucket_name = thumbnail.split('/')[2]
            object_path = '/'.join(thumbnail.split('/')[3:])
            thumbnail = f"https://storage.googleapis.com/{bucket_name}/{object_path}"

        # ハッシュタグ処理
        hashtags = []
        hashtags_raw = row['hashtags']  # hashtagsキー
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
        music_raw = row['music_info']  # music_infoキー
        if music_raw:
            try:
                if isinstance(music_raw, str):
                    if music_raw.startswith('{'):
                        music_info = json.loads(music_raw)
                    else:
                        music_info = {"title": music_raw}
            except json.JSONDecodeError:
                music_info = {"title": str(music_raw)}

        # 保存数データを取得（キー名に基づいてアクセス）
        save_count = int(row['save_count']) if 'save_count' in row and row['save_count'] is not None else 0
        save_count_increase = int(row['save_count_increase']) if 'save_count_increase' in row and row['save_count_increase'] is not None else 0
        ten_days_save_increase = int(row['ten_days_save_increase']) if 'ten_days_save_increase' in row and row['ten_days_save_increase'] is not None else 0

        return {
            "url": row['url'],
            "thumbnail_url": thumbnail,
            "created_at": created_at_str,
            "play_count": int(row['play_count']) if row['play_count'] else 0,
            "play_count_increase": int(row['play_count_increase']) if row['play_count_increase'] else 0,
            "ten_days_increase": int(row['ten_days_increase']) if row['ten_days_increase'] else 0,
            "account_name": row['account_name'],
            "display_name": row['display_name'],
            "content_type": row['content_type'],
            "likes_count": int(row['likes_count']) if row['likes_count'] else 0,
            "comment_count": int(row['comment_count']) if row['comment_count'] else 0,
            "likes_count_increase": int(row['likes_count_increase']) if row['likes_count_increase'] else 0,
            "ten_days_likes_increase": int(row['ten_days_likes_increase']) if row['ten_days_likes_increase'] else 0,
            "comment_count_increase": int(row['comment_count_increase']) if row['comment_count_increase'] else 0,
            "ten_days_comment_increase": int(row['ten_days_comment_increase']) if row['ten_days_comment_increase'] else 0,
            "account_type": row['account_type'] if row['account_type'] else None,
            "hashtags": hashtags,
            "music_info": music_info,
            "audioInfo": music_info,  # 互換性のために残す
            "caption": row['caption'] if row['caption'] else None,
            "category": row['category'] if row['category'] else None,
            "product": row['product'] if row['product'] else None,
            "save_count": save_count,
            "save_count_increase": save_count_increase,
            "ten_days_save_increase": ten_days_save_increase
        }
    except Exception as e:
        logger.error(f"Error formatting video: {e}")
        logger.error(f"Row data: {row}")
        return {
            "url": row['url'] if 'url' in row else "",
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