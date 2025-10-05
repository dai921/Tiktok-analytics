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

# 共通設定の取得
cfg = get_db_config()  # user / password / database / host? / port? / unix_socket?
MYSQL_USER = cfg["user"]
MYSQL_PASS = cfg["password"]
MYSQL_DATABASE = cfg["database"]
MYSQL_HOST = cfg.get("host", "127.0.0.1")
MYSQL_PORT = cfg.get("port", 3306)
UNIX_SOCKET = cfg.get("unix_socket")  # 例: /cloudsql/<PROJECT>:<REGION>:<INSTANCE>

# Cloud Run では /cloudsql の Unix ソケットを優先、ローカル等は TCP
if UNIX_SOCKET:
    logger.info("Using Unix socket for Cloud SQL: %s", UNIX_SOCKET)
    engine = create_engine(
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASS}@/{MYSQL_DATABASE}?unix_socket={UNIX_SOCKET}",
        pool_size=5,
        max_overflow=5,
        pool_timeout=30,
        pool_pre_ping=True,
    )
else:
    logger.info("Using TCP connection to MySQL host=%s port=%s", MYSQL_HOST, MYSQL_PORT)
    engine = create_engine(
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASS}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}",
        pool_size=5,
        max_overflow=5,
        pool_timeout=30,
        pool_pre_ping=True,
    )
logger.info("MySQL engine initialised")

def get_db_connection():
    """プールから 1 つ借りるだけ（毎回 0.5ms 程度）"""
    return engine.connect()

def execute_query(query, params=None):
    """SQLクエリを実行して結果を辞書のリストとして返す"""
    with engine.connect() as conn:
        sql = text(query)
        result = conn.execute(sql, params or {})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

def fetch_one(query, params=None):
    """SQLクエリを実行して1行の結果を辞書として返す"""
    with engine.connect() as conn:
        sql = text(query)
        result = conn.execute(sql, params or {})
        row = result.fetchone()
        if row:
            return dict(zip(result.keys(), row))
        return None

def execute_update(query, params=None):
    """更新クエリを実行する"""
    with engine.connect() as conn:
        sql = text(query)
        conn.execute(sql, params or {})
        conn.commit()
def get_db():
    db = get_db_connection()
    try:
        yield db
    finally:
        db.close()

def init_db():
    pass

if __name__ == "__main__":
    init_db()