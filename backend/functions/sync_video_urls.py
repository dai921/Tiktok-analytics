import os
import json
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
import functions_framework
import logging
from datetime import datetime
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message
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

@functions_framework.http
def sync_video_urls_job(request):
    """
    動画URLデータをスプレッドシートから同期するCloud Function
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (レスポンスメッセージ, HTTPステータスコード)
    """
    start_time = datetime.now()
    logger.info(f"====== 動画URL同期処理開始：{start_time.isoformat()} ======")
    
    try:
        result, status_code = sync_video_urls()
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"同期処理完了: 実行時間 {execution_time}秒, 結果: {result}")
        return result, status_code
    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return str(e), 500

def sync_video_urls():
    """スプレッドシートから動画URLデータをデータベースに同期する処理"""
    try:
        print("==== 動画URL同期処理開始 ====")
        
        # SPREADSHEETの確認のみ行う
        SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')
        if not SPREADSHEET_ID:
            print("環境変数エラー: SPREADSHEET_IDが設定されていません")
            raise ValueError("Missing required environment variable: SPREADSHEET_ID")
        print(f"スプレッドシートID: {SPREADSHEET_ID}")
        
        # Googleスプレッドシートの設定
        print("Googleスプレッドシート設定開始")
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

        # 認証情報の取得処理
        try:
            print("Secret Managerからの認証情報取得開始")
            # Secret Managerからサービスアカウントの認証情報を取得
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
            
            # 取得した認証情報を使用
            print("認証情報からクレデンシャル作成開始")
            credentials = service_account.Credentials.from_service_account_info(
                service_account_info, scopes=SCOPES)
            print("クレデンシャル作成完了")
            
        except Exception as auth_error:
            print(f"認証情報取得エラー: {str(auth_error)}")
            # フォールバック: 従来の方法を試す
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

        # スプレッドシートからデータを読み取る（動画URLシート）
        print("動画URLシートデータ取得開始")
        range_name = '動画URL!B2:E'  # B列:video_url, C列:video_id, D列:username, E列:フラグ
        print(f"取得範囲: {range_name}")
        print("APIリクエスト送信...")
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        print("APIレスポンス受信完了")
        values = result.get('values', [])
        print(f"取得行数: {len(values) if values else 0}")

        if not values:
            print("データが見つかりませんでした")
            return 'No data found', 200

        # データをデータベースに保存
        print("データベース保存処理開始")
        inserted_count = 0
        processed_count = 0
        
        for i, row in enumerate(values):
            try:
                print(f"行 {i+1}/{len(values)} 処理中")
                
                # 行のデータをチェック（最低5列必要）
                if len(row) < 4:
                    print(f"警告: 行 {i+1} のデータが不足しています: {row}")
                    continue
                
                # E列のフラグをチェック（1のみ処理）
                flag = row[3].strip() if len(row) > 3 else None
                if flag != '1':
                    print(f"行 {i+1} はフラグが1ではないためスキップします: {flag}")
                    processed_count += 1
                    continue
                
                video_url = row[0].strip() if len(row) > 0 else None
                video_id = row[1].strip() if len(row) > 1 else None
                username = row[2].strip() if len(row) > 2 else None

                print(f"処理データ: URL={video_url}, ID={video_id}, ユーザー名={username}")

                # URL、ID、ユーザー名が存在する場合のみ処理
                if video_url and video_id and username:
                    # 重複チェック用クエリ
                    check_query = '''
                        SELECT COUNT(*) as count FROM video_url_data
                        WHERE video_url = %(video_url)s OR video_id = %(video_id)s
                    '''
                    check_params = {
                        'video_url': video_url,
                        'video_id': video_id
                    }
                    
                    print("重複チェック実行")
                    check_result = execute_query(check_query, check_params)
                    existing_count = check_result[0]['count'] if check_result else 0
                    
                    if existing_count > 0:
                        print(f"行 {i+1} は既に存在するためスキップします")
                        processed_count += 1
                        continue
                    
                    # 新規挿入
                    insert_query = '''
                        INSERT INTO video_url_data 
                        (video_url, video_id, username, needs_update)
                        VALUES (%(video_url)s, %(video_id)s, %(username)s, TRUE)
                    '''
                    insert_params = {
                        'video_url': video_url,
                        'video_id': video_id,
                        'username': username
                    }
                    
                    print(f"DBクエリ実行開始")
                    affected_rows = execute_write_query(insert_query, insert_params)
                    print(f"DBクエリ完了: {affected_rows}行影響")
                    inserted_count += affected_rows
                    processed_count += 1
                else:
                    print(f"行 {i+1} はURL、ID、またはユーザー名が不足しているためスキップします")
                    processed_count += 1

            except DatabaseError as row_error:
                print(f"行 {i+1} 処理エラー: {str(row_error)}")
                continue
            except Exception as unexpected_error:
                print(f"予期しないエラー（行 {i+1}）: {str(unexpected_error)}")
                continue

        print(f"DB処理完了: {inserted_count}行挿入（全{processed_count}行処理）")

        # 同期完了後、Pub/Subメッセージを送信
        print("Pub/Sub通知送信開始")
        try:
            # trigger-video-url-data-updateトピックにメッセージを送信
            completion_message = {
                'timestamp': datetime.now().isoformat(),
                'status': 'success',
                'inserted_count': inserted_count,
                'processed_count': processed_count
            }
            
            # Pub/Subユーティリティを使用してメッセージを送信
            message_id = publish_message('trigger-video-url-data-update', completion_message)
            print(f"Pub/Sub通知送信完了: メッセージID {message_id}")
        except Exception as pub_sub_error:
            print(f"Pub/Sub通知エラー: {str(pub_sub_error)}")
        
        print("==== 動画URL同期処理正常終了 ====")
        return f'Successfully processed {processed_count} rows, inserted {inserted_count} new video URLs', 200

    except Exception as e:
        print(f"==== 動画URL同期処理致命的エラー: {str(e)} ====")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカル環境で動画URL同期を開始します...")
    try:
        result, status_code = sync_video_urls()
        logger.info(f"実行結果 (ステータスコード: {status_code}):")
        logger.info(result)
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        sys.exit(1) 