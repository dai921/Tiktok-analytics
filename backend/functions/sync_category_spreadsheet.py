import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
import functions_framework
from datetime import datetime
import logging
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message

logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

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
        return sync_category_spreadsheet()
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def sync_category_spreadsheet():
    """スプレッドシートとデータベースの同期処理"""
    try:
        # Googleスプレッドシートの設定
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        SPREADSHEET_ID = os.getenv('SPREADSHEET_CATEGORY_ID')

        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
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