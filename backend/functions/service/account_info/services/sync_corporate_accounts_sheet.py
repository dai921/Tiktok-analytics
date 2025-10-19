import os
import sys
import json
import logging
import base64
from typing import Any, Dict, List, Optional, Tuple

from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.cloud import secretmanager

# coreモジュールのパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from core.db_utils import execute_query, execute_write_query  # type: ignore
from core.config import initialize_config  # type: ignore


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()


def _get_sheets_service():
    """Google Sheets API のサービスクライアントを取得する"""
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
    try:
        secret_client = secretmanager.SecretManagerServiceClient()
        secret_name = os.getenv('SHEET_CREDENTIALS_SECRET', 'sheet-credentials')
        project_id = os.getenv('PROJECT_ID')
        if not project_id:
            raise ValueError("PROJECT_ID環境変数が設定されていません")
        secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = secret_client.access_secret_version(name=secret_path)
        service_account_info = json.loads(response.payload.data.decode('UTF-8'))
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES
        )
    except Exception as auth_error:
        logger.warning(f"Secret Managerからの認証取得に失敗: {auth_error}")
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            credentials = service_account.Credentials.from_service_account_file(
                os.getenv('GOOGLE_APPLICATION_CREDENTIALS'), scopes=SCOPES
            )
        else:
            raise
    return build('sheets', 'v4', credentials=credentials)


def _extract_with_index(row: List[str], index: int) -> Optional[str]:
    return row[index].strip() if len(row) > index and row[index] else None


def _upsert_corporate_account(account_url: str, second_type: Optional[str], third_type: Optional[str], hashtags: Optional[str]) -> Tuple[bool, bool]:
    """
    account_url から account_list.id を取得して corporate_accounts をUPSERTする。
    Returns: (inserted, updated)
    """
    # account_listから企業アカウントのみ対象
    select_query = """
        SELECT id 
        FROM account_list 
        WHERE account_url = %(account_url)s 
          AND parent_account_type = '企業アカウント' 
          AND favorite_user_is_alive = 1
        LIMIT 1
    """
    rows = execute_query(select_query, {"account_url": account_url})
    if not rows:
        return (False, False)  # 該当アカウントが未登録 or 企業以外

    account_id = rows[0]['id']

    upsert_sql = """
        INSERT INTO corporate_accounts (
            account_id, second_account_type, third_account_type, account_hashtags, created_at, updated_at
        ) VALUES (
            %(account_id)s, %(second)s, %(third)s, %(hashtags)s, NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
            second_account_type = VALUES(second_account_type),
            third_account_type  = VALUES(third_account_type),
            account_hashtags    = VALUES(account_hashtags),
            updated_at          = NOW()
    """

    params = {
        "account_id": account_id,
        "second": second_type,
        "third": third_type,
        "hashtags": (hashtags or None)
    }

    affected = execute_write_query(upsert_sql, params)
    # PyMySQLのaffected_rowsは 1: insert, 2: update 扱いになる場合があるが、ここでは真偽で返す
    return (affected == 1, affected == 2)


def sync_corporate_accounts_from_sheet(event, context):
    """
    Pub/SubトリガのCloudEventエントリーポイント。
    前段の sync_account_list 完了後に起動し、アカウント作業用シートのH/I/J列を corporate_accounts へ同期する。

    シート列マッピング（範囲: B:N 基準の0始まり index）
      - B(0): account_url（キー）
      - H(6): second_account_type
      - I(7): third_account_type
      - J(8): account_hashtags
    """
    try:
        message_data = {}
        if event and 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            try:
                message_data = json.loads(pubsub_message) if pubsub_message else {}
            except json.JSONDecodeError:
                message_data = {"raw": pubsub_message}

        logger.info(f"受信メッセージ: {message_data}")

        spreadsheet_id = os.getenv('SPREADSHEET_ID')
        if not spreadsheet_id:
            raise ValueError("Missing required environment variable: SPREADSHEET_ID")

        service = _get_sheets_service()

        # アカウント作業用シートから B:N を取得（H/I/Jを含む）
        range_name = 'アカウント作業用シート!B:N'
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        values: List[List[str]] = result.get('values', [])
        if not values or len(values) <= 1:
            return {"status": "success", "message": "No rows to process"}

        header = values[0]
        logger.info(f"ヘッダー: {header}")

        inserted_count = 0
        updated_count = 0
        skipped_count = 0

        for row in values[1:]:
            try:
                account_url = _extract_with_index(row, 0)  # B列
                if not account_url:
                    skipped_count += 1
                    continue

                second_type = _extract_with_index(row, 6)  # H列
                third_type  = _extract_with_index(row, 7)  # I列
                hashtags    = _extract_with_index(row, 8)  # J列

                inserted, updated = _upsert_corporate_account(account_url, second_type, third_type, hashtags)
                if inserted:
                    inserted_count += 1
                elif updated:
                    updated_count += 1
                else:
                    skipped_count += 1
            except Exception as row_err:
                logger.warning(f"行処理スキップ: {row_err}")
                skipped_count += 1

        msg = f"corporate_accounts同期完了: inserted={inserted_count}, updated={updated_count}, skipped={skipped_count}"
        logger.info(msg)
        return {"status": "success", "message": msg}

    except Exception as e:
        logger.error(f"corporate_accounts同期エラー: {e}")
        return {"status": "error", "message": str(e)}


