import os
import json
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
import functions_framework
import logging
from datetime import datetime
from db_utils import get_connection, execute_query, execute_write_query, batch_insert, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message

# .envファイルのサポートを追加
try:
    from dotenv import load_dotenv
    load_dotenv()  # .envファイルから環境変数を読み込む
    print("環境変数が.envファイルから読み込まれました")
except ImportError:
    print("python-dotenvがインストールされていないため、.envファイルは使用されません")
    print("必要な場合は `pip install python-dotenv` でインストールしてください")

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def scheduled_job(request):
    """
    アカウント管理スプレッドシートの同期を行うCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    start_time = datetime.now()
    logger.info(f"====== アカウント同期処理開始：{start_time.isoformat()} ======")
    
    try:
        result, status_code = sync_spreadsheet()
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"同期処理完了: 実行時間 {execution_time}秒, 結果: {result}")
        return result, status_code
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def sync_spreadsheet():
    """スプレッドシートとデータベースの同期処理"""
    try:
        # Googleスプレッドシートの設定
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')

        # 環境変数の検証
        validate_env_vars()

        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        service = build('sheets', 'v4', credentials=credentials)

        # スプレッドシートからデータを読み取る
        range_name = 'アカウント管理シート!C2:G'
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        values = result.get('values', [])

        if not values:
            return 'No data found', 200

        logger.info(f"Found {len(values)} rows in spreadsheet")  # デバッグ用

        # データをMySQLに保存
        inserted_count = 0
        for row in values:
            try:
                # 行の長さを確認してデバッグ出力
                logger.debug(f"Row length: {len(row)}")
                logger.debug(f"Row content: {row}")

                account_url = row[0].strip() if len(row) > 0 else None      # C列：URL
                account_name = row[2].strip() if len(row) > 2 else None     # E列：アカウント名
                under_100k_flag = row[3].strip() if len(row) > 3 else None  # F列：フラグ
                content_type = row[4].strip() if len(row) > 4 else None     # G列：コンテンツタイプ

                # URLとアカウント名が存在する場合のみ処理
                if account_url and account_name:
                    logger.debug(f"Processing: URL={account_url}, Name={account_name}, Flag={under_100k_flag}, Type={content_type}")
                    
                    # needs_updateの設定
                    # 条件1: 10万未満フラグが'o'の場合はFALSE、それ以外の場合はTRUE
                    # 条件2: content_typeが'affi'以外の場合はFALSE
                    needs_update = under_100k_flag != 'o' and (content_type == 'affi' if content_type else False)
                    
                    insert_query = '''
                        INSERT INTO account_list 
                        (account_url, account_name, under_100k_flag, is_new_account, needs_update, content_type)
                        VALUES (%(account_url)s, %(account_name)s, %(under_100k_flag)s, TRUE, %(needs_update)s, %(content_type)s)
                    '''
                    insert_params = {
                        'account_url': account_url,
                        'account_name': account_name,
                        'under_100k_flag': under_100k_flag,
                        'needs_update': needs_update,
                        'content_type': content_type
                    }
                    
                    affected_rows = execute_write_query(insert_query, insert_params)
                    inserted_count += affected_rows

            except DatabaseError as row_error:
                logger.error(f"Error processing row: {row}")
                logger.error(f"Error details: {str(row_error)}")
                continue

        logger.info(f"Successfully inserted {inserted_count} new accounts")

        # 同期完了後、通知メッセージを送信
        completion_message = {
            'timestamp': datetime.now().isoformat(),
            'status': 'success',
            'inserted_count': inserted_count
        }
        
        # Pub/Subユーティリティを使用してメッセージを送信
        publish_message('spreadsheet-completion', completion_message)
        logger.info(f"完了通知を送信しました")

        return f'Successfully inserted {inserted_count} new accounts', 200

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return str(e), 500

def validate_env_vars():
    """必要な環境変数が設定されているか確認"""
    required_envs = [
        'GOOGLE_APPLICATION_CREDENTIALS',
        'SPREADSHEET_ID',
        'MYSQL_HOST',
        'MYSQL_USER',
        'MYSQL_PASSWORD',
        'MYSQL_DATABASE'
    ]
    missing_envs = [env for env in required_envs if not os.getenv(env)]
    if missing_envs:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_envs)}")

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカル環境でスプレッドシートの同期を開始します...")
    try:
        validate_env_vars()
        result, status_code = sync_spreadsheet()
        logger.info(f"実行結果 (ステータスコード: {status_code}):")
        logger.info(result)
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        sys.exit(1)
