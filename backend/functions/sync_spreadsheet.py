import os
from dotenv import load_dotenv
import mysql.connector
from google.oauth2 import service_account
from googleapiclient.discovery import build

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
                account_name = row[3].strip() if len(row) > 3 else None     # F列：アカウント名
                under_100k_flag = row[4].strip() if len(row) > 4 else None  # G列：フラグ

                # URLとアカウント名が存在する場合のみ処理
                if account_url and account_name:
                    print(f"Processing: URL={account_url}, Name={account_name}, Flag={under_100k_flag}")
                    
                    # needs_updateの設定を修正
                    # 10万未満フラグが'Y'の場合はFALSE、それ以外（NULLまたは他の値）の場合はTRUE
                    needs_update = under_100k_flag != 'o'
                    
                    cursor.execute('''
                        INSERT INTO account_list 
                        (account_url, account_name, under_100k_flag, is_new_account, needs_update)
                        VALUES (%s, %s, %s, TRUE, %s)
                    ''', (account_url, account_name, under_100k_flag, needs_update))
                    
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
