import os
import json
from functools import lru_cache

@lru_cache 
def get_db_config():
    """
    データベース接続情報を取得する
    """
    print("get_db_config()が呼び出されました")
    
    try:
        db_config = {
            "host": os.environ.get("MYSQL_HOST", "localhost"),
            "user": os.environ.get("MYSQL_USER", "tiktok_user"),
            "password": os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
            "database": os.environ.get("MYSQL_DATABASE", "tiktok_data"),
            "port": int(os.environ.get("MYSQL_PORT", "3306"))
        }
        
        # パスワード以外の設定をログに出力
        safe_config = {k: v for k, v in db_config.items() if k != "password"}
        print(f"環境変数から取得したDB設定: {safe_config}")
        return db_config
        
    except Exception as e:
        print(f"データベース設定の取得中に例外が発生: {e}")
        # スタックトレースも出力
        import traceback
        traceback.print_exc()
        
        # フォールバック：環境変数から直接取得
        db_config = {
            "host": os.environ.get("MYSQL_HOST", "localhost"),
            "user": os.environ.get("MYSQL_USER", "tiktok_user"),
            "password": os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
            "database": os.environ.get("MYSQL_DATABASE", "tiktok_data"),
            "port": int(os.environ.get("MYSQL_PORT", "3306"))
        }
        
        # パスワード以外の設定をログに出力
        safe_config = {k: v for k, v in db_config.items() if k != "password"}
        print(f"フォールバックDB設定: {safe_config}")
        return db_config 