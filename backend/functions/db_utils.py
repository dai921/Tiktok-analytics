import os  # 完全なosモジュールをインポート
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
    Unixソケットを使用してCloud SQLに接続
    
    Yields:
        Connection: データベース接続オブジェクト
    
    Raises:
        DatabaseError: 接続の確立に失敗した場合
    """
    connection = None
    try:
        config = get_db_config()
        
        # インスタンス接続名を取得
        instance_connection_name = os.environ.get('INSTANCE_CONNECTION_NAME')
        logger.info(f"DB接続を試みます: {instance_connection_name}")
        
        if instance_connection_name:
            # Cloud FunctionからのUnixソケット接続
            unix_socket = f'/cloudsql/{instance_connection_name}'
            
            # 接続パラメータから不要な設定を削除
            connection_params = {k: v for k, v in config.items() if k not in ['host', 'port']}
            
            # 必要なパラメータのみ設定
            connection_params.update({
                'unix_socket': unix_socket,
                'cursorclass': pymysql.cursors.DictCursor
            })
            
            logger.info(f"Unixソケット接続パラメータ: {connection_params}")
            connection = pymysql.connect(**connection_params)
        else:
            # 開発環境での接続
            logger.info("通常接続を使用します")
            connection = pymysql.connect(
                **config,
                cursorclass=DictCursor
            )
        
        yield connection
        
    except Exception as e:
        logger.error(f"データベース接続エラー: {str(e)}", exc_info=True)
        raise DatabaseError(f"データベース接続に失敗しました: {str(e)}")
    finally:
        if connection and connection.open:
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