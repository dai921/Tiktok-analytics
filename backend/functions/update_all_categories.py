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

# 設定の初期化
initialize_config()

# 環境情報を取得
environment = get_environment()
project_id = os.getenv('PROJECT_ID')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"プロジェクトID: {project_id}")

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
    logger.info(f"====== update_all_categories 開始：{datetime.now().isoformat()} ======")
    
    try:
        # カーソル情報を取得または作成
        cursor_data = get_or_create_cursor()
        last_cursor_id = cursor_data.get('last_cursor_id', 0)
        batch_size = cursor_data.get('batch_size', BATCH_SIZE)
        
        logger.info(f"処理開始: last_cursor_id = {last_cursor_id}, batch_size = {batch_size}")
        
        total_updated = 0
        
        # カテゴリキーワードの取得
        category_query = """
            SELECT ck.keyword, ck.is_product, cm.category_name, cm.category_id
            FROM category_keywords ck
            JOIN category_master cm ON ck.category_id = cm.category_id
        """
        keywords_data = execute_query(category_query)
        logger.info(f"カテゴリキーワード {len(keywords_data)} 件を取得しました")
        
        # 処理すべき動画データの取得（バッチサイズ分）
        video_query = f"""
            SELECT id, video_id, description, hashtags
            FROM video_master
            WHERE id > {last_cursor_id}
            ORDER BY id
            LIMIT {batch_size}
        """
        videos = execute_query(video_query)
        logger.info(f"動画データ {len(videos)} 件を取得しました (cursor_id > {last_cursor_id})")
        
        if not videos:
            # 処理対象のデータがない場合はカーソルをリセット
            logger.info("処理対象のデータがありません。カーソルをリセットします。")
            reset_cursor()
            return {
                "success": True,
                "message": "処理対象のデータがありません。カーソルをリセットしました。",
                "total_updated": 0,
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
                    logger.info(f"進捗状況: {total_updated}/{len(videos)} 件更新 ({total_updated/len(videos)*100:.1f}%), 経過時間: {elapsed_time:.2f}秒")
                
            except Exception as e:
                logger.error(f"動画 {video.get('video_id', 'unknown')} の処理中にエラーが発生: {str(e)}")
                continue
        
        # 処理した最大IDでカーソルを更新
        if max_id > 0:
            update_cursor(max_id)
            logger.info(f"カーソルを更新しました: {max_id}")
        
        execution_time = time.time() - start_time
        logger.info(f"====== update_all_categories バッチ処理完了：{datetime.now().isoformat()} ======")
        logger.info(f"合計 {total_updated} 件の動画カテゴリを更新しました")
        logger.info(f"実行時間: {execution_time:.2f}秒")
        
        return {
            "success": True, 
            "total_updated": total_updated,
            "execution_time": execution_time,
            "last_cursor_id": max_id,
            "more_data": len(videos) == batch_size  # バッチサイズと同じ数のデータが取得できた場合、まだ処理するデータがある
        }
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

def get_or_create_cursor():
    """
    processing_cursorsテーブルからカーソル情報を取得または新規作成する
    
    Returns:
        dict: カーソル情報
    """
    try:
        # カーソル情報を取得
        query = """
            SELECT id, processor_name, target_table, last_cursor_id, batch_size
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
            (processor_name, target_table, last_cursor_id, batch_size, reset_interval)
            VALUES (%(processor_name)s, %(target_table)s, 0, %(batch_size)s, 86400)
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
            'batch_size': BATCH_SIZE
        }
        
    except Exception as e:
        logger.error(f"カーソル情報の取得に失敗しました: {str(e)}")
        # デフォルト値を返す
        return {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE,
            'last_cursor_id': 0,
            'batch_size': BATCH_SIZE
        }

def update_cursor(last_id):
    """
    カーソル位置を更新する
    
    Args:
        last_id (int): 最後に処理したID
    """
    try:
        update_query = """
            UPDATE processing_cursors
            SET last_cursor_id = %(last_cursor_id)s, 
                updated_at = NOW()
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
        """
        
        params = {
            'last_cursor_id': last_id,
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE
        }
        
        execute_write_query(update_query, params)
        
    except Exception as e:
        logger.error(f"カーソル更新に失敗しました: {str(e)}")

def reset_cursor():
    """
    カーソル位置をリセットする
    """
    try:
        update_query = """
            UPDATE processing_cursors
            SET last_cursor_id = 0, 
                last_reset_time = NOW(),
                updated_at = NOW()
            WHERE processor_name = %(processor_name)s AND target_table = %(target_table)s
        """
        
        params = {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE
        }
        
        execute_write_query(update_query, params)
        logger.info("カーソルをリセットしました")
        
    except Exception as e:
        logger.error(f"カーソルリセットに失敗しました: {str(e)}")

if __name__ == "__main__":
    logger.info("このスクリプトはCloud Functionsとして実行されます。ローカルでの直接実行はサポートされていません。") 