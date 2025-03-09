import os
import json
import sys
import mysql.connector
from google.oauth2 import service_account
from googleapiclient.discovery import build

# .envファイルのサポートを追加
try:
    from dotenv import load_dotenv
    load_dotenv()  # .envファイルから環境変数を読み込む
    print("環境変数が.envファイルから読み込まれました")
except ImportError:
    print("python-dotenvがインストールされていないため、.envファイルは使用されません")
    print("必要な場合は `pip install python-dotenv` でインストールしてください")

def sync_spreadsheet(request):
    try:
        # Googleスプレッドシートの設定
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')

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

        print(f"Found {len(values)} rows in spreadsheet")  # デバッグ用

        # データベース接続
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        cursor = conn.cursor()

        # データをMySQLに保存
        inserted_count = 0
        for row in values:
            try:
                # 行の長さを確認してデバッグ出力
                print(f"Row length: {len(row)}")
                print(f"Row content: {row}")

                account_url = row[0].strip() if len(row) > 0 else None      # C列：URL
                account_name = row[2].strip() if len(row) > 2 else None     # E列：アカウント名
                under_100k_flag = row[3].strip() if len(row) > 3 else None  # F列：フラグ
                content_type = row[4].strip() if len(row) > 4 else None     # G列：コンテンツタイプ

                # URLとアカウント名が存在する場合のみ処理
                if account_url and account_name:
                    print(f"Processing: URL={account_url}, Name={account_name}, Flag={under_100k_flag}, Type={content_type}")
                    
                    # needs_updateの設定
                    # 条件1: 10万未満フラグが'o'の場合はFALSE、それ以外の場合はTRUE
                    # 条件2: content_typeが'affi'以外の場合はFALSE
                    needs_update = under_100k_flag != 'o' and (content_type == 'affi' if content_type else False)
                    
                    cursor.execute('''
                        INSERT INTO account_list 
                        (account_url, account_name, under_100k_flag, is_new_account, needs_update, content_type)
                        VALUES (%s, %s, %s, TRUE, %s, %s)
                    ''', (account_url, account_name, under_100k_flag, needs_update, content_type))
                    
                    inserted_count += cursor.rowcount

            except Exception as row_error:
                print(f"Error processing row: {row}")
                print(f"Error details: {str(row_error)}")
                continue

        # 変更を確定
        conn.commit()
        print(f"Successfully inserted {inserted_count} new accounts")

        # 接続を閉じる
        cursor.close()
        conn.close()

        return f'Successfully inserted {inserted_count} new accounts', 200

    except Exception as e:
        print(f"Error: {str(e)}")
        if 'conn' in locals() and conn.is_connected():
            conn.close()
        return str(e), 500

    finally:
        if 'conn' in locals() and conn.is_connected():
            conn.close()

# 手動実行用のメイン関数
if __name__ == "__main__":
    class DummyRequest:
        def __init__(self):
            self.method = "GET"
            self.path = "/sync-spreadsheet"
            self.headers = {}
            self.get_json = lambda: None
    
    # 環境変数の確認
    required_envs = ['GOOGLE_APPLICATION_CREDENTIALS', 'SPREADSHEET_ID', 
                     'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
    
    missing_envs = [env for env in required_envs if not os.getenv(env)]
    if missing_envs:
        print(f"警告: 以下の環境変数が設定されていません: {', '.join(missing_envs)}")
        print("必要な環境変数を設定してから再実行してください")
        sys.exit(1)
    
    # 関数を実行
    print("スプレッドシートの同期を開始します...")
    dummy_request = DummyRequest()
    result, status_code = sync_spreadsheet(dummy_request)
    
    print(f"実行結果 (ステータスコード: {status_code}):")
    print(result)
