import pymysql
import logging
from typing import Dict, Any, List, Optional, Callable
from pymysql.cursors import DictCursor
from contextlib import contextmanager
import functools

from config import get_db_config, ConfigError

logger = logging.getLogger(__name__)

class DatabaseError(Exception):
    """データベース操作に関するエラーを表すカスタム例外"""
    pass

@contextmanager
def get_connection():
    """
    データベース接続を提供するコンテキストマネージャー
    
    Yields:
        Connection: データベース接続オブジェクト
    
    Raises:
        DatabaseError: 接続の確立に失敗した場合
    """
    try:
        config = get_db_config()
        # cursorclassが重複しないように設定
        config_copy = config.copy()
        if 'cursorclass' in config_copy:
            del config_copy['cursorclass']
        
        connection = pymysql.connect(
            **config_copy,
            cursorclass=DictCursor
        )
        yield connection
    except ConfigError as e:
        raise DatabaseError(f"Failed to get database configuration: {str(e)}")
    except pymysql.Error as e:
        raise DatabaseError(f"Database connection error: {str(e)}")
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()

def execute_query(query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    SQLクエリを実行し、結果を返す
    
    Args:
        query: 実行するSQLクエリ
        params: クエリパラメータ（オプション）
    
    Returns:
        List[Dict[str, Any]]: クエリ結果
    
    Raises:
        DatabaseError: クエリ実行に失敗した場合
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchall()
    except Exception as e:
        logger.error(f"Query execution error: {str(e)}")
        raise DatabaseError(f"Failed to execute query: {str(e)}")

def execute_write_query(query: str, params: Optional[Dict[str, Any]] = None) -> int:
    """
    書き込みクエリ（INSERT/UPDATE/DELETE）を実行し、影響を受けた行数を返す
    
    Args:
        query: 実行するSQLクエリ
        params: クエリパラメータ（オプション）
    
    Returns:
        int: 影響を受けた行数
    
    Raises:
        DatabaseError: クエリ実行に失敗した場合
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                affected_rows = cursor.execute(query, params)
                conn.commit()
                return affected_rows
    except Exception as e:
        logger.error(f"Write query execution error: {str(e)}")
        raise DatabaseError(f"Failed to execute write query: {str(e)}")

def with_transaction(func: Callable) -> Callable:
    """
    関数をトランザクションでラップするデコレータ
    
    Args:
        func: ラップする関数
    
    Returns:
        Callable: トランザクションでラップされた関数
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with get_connection() as conn:
            try:
                conn.begin()
                result = func(conn, *args, **kwargs)
                conn.commit()
                return result
            except Exception as e:
                conn.rollback()
                logger.error(f"Transaction error: {str(e)}")
                raise DatabaseError(f"Transaction failed: {str(e)}")
    return wrapper

def batch_insert(table: str, columns: List[str], values: List[List[Any]]) -> int:
    """
    バッチインサートを実行する
    
    Args:
        table: テーブル名
        columns: カラム名のリスト
        values: 挿入する値のリスト（リストのリスト）
    
    Returns:
        int: 挿入された行数
    
    Raises:
        DatabaseError: バッチインサートに失敗した場合
    """
    if not values:
        return 0
        
    placeholders = ', '.join(['%s'] * len(columns))
    columns_str = ', '.join(columns)
    query = f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})"
    
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                affected_rows = cursor.executemany(query, values)
                conn.commit()
                return affected_rows
    except Exception as e:
        logger.error(f"Batch insert error: {str(e)}")
        raise DatabaseError(f"Failed to execute batch insert: {str(e)}")