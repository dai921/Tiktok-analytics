import os
import json
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
import functions_framework
import logging
from datetime import datetime
from typing import List, Dict, Any
import base64

# coreパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# 依存インポートのパスに変更
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
from google.cloud import secretmanager

# .envファイルのサポートを追加
try:
    from dotenv import load_dotenv
    load_dotenv()  # .envファイルから環境変数を読み込み
    print("環境変数を.envファイルから読み込みました")
except ImportError:
    print("python-dotenvがインストールされていないため、.envファイルは使用しません")
    print("必要な場合は `pip install python-dotenv` でインストールしてください")

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"プロジェクトID: {project_id}")

@functions_framework.http
def sync_insta_account_list(request):
    """
    instaアカウントリストデータをスプレッドシートから同期するCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    start_time = datetime.now()
    logger.info(f"====== instaアカウントリスト同期開始: {start_time.isoformat()} ======")
    
    try:
        result, status_code = process_insta_account_list()
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"同期結果: 実行時間 {execution_time}秒, 結果: {result}")

        # 後続の処理にアカウントデータ同期の完了を通知
        try:
            publish_message("sync-insta-accounts", {
                "status": "success" if status_code == 200 else "unknown",
                "previous_step": "sync_insta_account_list",
                "message": result,
                "execution_time": execution_time
            })
        except Exception as pubsub_error:
            logger.error(f"instaアカウント同期トリガーの送信に失敗: {str(pubsub_error)}")

        return result, status_code
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def get_sheets_service():
    """Google Sheets API クライアントを初期化して返す"""
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    try:
        print("Secret Managerからの認証情報取得開始")
        secret_client = secretmanager.SecretManagerServiceClient()
        secret_name = os.getenv('SHEET_CREDENTIALS_SECRET', 'sheet-credentials')
        project_id = os.getenv('PROJECT_ID')

        print(f"プロジェクトID: {project_id}, シークレット名: {secret_name}")

        if not project_id:
            print("警告: PROJECT_ID環境変数が設定されていません")
            raise ValueError("PROJECT_ID環境変数が設定されていません")

        secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        print(f"シークレットパス: {secret_path}")

        response = secret_client.access_secret_version(name=secret_path)
        print("シークレット取得完了")
        service_account_info = json.loads(response.payload.data.decode('UTF-8'))
        print("認証情報JSONデコード完了")

        credentials = service_account.Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES)
        print("クレデンシャル生成完了")
    except Exception as auth_error:
        print(f"認証情報取得エラー: {str(auth_error)}")
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            print(f"フォールバック: GOOGLE_APPLICATION_CREDENTIALSを使用: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS')}")
            credentials = service_account.Credentials.from_service_account_file(
                os.getenv('GOOGLE_APPLICATION_CREDENTIALS'), scopes=SCOPES)
            print("フォールバック認証情報生成完了")
        else:
            print("他の認証手段に失敗しました")
            raise Exception("サービスアカウント認証情報を取得できませんでした")

    print("Sheetsサービス初期化開始")
    service = build('sheets', 'v4', credentials=credentials)
    print("Sheetsサービス初期化完了")
    return service

def sync_sheet_data_to_table(service, spreadsheet_id, range_name, table_name, job_label, include_play_count=True):
    """
    指定したスプレッドシートのデータを読み込み、DBテーブルへ同期する
    """
    try:
        if not spreadsheet_id:
            message = f"{job_label}: スプレッドシートIDが設定されていません"
            print(message)
            return message, 500

        print(f"{job_label}: スプレッドシートID: {spreadsheet_id}")
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        values = result.get('values', [])

        if not values:
            print(f"{job_label}: データが見つかりませんでした")
            return f'{job_label}: No data found', 200

        inserted_count = 0
        updated_count = 0

        update_fields = [
            "favorite_user_username = %(favorite_user_username)s",
            "account_type = %(account_type)s",
            "crawler_account_id = %(crawler_account_id)s",
            "updated_at = NOW()",
            "parent_account_type = %(parent_account_type)s"
        ]
        if include_play_count:
            update_fields.append("play_count_crawler_id = %(play_count_crawler_id)s")
        update_fields.append("delete_flag = %(delete_flag)s")

        insert_columns = [
            "account_url",
            "favorite_user_username",
            "account_type",
            "crawler_account_id",
            "created_at",
            "updated_at",
            "parent_account_type"
        ]
        insert_values = [
            "%(account_url)s",
            "%(favorite_user_username)s",
            "%(account_type)s",
            "%(crawler_account_id)s",
            "NOW()",
            "NOW()",
            "%(parent_account_type)s"
        ]
        if include_play_count:
            insert_columns.append("play_count_crawler_id")
            insert_values.append("%(play_count_crawler_id)s")
        insert_columns.append("delete_flag")
        insert_values.append("%(delete_flag)s")

        update_query = f'''
            UPDATE {table_name}
            SET {", ".join(update_fields)}
            WHERE account_url = %(account_url)s
        '''
        insert_query = f'''
            INSERT INTO {table_name}
            ({", ".join(insert_columns)})
            VALUES ({", ".join(insert_values)})
        '''
        check_query = f'''
            SELECT id FROM {table_name}
            WHERE account_url = %(account_url)s
        '''

        for row in values[1:]:
            try:
                account_url = row[0].strip() if len(row) > 0 and row[0] else None
                favorite_user_username = row[1].strip() if len(row) > 1 and row[1] else None
                account_type = row[5].strip() if len(row) > 5 and row[5] else None
                crawler_account_id = row[9].strip() if len(row) > 9 and row[9] else None
                delete_flag = row[10].strip() if len(row) > 10 and row[10] else None
                parent_account_type = row[11].strip() if len(row) > 11 and row[11] else None
                play_count_crawler_id = row[12].strip() if include_play_count and len(row) > 12 and row[12] else None

                if not account_url or not favorite_user_username:
                    print(f"{job_label}: 必須列が欠けているためスキップ: {row}")
                    continue

                db_params = {
                    'account_url': account_url,
                    'favorite_user_username': favorite_user_username,
                    'account_type': account_type,
                    'crawler_account_id': crawler_account_id,
                    'parent_account_type': parent_account_type,
                    'delete_flag': delete_flag
                }
                if include_play_count:
                    db_params['play_count_crawler_id'] = play_count_crawler_id

                existing_record = execute_query(check_query, {'account_url': account_url})

                if existing_record:
                    affected_rows = execute_write_query(update_query, db_params)
                    if affected_rows > 0:
                        updated_count += 1
                else:
                    affected_rows = execute_write_query(insert_query, db_params)
                    if affected_rows > 0:
                        inserted_count += 1

            except Exception as row_error:
                print(f"{job_label}: 行処理中にエラー発生: {str(row_error)}")
                continue

        return f'{job_label}: {inserted_count} inserted, {updated_count} updated', 200

    except Exception as e:
        print(f"{job_label}: 同期処理で予期せぬエラー: {str(e)}")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

def process_insta_account_list():
    """スプレッドシートからinstaアカウントリストデータをデータベースに同期する処理"""
    try:
        print("==== instaアカウントリスト同期処理開始 ====")

        service = get_sheets_service()

        result, status = sync_sheet_data_to_table(
            service=service,
            spreadsheet_id=os.getenv('SPREADSHEET_ID'),
            range_name='instaアカウント作業用シート!B:N',
            table_name='insta_account_list',
            job_label='instaアカウント作業用シート',
            include_play_count=False
        )

        return result, status

    except Exception as e:
        print(f"==== instaアカウントリスト同期処理で例外発生: {str(e)} ====")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカル環境でinstaアカウントリスト同期を開始します...")
    try:
        result, status_code = process_insta_account_list()
        logger.info(f"実行結果 (ステータスコード: {status_code}):")
        logger.info(result)
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        sys.exit(1)
