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

# デバッグ用に接続情報を確認
db_config = get_db_config()
logger.info(f"データベース接続設定: host={db_config.get('host', 'unknown')}, database={db_config.get('database', 'unknown')}")

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
    
    # デバッグ: 接続情報の確認
    try:
        # テスト接続を実行して接続先を確認
        test_query = "SELECT DATABASE() as db, @@hostname as host"
        connection_info = execute_query(test_query)
        if connection_info:
            logger.info(f"接続先確認: {connection_info[0]}")
        else:
            logger.warning("接続テスト結果が空です")
    except Exception as e:
        logger.error(f"接続テスト中にエラー: {str(e)}")
    
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
        
        # カーソル情報の取得または初期化
        cursor_info = get_or_initialize_cursor("video_url_sync", "video_url_data", default_batch_size=7000)
        processor_name = cursor_info["processor_name"]
        target_table = cursor_info["target_table"]
        last_cursor_row = cursor_info["last_cursor_id"]
        batch_size = min(cursor_info["batch_size"], 7000)
        batch_number = cursor_info["batch_number"]
        
        print(f"バッチ処理情報: processor={processor_name}, target={target_table}, " 
              f"last_row={last_cursor_row}, batch_size={batch_size}, batch_number={batch_number}")

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

        # 全体の処理対象件数を取得
        print("全体の処理対象件数を取得中...")
        total_range = '動画URL!B:E'  # B列からE列までの全範囲
        total_result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=total_range
        ).execute()
        total_values = total_result.get('values', [])
        
        # ヘッダー行を除いた処理対象の総件数を計算
        total_rows = len(total_values) - 1 if total_values else 0
        # フラグが1の行数をカウント（実際の処理対象件数）
        total_target_rows = sum(1 for row in total_values[1:] if len(row) > 3 and row[3].strip() == '1')
        
        print(f"総行数: {total_rows}, 処理対象件数: {total_target_rows}")
        
        # 処理対象が0件の場合は終了
        if total_target_rows == 0:
            print("処理対象のデータが見つかりませんでした")
            reset_cursor(processor_name, target_table)
            publish_message('video-url-sync-status', {
                'status': 'completed',
                'message': '処理対象データなし',
                'timestamp': datetime.now().isoformat()
            })
            return 'No data to process', 200

        # スプレッドシートからデータを読み取る（動画URLシート）
        print("動画URLシートデータ取得開始")
        start_row = last_cursor_row + 2  # ヘッダー行(1行目)を考慮
        range_name = f'動画URL!B{start_row}:E{start_row + batch_size - 1}'
        print(f"取得範囲: {range_name}")
        
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        values = result.get('values', [])

        if not values:
            print("データが見つかりませんでした")
            # カーソルをリセット
            reset_cursor(processor_name, target_table)
            return 'No data found', 200

        # 処理済みの行番号を保持するリスト
        processed_rows = []
        inserted_count = 0
        processed_count = 0
        
        for i, row in enumerate(values):
            current_row = start_row + i
            try:
                print(f"行 {current_row}/{start_row + batch_size - 1} 処理中")
                
                # 行のデータをチェック（最低5列必要）
                if len(row) < 4:
                    print(f"警告: 行 {current_row} のデータが不足しています: {row}")
                    continue
                
                # E列のフラグをチェック（1のみ処理）
                flag = row[3].strip() if len(row) > 3 else None
                if flag != '1':
                    print(f"行 {current_row} はフラグが1ではないためスキップします: {flag}")
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
                        print(f"行 {current_row} は既に存在するためスキップします")
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
                    
                    if affected_rows > 0:
                        processed_rows.append(current_row)
                        inserted_count += affected_rows
                    processed_count += 1
                else:
                    print(f"行 {current_row} はURL、ID、またはユーザー名が不足しているためスキップします")
                    processed_count += 1

            except DatabaseError as row_error:
                print(f"行 {current_row} 処理エラー: {str(row_error)}")
                continue
            except Exception as unexpected_error:
                print(f"予期しないエラー（行 {current_row}）: {str(unexpected_error)}")
                continue

        # 処理済みの行のフラグを0に更新
        if processed_rows:
            try:
                # バッチで更新するための値の準備
                update_values = []
                for row in processed_rows:
                    update_values.append({
                        'range': f'動画URL!E{row}',
                        'values': [['0']]
                    })

                body = {
                    'valueInputOption': 'RAW',
                    'data': update_values
                }

                # バッチ更新の実行
                service.spreadsheets().values().batchUpdate(
                    spreadsheetId=SPREADSHEET_ID,
                    body=body
                ).execute()
                print(f"{len(processed_rows)}行のフラグを0に更新しました")
            except Exception as update_error:
                print(f"フラグ更新エラー: {str(update_error)}")

        # 次のバッチのためにカーソルを更新
        last_processed_row = start_row + len(values) - 1
        update_cursor(processor_name, target_table, last_processed_row, batch_number + 1)

        # 残りのデータ数を確認
        next_range = f'動画URL!B{last_processed_row + 1}:E'
        remaining_result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=next_range
        ).execute()
        remaining_values = remaining_result.get('values', [])
        remaining_count = len(remaining_values)

        # 進捗状況の更新（Pub/Subメッセージ送信部分を修正）
        if remaining_count > 0:
            progress_percentage = ((total_target_rows - remaining_count) / total_target_rows) * 100
            publish_message('video-url-sync-status', {
                'status': 'in_progress',
                'message': f'バッチ#{batch_number}完了、残り{remaining_count}件（進捗: {progress_percentage:.1f}%）',
                'batch_number': batch_number,
                'remaining': remaining_count,
                'total_targets': total_target_rows,
                'progress_percentage': progress_percentage,
                'timestamp': datetime.now().isoformat()
            })
        else:
            publish_message('video-url-sync-status', {
                'status': 'completed',
                'message': '全バッチの処理が完了しました',
                'total_processed': total_target_rows,
                'timestamp': datetime.now().isoformat()
            })
            
            # 処理完了後、次の処理のトリガーメッセージを送信
            logger.info("video-url-data-updateトリガーメッセージを送信します")
            publish_message('trigger-video-url-data-update', {
                'status': 'ready',
                'message': 'URL同期処理が完了しました。データ更新を開始します。',
                'timestamp': datetime.now().isoformat()
            })
            
            reset_cursor(processor_name, target_table)

        return f'Successfully processed {processed_count} rows, inserted {inserted_count} new video URLs', 200

    except Exception as e:
        print(f"==== 動画URL同期処理致命的エラー: {str(e)} ====")
        import traceback
        print(f"詳細エラートレース: {traceback.format_exc()}")
        return str(e), 500

# カーソル管理関数の追加と修正
def get_or_initialize_cursor(processor_name: str, target_table: str, default_batch_size: int = 7000) -> Dict[str, Any]:
    """カーソル情報を取得、存在しない場合は初期化"""
    query = """
    SELECT id, processor_name, target_table, last_cursor_id, 
           batch_size, batch_number, updated_at
    FROM processing_cursors
    WHERE processor_name = %s AND target_table = %s
    """
    
    result = execute_query(query, (processor_name, target_table))
    
    if result:
        return result[0]
    else:
        # 新しいカーソルを作成
        insert_query = """
        INSERT INTO processing_cursors 
        (processor_name, target_table, last_cursor_id, batch_size, reset_interval, batch_number, created_at, updated_at)
        VALUES (%s, %s, 0, %s, 172800, 1, NOW(), NOW())
        """
        
        execute_write_query(insert_query, (processor_name, target_table, default_batch_size))
        
        # 作成したカーソル情報を取得
        return execute_query(query, (processor_name, target_table))[0]

def update_cursor(processor_name: str, target_table: str, last_cursor_id: int, batch_number: int) -> None:
    """カーソル情報を更新"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = %s, 
        batch_number = %s, 
        updated_at = NOW()
    WHERE processor_name = %s 
    AND target_table = %s
    """
    
    execute_write_query(query, (last_cursor_id, batch_number, processor_name, target_table))

def reset_cursor(processor_name: str, target_table: str) -> None:
    """カーソル情報をリセット"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = 0, 
        batch_number = 1, 
        last_reset_time = NOW(), 
        updated_at = NOW()
    WHERE processor_name = %s 
    AND target_table = %s
    """
    
    execute_write_query(query, (processor_name, target_table))

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