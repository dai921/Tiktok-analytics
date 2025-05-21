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

# coreモジュールのパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# 相対インポートを絶対インポートに変更
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
from google.cloud import secretmanager

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
def sync_crawler_accounts(request):
    """
    クローラーアカウントリストデータをスプレッドシートから同期するCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    start_time = datetime.now()
    logger.info(f"====== クローラーアカウントリスト同期処理開始：{start_time.isoformat()} ======")
    
    try:
        result, status_code = process_crawler_accounts()
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"同期処理完了: 実行時間 {execution_time}秒, 結果: {result}")
        return result, status_code
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def process_crawler_accounts():
    """スプレッドシートからクローラーアカウントデータをデータベースに同期する処理"""
    try:
        print("==== クローラーアカウントリスト同期処理開始 ====")
        
        # SPREADSHEETの確認
        SPREADSHEET_ID = os.getenv('SPREADSHEET_CRAWLER_ID')
        if not SPREADSHEET_ID:
            print("環境変数エラー: SPREADSHEET_CRAWLER_IDが設定されていません")
            raise ValueError("Missing required environment variable: SPREADSHEET_CRAWLER_ID")
        print(f"スプレッドシートID: {SPREADSHEET_ID}")
        
        # Googleスプレッドシートの設定
        print("Googleスプレッドシート設定開始")
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

        # 認証情報の取得処理
        try:
            print("Secret Managerからの認証情報取得開始")
            secret_client = secretmanager.SecretManagerServiceClient()
            secret_name = os.getenv('SHEET_CREDENTIALS_SECRET', 'sheet-credentials')
            
            print(f"プロジェクトID: {project_id}, シークレット名: {secret_name}")
            
            if not project_id:
                print("警告: PROJECT_ID環境変数が設定されていません")
                raise ValueError("PROJECT_ID環境変数が設定されていません")
            
            secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
            print(f"シークレットパス: {secret_path}")
            
            response = secret_client.access_secret_version(name=secret_path)
            print("シークレット取得成功")
            service_account_info = json.loads(response.payload.data.decode('UTF-8'))
            print("認証情報JSONデコード成功")
            
            credentials = service_account.Credentials.from_service_account_info(
                service_account_info, scopes=SCOPES)
            print("クレデンシャル作成完了")
            
        except Exception as auth_error:
            print(f"認証情報取得エラー: {str(auth_error)}")
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                print(f"フォールバック: GOOGLE_APPLICATION_CREDENTIALSを使用: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS')}")
                credentials = service_account.Credentials.from_service_account_file(
                    os.getenv('GOOGLE_APPLICATION_CREDENTIALS'), scopes=SCOPES)
                print("フォールバック認証情報作成完了")
            else:
                print("両方の認証方法に失敗しました")
                raise Exception("サービスアカウント認証情報を取得できません")
        
        print("Sheetsサービス構築開始")
        service = build('sheets', 'v4', credentials=credentials)
        print("Sheetsサービス構築完了")

        # スプレッドシートからデータを読み取る（crawler_account_list）
        print("crawler_account_listシートデータ取得開始")
        range_name = 'crawler_account_list!B:G'  # B列からF列までの範囲を取得
        
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        values = result.get('values', [])

        if not values:
            print("データが見つかりませんでした")
            return 'No data found', 200

        inserted_count = 0
        updated_count = 0
        
        # ヘッダー行をスキップして処理
        for row in values[1:]:
            try:
                # 必要なデータの取得（存在チェック付き）
                username = row[0].strip() if len(row) > 0 and row[0] else None
                password = row[1].strip() if len(row) > 1 and row[1] else None
                proxy = row[3].strip() if len(row) > 3 and row[3] else None
                is_alive = row[4].strip() if len(row) > 4 and row[4] else None
                video_crawler_id = row[5].strip() if len(row) > 5 and row[5] else None

                # 必須項目のチェック
                if not username or not password:
                    print(f"警告: 必須項目が不足しているためスキップします: {row}")
                    continue


                # 既存レコードのチェック
                check_query = '''
                    SELECT id FROM crawler_accounts
                    WHERE username = %(username)s
                '''
                check_params = {'username': username}
                
                existing_record = execute_query(check_query, check_params)

                if existing_record:
                    # 更新
                    update_query = '''
                        UPDATE crawler_accounts 
                        SET password = %(password)s,
                            proxy = %(proxy)s,
                            is_alive = %(is_alive)s,
                            updated_at = NOW(),
                            video_crawler_id = %(video_crawler_id)s
                        WHERE username = %(username)s
                    '''
                    update_params = {
                        'username': username,
                        'password': password,
                        'proxy': proxy,
                        'is_alive': is_alive,
                        'video_crawler_id': video_crawler_id
                    }
                    
                    affected_rows = execute_write_query(update_query, update_params)
                    if affected_rows > 0:
                        updated_count += 1
                else:
                    # 新規挿入
                    insert_query = '''
                        INSERT INTO crawler_accounts 
                        (username, password, proxy, is_alive, created_at, updated_at, video_crawler_id)
                        VALUES (%(username)s, %(password)s, %(proxy)s, 
                                %(is_alive)s, NOW(), NOW(), %(video_crawler_id)s)
                    '''
                    insert_params = {
                        'username': username,
                        'password': password,
                        'proxy': proxy,
                        'is_alive': is_alive,
                        'video_crawler_id': video_crawler_id
                    }
                    
                    affected_rows = execute_write_query(insert_query, insert_params)
                    if affected_rows > 0:
                        inserted_count += 1

            except Exception as row_error:
                print(f"行の処理中にエラーが発生: {str(row_error)}")
                continue

        return f'Successfully processed crawler accounts: {inserted_count} inserted, {updated_count} updated', 200

    except Exception as e:
        print(f"==== クローラーアカウントリスト同期処理致命的エラー: {str(e)} ====")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカル環境でクローラーアカウントリスト同期を開始します...")
    try:
        result, status_code = process_crawler_accounts()
        logger.info(f"実行結果 (ステータスコード: {status_code}):")
        logger.info(result)
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        sys.exit(1) 