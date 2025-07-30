import os
import json
from dotenv import load_dotenv
from google.cloud import secretmanager
import logging
from typing import Dict, Any, Optional, Literal

# 環境変数の読み込み
load_dotenv()

logger = logging.getLogger(__name__)

class ConfigError(Exception):
    """設定関連のエラーを表すカスタム例外"""
    pass

# 環境の型定義
EnvironmentType = Literal['development', 'production']

# グローバル変数として環境を保持
_environment: Optional[EnvironmentType] = None
_is_initialized: bool = False

def initialize_config() -> None:
    """
    設定を初期化する
    この関数は、アプリケーション起動時に必ず呼び出す必要がある
    """
    global _environment, _is_initialized
    
    if _is_initialized:
        return
        
    env = os.getenv('ENVIRONMENT')
    if env not in ['development', 'production']:
        raise ConfigError(f"Invalid environment: {env}")
        
    _environment = env
    _is_initialized = True
    logger.info(f"Configuration initialized with environment: {env}")

def validate_environment() -> None:
    """
    環境が正しく初期化されているか確認
    """
    if not _is_initialized:
        raise ConfigError("Configuration not initialized. Call initialize_config() first.")

def get_environment() -> EnvironmentType:
    """実行環境を取得"""
    validate_environment()
    return _environment

def get_secret(secret_name: str) -> str:
    """
    Secret Managerから機密情報を取得
    
    Args:
        secret_name: 取得するシークレットの名前
    
    Returns:
        str: シークレットの値
    
    Raises:
        ConfigError: シークレットの取得に失敗した場合
    """
    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.getenv('PROJECT_ID')
        if not project_id:
            raise ConfigError("PROJECT_ID environment variable is not set")
        
        name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logger.error(f"Secret Manager アクセスエラー: {e}")
        raise ConfigError(f"Failed to get secret {secret_name}: {str(e)}")

def get_db_config() -> Dict[str, Any]:
    """
    環境に応じたデータベース設定を取得
    
    Returns:
        Dict[str, Any]: データベース設定
    
    Raises:
        ConfigError: 必要な設定の取得に失敗した場合
    """
    try:
        # INSTANCE_CONNECTION_NAMEが環境変数にある場合はUnixソケット接続を使用
        instance_connection_name = os.environ.get('INSTANCE_CONNECTION_NAME')
        if instance_connection_name:
            logger.info(f"Unixソケット接続を使用: {instance_connection_name}")
            return {
                'user': 'tiktok-user',
                'password': 'tiktok_pass',
                'database': 'tiktok_data',
                'charset': 'utf8mb4'
                # cursorclassは削除（db_utils.pyで設定する）
            }
        
        if get_environment() == 'production':
            # 本番環境: 提供された固定設定を使用
            return {
                'host': '127.0.0.1',
                'user': 'tiktok-user',
                'password': 'tiktok_pass',
                'database': 'tiktok_data',
                'port': 3306,
                'charset': 'utf8mb4'
                # cursorclassは削除（db_utils.pyで設定する）
            }
        else:
            # 開発環境: 環境変数から取得
            return {
                'host': os.getenv('MYSQL_HOST', 'localhost'),
                'port': int(os.getenv('MYSQL_PORT', '3306')),
                'user': os.getenv('MYSQL_USER', 'tiktok_user'),
                'password': os.getenv('MYSQL_PASSWORD', 'tiktok_pass'),
                'database': os.getenv('MYSQL_DATABASE', 'tiktok_data'),
                'charset': 'utf8mb4'
                # cursorclassは削除（db_utils.pyで設定する）
            }
    except ValueError as e:
        raise ConfigError(f"Invalid database configuration: {str(e)}")

def get_pubsub_config() -> Dict[str, Any]:
    """
    Pub/Sub設定を取得
    
    Returns:
        Dict[str, Any]: Pub/Sub設定
    """
    environment = get_environment()
    if environment == 'development':
        os.environ['PUBSUB_EMULATOR_HOST'] = os.getenv('PUBSUB_EMULATOR_HOST', '127.0.0.1:8681')
    
    return {
        'project_id': os.getenv('PROJECT_ID', 'local-project'),
        'is_emulator': environment == 'development'
    }

def get_environment_config() -> Dict[str, Any]:
    """
    環境に応じた設定を取得
    
    Returns:
        Dict[str, Any]: 環境設定
    """
    env = get_environment()
    
    base_config = {
        'project_id': os.getenv('PROJECT_ID'),
        'environment': env
    }
    
    if env == 'development':
        return {
            **base_config,
            'pubsub_emulator_host': os.getenv('PUBSUB_EMULATOR_HOST', '127.0.0.1:8681'),
            'use_emulator': True
        }
    return base_config
