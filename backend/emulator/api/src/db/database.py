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
        created_at = row[3]  # created_atカラムのインデックス
        if isinstance(created_at, date):
            created_at_str = created_at.isoformat()
        else:
            created_at_str = str(created_at)
        
        # hashtags処理
        hashtags = []
        hashtags_raw = row[9]  # hashtagsのインデックス
        if hashtags_raw:
            if isinstance(hashtags_raw, str):
                if hashtags_raw.startswith('['):
                    try:
                        hashtags = json.loads(hashtags_raw)
                    except json.JSONDecodeError:
                        print(f"JSONパースエラー（hashtags）: {hashtags_raw}")
                        # カンマ区切りまたは#区切りのハッシュタグを処理
                        if ',' in hashtags_raw:
                            hashtags = [tag.strip() for tag in hashtags_raw.split(',') if tag.strip()]
                        elif '#' in hashtags_raw:
                            hashtags = [tag.strip() for tag in hashtags_raw.split('#') if tag.strip()]
                elif ',' in hashtags_raw:
                    hashtags = [tag.strip() for tag in hashtags_raw.split(',') if tag.strip()]
                elif '#' in hashtags_raw:
                    hashtags = [tag.strip() for tag in hashtags_raw.split('#') if tag.strip()]
        
        # 音楽情報処理 - テキストとして扱う
        audio_info = {}
        audio_raw = row[10]  # audio_infoのインデックス
        if audio_raw:
            if isinstance(audio_raw, str):
                if audio_raw.startswith('{') or audio_raw.startswith('['):
                    try:
                        audio_info = json.loads(audio_raw)
                    except json.JSONDecodeError:
                        audio_info = {"title": audio_raw}
                else:
                    # JSONではない場合、テキストとして格納
                    audio_info = {"title": audio_raw}
            else:
                audio_info = {"title": str(audio_raw)}
        
        # サムネイルパスをURLに変換
        thumbnail = row[2]  # サムネイルカラムのインデックス
        if thumbnail and isinstance(thumbnail, str) and thumbnail.startswith('gs://'):
            # Google Cloud Storageのパスをpublicなurlに変換
            bucket_name = thumbnail.split('/')[2]
            object_path = '/'.join(thumbnail.split('/')[3:])
            thumbnail = f"https://storage.googleapis.com/{bucket_name}/{object_path}"
        
        # 動画データの整形
        # 注意: idフィールドを削除し、music_infoをaudioInfoの別名として追加
        return {
            # "id": row[0],  # IDフィールドを削除
            "url": row[1],
            "thumbnail": thumbnail,
            "created_at": created_at_str,
            "play_count": row[4] or 0,
            "comment_count": row[8] or 0,
            "account_name": row[6],
            "likes_count": row[7] or 0,
            "play_count_increase": row[5] if len(row) > 5 and row[5] is not None else 0, # 再生増加数を追加
            "audioInfo": audio_info,       # 既存のaudioInfoを保持
            "music_info": audio_info,      # 新しくmusic_infoとして同じ内容を追加
            "hashtags": hashtags,
            "caption": row[11] if len(row) > 11 else "",
            "category": row[12] if len(row) > 12 else "その他"
        }
    except Exception as e:
        print(f"行のフォーマット中にエラーが発生: {e}")
        print(f"問題の行: {row}")
        # エラーが発生しても最低限のデータを返す
        return {
            # "id": row[0] if len(row) > 0 else "unknown",  # IDフィールドを削除
            "url": row[1] if len(row) > 1 else "",
            "thumbnail": "",
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