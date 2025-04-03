import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
import functions_framework
from datetime import datetime
import logging
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
from google.cloud import secretmanager
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

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
            WHERE job_name = 'sync_category_spreadsheet'
        """
        result = execute_query(query)
        
        if not result:
            # 初回実行の場合、レコードを作成して実行可能とする
            insert_query = """
                INSERT INTO scheduler_job_info (job_name, last_run)
                VALUES ('sync_category_spreadsheet', NOW())
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
                WHERE job_name = 'sync_category_spreadsheet'
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

@functions_framework.http
def scheduled_job(request):
    """
    カテゴリスプレッドシートの同期を行うCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    logger.info(f"====== カテゴリ同期処理開始：{datetime.now().isoformat()} ======")
    
    try:
        # 実行可能かチェック
        if not check_last_execution():
            return "前回の実行から36時間経過していないため、処理をスキップします", 200
            
        return sync_category_spreadsheet()
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def validate_env_vars():
    """必要な環境変数が設定されているか確認"""
    # 必須の環境変数（DB関連の環境変数を削除）
    required_envs = [
        'SPREADSHEET_CATEGORY_ID',
    ]
    
    # 認証に関連する環境変数（どちらか一方があればOK）
    auth_envs = ['GOOGLE_APPLICATION_CREDENTIALS', 'PROJECT_ID']
    
    missing_envs = [env for env in required_envs if not os.getenv(env)]
    if missing_envs:
        raise ValueError(f"必須の環境変数が設定されていません: {', '.join(missing_envs)}")
    
    # 認証関連の環境変数をチェック
    if not any(os.getenv(env) for env in auth_envs):
        raise ValueError(f"認証に必要な環境変数が設定されていません。{' または '.join(auth_envs)}のいずれかが必要です")
    
    logger.info("環境変数の検証が完了しました")

def sync_category_spreadsheet():
    """スプレッドシートとデータベースの同期処理"""
    try:
        # 環境変数の検証
        validate_env_vars()
        
        # Googleスプレッドシートの設定
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        SPREADSHEET_ID = os.getenv('SPREADSHEET_CATEGORY_ID')
        
        # 認証情報の取得処理をより安全に
        try:
            # Secret Managerからサービスアカウントの認証情報を取得
            secret_client = secretmanager.SecretManagerServiceClient()
            secret_name = os.getenv('SHEET_CREDENTIALS_SECRET', 'sheet-credentials')
            project_id = os.getenv('PROJECT_ID')
            
            if not project_id:
                raise ValueError("GCP_PROJECT環境変数が設定されていません")
            
            secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
            logger.info(f"Secret Managerから認証情報を取得しています: {secret_path}")
            
            response = secret_client.access_secret_version(name=secret_path)
            service_account_info = json.loads(response.payload.data.decode('UTF-8'))
            
            # 取得した認証情報を使用
            credentials = service_account.Credentials.from_service_account_info(
                service_account_info, scopes=SCOPES)
            
            logger.info("Secret Managerからサービスアカウント認証情報の取得に成功しました")
        except Exception as auth_error:
            logger.error(f"認証情報の取得に失敗しました: {str(auth_error)}")
            # フォールバック: 従来の方法を試す
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                logger.info("フォールバック: GOOGLE_APPLICATION_CREDENTIALSを使用します")
                credentials = service_account.Credentials.from_service_account_file(
                    os.getenv('GOOGLE_APPLICATION_CREDENTIALS'), scopes=SCOPES)
            else:
                raise Exception(f"サービスアカウント認証情報を取得できません: {str(auth_error)}")
        
        service = build('sheets', 'v4', credentials=credentials)

        # スプレッドシートからデータを読み取る
        range_name = 'カテゴリキーワードマッピング!B2:D'  # B列：カテゴリ、C列：キーワード（カンマ区切り）、D列：商品名（カンマ区切り）
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        values = result.get('values', [])

        if not values:
            return 'No data found', 200

        logger.info(f"Found {len(values)} rows in spreadsheet")

        try:
            # カテゴリマスターの更新
            category_inserted = 0
            category_ids = {}  # カテゴリ名とIDの対応を保存

            # 既存のカテゴリを取得
            category_query = "SELECT category_id, category_name FROM category_master"
            existing_categories_data = execute_query(category_query)
            existing_categories = {row['category_name']: row['category_id'] for row in existing_categories_data}

            for row in values:
                category_name = row[0].strip() if len(row) > 0 else None

                if category_name:
                    # 既存のカテゴリをチェック
                    if category_name in existing_categories:
                        category_ids[category_name] = existing_categories[category_name]
                    else:
                        # 新しいカテゴリを登録
                        insert_category_query = '''
                            INSERT INTO category_master (category_name)
                            VALUES (%(category_name)s)
                        '''
                        insert_params = {'category_name': category_name}
                        
                        # 実行して新しいカテゴリIDを取得する必要があります
                        with get_connection() as conn:
                            with conn.cursor() as cursor:
                                cursor.execute(insert_category_query, insert_params)
                                category_id = cursor.lastrowid
                                conn.commit()
                                
                        category_ids[category_name] = category_id
                        category_inserted += 1

            # キーワードの更新
            keyword_inserted = 0
            
            # 既存のキーワードを取得
            keyword_query = "SELECT category_id, keyword, is_product FROM category_keywords"
            existing_keywords_data = execute_query(keyword_query)
            existing_keywords = {(row['category_id'], row['keyword'], row['is_product']) for row in existing_keywords_data}

            for row in values:
                if len(row) >= 1:  # カテゴリ名があれば処理
                    category_name = row[0].strip()
                    category_id = category_ids.get(category_name)

                    if category_id:
                        # B列（キーワード）の処理
                        if len(row) > 1 and row[1].strip():
                            keywords = [k.strip() for k in row[1].split(',') if k.strip()]
                            for keyword in keywords:
                                # 重複チェック
                                if (category_id, keyword, False) not in existing_keywords:
                                    keyword_query = '''
                                        INSERT INTO category_keywords 
                                        (category_id, keyword, is_product)
                                        VALUES (%(category_id)s, %(keyword)s, FALSE)
                                    '''
                                    keyword_params = {
                                        'category_id': category_id,
                                        'keyword': keyword
                                    }
                                    execute_write_query(keyword_query, keyword_params)
                                    keyword_inserted += 1

                        # C列（商品名）の処理
                        if len(row) > 2 and row[2].strip():
                            products = [p.strip() for p in row[2].split(',') if p.strip()]
                            for product in products:
                                # 重複チェック
                                if (category_id, product, True) not in existing_keywords:
                                    product_query = '''
                                        INSERT INTO category_keywords 
                                        (category_id, keyword, is_product)
                                        VALUES (%(category_id)s, %(keyword)s, TRUE)
                                    '''
                                    product_params = {
                                        'category_id': category_id,
                                        'keyword': product
                                    }
                                    execute_write_query(product_query, product_params)
                                    keyword_inserted += 1

            logger.info(f"Successfully inserted {category_inserted} categories and {keyword_inserted} keywords")
            return f'Successfully inserted {category_inserted} categories and {keyword_inserted} keywords', 200

        except DatabaseError as e:
            logger.error(f"Database error: {str(e)}")
            return str(e), 500

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return str(e), 500

if __name__ == "__main__":
    # ローカルテスト用
    load_dotenv()
    result = sync_category_spreadsheet()
    print(result) 