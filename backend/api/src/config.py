import os
import json
from functools import lru_cache

@lru_cache 
def get_db_config() -> dict:
    """
    Cloud Run では Cloud SQL Auth Proxy の Unix-socket
        /cloudsql/<PROJECT>:<REGION>:<INSTANCE>
    を優先し、ローカル開発では host/port（127.0.0.1:3306 など）を使う
    共通の DB 接続設定を返す。
    """
    print("get_db_config() が呼び出されました")

    try:
        # Cloud SQL Auth Proxy が有効なら、この env が必ず入る
        connection_name = os.getenv("INSTANCE_CONNECTION_NAME")

        common = {
            "user":     os.getenv("MYSQL_USER",     "tiktok_user"),
            "password": os.getenv("MYSQL_PASSWORD", "tiktok_pass"),
            "database": os.getenv("MYSQL_DATABASE", "tiktok_data"),
            "charset":  "utf8mb4",
        }

        if connection_name:
            # Unix-socket 接続（Cloud Run / Cloud SQL）
            db_config = {
                **common,
                "unix_socket": f"/cloudsql/{connection_name}",
            }
        else:
            # TCP 接続（ローカル開発用）
            db_config = {
                **common,
                "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
                "port": int(os.getenv("MYSQL_PORT", "3306")),
            }

        # パスワード以外を安全にログ
        print("DB 設定:", {k: v for k, v in db_config.items() if k != "password"})
        return db_config

    except Exception as e:
        print(f"DB 設定の構築で例外: {e}")
        traceback.print_exc()
        raise