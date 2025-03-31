import os
import json
import logging
from datetime import datetime
import time
import functions_framework
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ファイル先頭でログを追加
print("===== モジュールロード時の環境変数 =====")
print(f"ENVIRONMENT: {os.getenv('ENVIRONMENT', '未設定')}")
print(f"PROJECT_ID: {os.getenv('PROJECT_ID', '未設定')}")
print(f"INSTANCE_CONNECTION_NAME: {os.getenv('INSTANCE_CONNECTION_NAME', '未設定')}")

# 設定の初期化
print("===== 設定初期化前 =====")
initialize_config()
print("===== 設定初期化後 =====")
print(f"環境: {get_environment()}")

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID')
instance_connection_name = os.getenv('INSTANCE_CONNECTION_NAME')

# 環境情報をより詳細に出力
print(f"実行環境: {environment}")
print(f"プロジェクトID: {project_id}")
print(f"インスタンス接続名: {instance_connection_name}")

# 環境変数全体の確認
print(f"全環境変数: {dict(os.environ)}")

# デバッグ用に接続情報を確認
db_config = get_db_config()
# パスワードを隠して表示
safe_db_config = {k: v if k != 'password' else '********' for k, v in db_config.items()}
print(f"データベース接続設定: {safe_db_config}")

# 定数
PROCESSOR_NAME = 'update_all_categories'
TARGET_TABLE = 'video_master'
BATCH_SIZE = 10000

@functions_framework.http
def update_all_categories(request):
    """
    video_masterテーブルのすべての動画のカテゴリを再判定して更新する
    
    Args:
        request (flask.Request): HTTP リクエスト
        
    Returns:
        dict: 処理結果の JSON レスポンス
    """
    start_time = time.time()
    print(f"====== update_all_categories 開始：{datetime.now().isoformat()} ======")
    
    # 関数実行時の環境変数確認
    print("===== 関数実行時の環境変数 =====")
    print(f"ENVIRONMENT: {os.getenv('ENVIRONMENT', '未設定')}")
    print(f"PROJECT_ID: {os.getenv('PROJECT_ID', '未設定')}")
    print(f"INSTANCE_CONNECTION_NAME: {os.getenv('INSTANCE_CONNECTION_NAME', '未設定')}")
    print(f"環境: {get_environment()}")
    
    # DBに接続する直前の設定を再確認
    print("===== DB接続直前の設定 =====")
    db_config = get_db_config()
    safe_db_config = {k: v if k != 'password' else '********' for k, v in db_config.items()}
    print(f"DB設定: {safe_db_config}")
    
    try:
        # カーソル情報を取得または作成
        cursor_data = get_or_create_cursor()
        last_cursor_id = cursor_data.get('last_cursor_id', 0)
        batch_size = cursor_data.get('batch_size', BATCH_SIZE)
        batch_number = cursor_data.get('batch_number', 1)
        
        print(f"処理開始: last_cursor_id = {last_cursor_id}, batch_size = {batch_size}, batch_number = {batch_number}")
        
        # バッチ番号ごとの特殊処理
        if batch_number == 1:
            print(f"バッチ#{batch_number}: 初回バッチ処理開始")
            # 初回バッチでの特別な処理があればここに実装
        
        total_updated = 0
        
        # カテゴリキーワードの取得
        print("カテゴリキーワードの取得を開始します")
        category_query = """
            SELECT ck.keyword, ck.is_product, cm.category_name, cm.category_id
            FROM category_keywords ck
            JOIN category_master cm ON ck.category_id = cm.category_id
        """
        keywords_data = execute_query(category_query)
        print(f"カテゴリキーワード {len(keywords_data)} 件を取得しました")
        
        # 処理すべき動画データの取得（バッチサイズ分）
        video_query = f"""
            SELECT id, video_id, description, hashtags
            FROM video_master
            WHERE id > {last_cursor_id}
            ORDER BY id
            LIMIT {batch_size}
        """
        videos = execute_query(video_query)
        print(f"動画データ {len(videos)} 件を取得しました (cursor_id > {last_cursor_id})")
        
        if not videos:
            # 処理対象のデータがない場合はカーソルをリセット
            print("処理対象のデータがありません。カーソルをリセットします。")
            reset_cursor()
            return {
                "success": True,
                "message": "処理対象のデータがありません。カーソルをリセットしました。",
                "total_updated": 0,
                "batch_number": batch_number,
                "execution_time": time.time() - start_time
            }
        
        # 最後のID（次回のカーソル位置）
        max_id = 0
        
        # 各動画のカテゴリを更新
        for video in videos:
            try:
                video_id = video['id']
                max_id = max(max_id, video_id)
                
                # カテゴリの判定
                categories = set()
                description = video.get('description', '').lower() if video.get('description') else ''
                hashtags = video.get('hashtags', '')
                
                # ハッシュタグの処理
                if isinstance(hashtags, str):
                    # カンマ区切りの文字列として処理
                    hashtags = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
                elif isinstance(hashtags, list):
                    # リストの場合はそのまま使用
                    hashtags = [str(tag).strip() for tag in hashtags if str(tag).strip()]
                else:
                    # その他の場合は空リストとして扱う
                    hashtags = []
                
                # ハッシュタグのテキストを結合（カテゴリ判定用）
                hashtags_text = ' '.join(hashtags).lower()

                for keyword_data in keywords_data:
                    keyword = keyword_data['keyword'].lower()
                    if keyword in description or keyword in hashtags_text:
                        categories.add((
                            keyword_data['category_name'],
                            keyword_data['is_product']
                        ))

                # カテゴリ名をカンマ区切りで結合（空の場合は「その他」）
                category_names = ','.join(sorted(set(cat[0] for cat in categories))) if categories else 'その他'
                
                # プロダクトフラグがTrueのカテゴリがあれば、そのカテゴリ名をproductとして設定
                product_categories = [cat[0] for cat in categories if cat[1]]
                product_names = ','.join(sorted(product_categories)) if product_categories else None
                
                # video_masterテーブルの更新
                update_query = """
                    UPDATE video_master 
                    SET category = %(category)s,
                        product = %(product)s
                    WHERE video_id = %(video_id)s
                """
                
                update_params = {
                    'category': category_names,
                    'product': product_names,
                    'video_id': video['video_id']
                }
                
                execute_write_query(update_query, update_params)
                total_updated += 1
                
                # 100件ごとに進捗状況を表示
                if total_updated % 100 == 0:
                    elapsed_time = time.time() - start_time
                    print(f"進捗状況: {total_updated}/{len(videos)} 件更新 ({total_updated/len(videos)*100:.1f}%), 経過時間: {elapsed_time:.2f}秒")
                
            except Exception as e:
                print(f"動画 {video.get('video_id', 'unknown')} の処理中にエラーが発生: {str(e)}")
                continue
        
        # 残りのデータ数を確認
        remain_query = f"""
            SELECT COUNT(*) as count
            FROM video_master
            WHERE id > {max_id}
        """
        remain_data = execute_query(remain_query)
        remaining_count = remain_data[0]['count'] if remain_data else 0
        
        # 処理した最大IDとバッチ番号を更新
        next_batch_number = batch_number + 1
        if max_id > 0:
            if remaining_count > 0:
                # まだ処理するデータがある場合
                update_cursor(max_id, next_batch_number)
                print(f"カーソルを更新しました: ID={max_id}, バッチ番号={next_batch_number}")
            else:
                # 全データ処理完了
                reset_cursor()
                print("すべてのデータ処理が完了しました。カーソルをリセットしました。")
        
        execution_time = time.time() - start_time
        print(f"====== update_all_categories バッチ処理完了：{datetime.now().isoformat()} ======")
        print(f"バッチ#{batch_number}: 合計 {total_updated} 件の動画カテゴリを更新しました")
        print(f"実行時間: {execution_time:.2f}秒")
        
        return {
            "success": True, 
            "total_updated": total_updated,
            "execution_time": execution_time,
            "last_cursor_id": max_id,
            "batch_number": batch_number,
            "next_batch_number": next_batch_number,
            "remaining_count": remaining_count,
            "more_data": remaining_count > 0
        }
    
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return {'success': False, 'error': str(e)}

def get_or_create_cursor():
    """
    processing_cursorsテーブルからカーソル情報を取得または新規作成する
    
    Returns:
        dict: カーソル情報
    """
    try:
        # カーソル情報を取得
        query = """
            SELECT id, processor_name, target_table, last_cursor_id, batch_size, batch_number
            FROM processing_cursors
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
        """
        params = {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE
        }
        
        results = execute_query(query, params)
        
        if results and len(results) > 0:
            return results[0]
        
        # カーソル情報がない場合は新規作成
        insert_query = """
            INSERT INTO processing_cursors
            (processor_name, target_table, last_cursor_id, batch_size, batch_number, reset_interval)
            VALUES (%(processor_name)s, %(target_table)s, 0, %(batch_size)s, 1, 86400)
        """
        insert_params = {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE,
            'batch_size': BATCH_SIZE
        }
        
        execute_write_query(insert_query, insert_params)
        
        # 作成したカーソル情報を取得
        results = execute_query(query, params)
        if results and len(results) > 0:
            return results[0]
        
        # デフォルト値を返す
        return {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE,
            'last_cursor_id': 0,
            'batch_size': BATCH_SIZE,
            'batch_number': 1
        }
        
    except Exception as e:
        print(f"カーソル情報の取得に失敗しました: {str(e)}")
        # デフォルト値を返す
        return {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE,
            'last_cursor_id': 0,
            'batch_size': BATCH_SIZE,
            'batch_number': 1
        }

def update_cursor(last_id, batch_number):
    """
    カーソル位置を更新する
    
    Args:
        last_id (int): 最後に処理したID
        batch_number (int): 次のバッチ番号
    """
    try:
        update_query = """
            UPDATE processing_cursors
            SET last_cursor_id = %(last_cursor_id)s, 
                batch_number = %(batch_number)s,
                updated_at = NOW()
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
        """
        
        params = {
            'last_cursor_id': last_id,
            'batch_number': batch_number,
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE
        }
        
        execute_write_query(update_query, params)
        
    except Exception as e:
        print(f"カーソル更新に失敗しました: {str(e)}")

def reset_cursor():
    """
    カーソル位置をリセットする
    """
    try:
        update_query = """
            UPDATE processing_cursors
            SET last_cursor_id = 0, 
                batch_number = 1,
                last_reset_time = NOW(),
                updated_at = NOW()
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
        """
        
        params = {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE
        }
        
        execute_write_query(update_query, params)
        print("カーソルをリセットしました")
        
    except Exception as e:
        print(f"カーソルリセットに失敗しました: {str(e)}")

if __name__ == "__main__":
    print("このスクリプトはCloud Functionsとして実行されます。ローカルでの直接実行はサポートされていません。") 