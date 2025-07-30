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

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"プロジェクトID: {project_id}")

@functions_framework.http
def sync_account_list(request):
    """
    アカウントリストデータをスプレッドシートから同期するCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    start_time = datetime.now()
    logger.info(f"====== アカウントリスト同期処理開始：{start_time.isoformat()} ======")
    
    try:
        # 実行可能かチェック
        if not check_last_execution():
            message = "前回の実行から36時間経過していないため、処理をスキップします"
            logger.info(message)
            return message, 200
            
        result, status_code = process_account_list()
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"同期処理完了: 実行時間 {execution_time}秒, 結果: {result}")
        return result, status_code
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def process_account_list():
    """スプレッドシートからアカウントリストデータをデータベースに同期する処理"""
    try:
        print("==== アカウントリスト同期処理開始 ====")
        
        # SPREADSHEETの確認
        SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')
        if not SPREADSHEET_ID:
            print("環境変数エラー: SPREADSHEET_IDが設定されていません")
            raise ValueError("Missing required environment variable: SPREADSHEET_ID")
        print(f"スプレッドシートID: {SPREADSHEET_ID}")
        
        # Googleスプレッドシートの設定
        print("Googleスプレッドシート設定開始")
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

        # 認証情報の取得処理
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

        # スプレッドシートからデータを読み取る（アカウント作業用シート）
        print("アカウント作業用シートデータ取得開始")
        range_name = '運用代行シート!B:K'  # B列からK列までの範囲を取得
        
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
                account_url = row[0].strip() if len(row) > 0 and row[0] else None
                favorite_user_username = row[1].strip() if len(row) > 1 and row[1] else None
                account_type = row[5].strip() if len(row) > 5 and row[5] else None
                crawler_account_id = row[6].strip() if len(row) > 6 and row[6] else None
                parent_type = row[8].strip() if len(row) > 8 and row[8] else None
                play_count_crawler_id = row[9].strip() if len(row) > 9 and row[9] else None

                # 必須項目のチェック
                if not account_url or not favorite_user_username:
                    print(f"警告: 必須項目が不足しているためスキップします: {row}")
                    continue


                # 既存レコードのチェック
                check_query = '''
                    SELECT id FROM test_account_list
                    WHERE account_url = %(account_url)s
                '''
                check_params = {'account_url': account_url}
                
                existing_record = execute_query(check_query, check_params)

                if existing_record:
                    # 更新
                    update_query = '''
                        UPDATE test_account_list 
                        SET favorite_user_username = %(favorite_user_username)s,
                            account_type = %(account_type)s,
                            crawler_account_id = %(crawler_account_id)s,
                            updated_at = NOW(),
                            parent_type = %(parent_type)s,
                            play_count_crawler_id = %(play_count_crawler_id)s
                        WHERE account_url = %(account_url)s
                    '''
                    update_params = {
                        'account_url': account_url,
                        'favorite_user_username': favorite_user_username,
                        'account_type': account_type,
                        'crawler_account_id': crawler_account_id,
                        'parent_type': parent_type,
                        'play_count_crawler_id': play_count_crawler_id
                    }
                    
                    affected_rows = execute_write_query(update_query, update_params)
                    if affected_rows > 0:
                        updated_count += 1
                else:
                    # 新規挿入
                    insert_query = '''
                        INSERT INTO test_account_list 
                        (account_url, favorite_user_username, account_type, 
                         crawler_account_id, created_at, updated_at, parent_type, play_count_crawler_id)
                        VALUES (%(account_url)s, %(favorite_user_username)s, %(account_type)s,
                                %(crawler_account_id)s,  NOW(), NOW(), %(parent_type)s, %(play_count_crawler_id)s)
                    '''
                    insert_params = {
                        'account_url': account_url,
                        'favorite_user_username': favorite_user_username,
                        'account_type': account_type,
                        'crawler_account_id': crawler_account_id,
                        'parent_type': parent_type,
                        'play_count_crawler_id': play_count_crawler_id
                    }
                    
                    affected_rows = execute_write_query(insert_query, insert_params)
                    if affected_rows > 0:
                        inserted_count += 1

            except Exception as row_error:
                print(f"行の処理中にエラーが発生: {str(row_error)}")
                continue

        return f'Successfully processed account list: {inserted_count} inserted, {updated_count} updated', 200

    except Exception as e:
        print(f"==== アカウントリスト同期処理致命的エラー: {str(e)} ====")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

def check_last_execution():
    """
    前回の実行時刻をチェックし、36時間以上経過しているか確認する
    Returns:
        bool: 実行可能な場合はTrue、そうでない場合はFalse
    """
    try:
        query = """
            SELECT last_run 
            FROM scheduler_job_info 
            WHERE job_name = 'sync_test_list'
        """
        result = execute_query(query)
        
        if not result:
            # 初回実行の場合、レコードを作成して実行可能とする
            insert_query = """
                INSERT INTO scheduler_job_info (job_name, last_run)
                VALUES ('sync_test_list', NOW())
            """
            execute_write_query(insert_query)
            logger.info("初回実行のため、実行を許可します")
            return True
        
        last_run = result[0]['last_run']
        current_time = datetime.now()
        time_diff = current_time - last_run
        
        # 36時間以上経過しているかチェック
        if time_diff.total_seconds() >= 36 * 3600:
            # last_runを更新
            update_query = """
                UPDATE scheduler_job_info 
                SET last_run = NOW()
                WHERE job_name = 'sync_test_list'
            """
            execute_write_query(update_query)
            logger.info(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間経過しているため、実行を許可します")
            return True
        else:
            logger.info(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間しか経過していないため、実行をスキップします")
            return False
            
    except Exception as e:
        logger.error(f"実行時間チェックでエラーが発生しました: {str(e)}")
        return True  # エラーの場合は安全のため実行を許可

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカル環境でアカウントリスト同期を開始します...")
    try:
        result, status_code = process_account_list()
        logger.info(f"実行結果 (ステータスコード: {status_code}):")
        logger.info(result)
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        sys.exit(1) 