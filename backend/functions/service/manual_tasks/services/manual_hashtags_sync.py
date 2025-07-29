from typing import Dict, List, Optional, Tuple
import functions_framework
from datetime import datetime
import logging
import os
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
import json
from dotenv import load_dotenv
import time

load_dotenv()

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

# 定数
PROCESSOR_NAME = 'manual_hashtags_sync'
TARGET_TABLE = 'frontend_data'
DEFAULT_BATCH_SIZE = 3000

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
            'batch_size': DEFAULT_BATCH_SIZE
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
            'batch_size': DEFAULT_BATCH_SIZE,
            'batch_number': 1
        }
        
    except Exception as e:
        logger.error(f"カーソル情報の取得に失敗しました: {str(e)}")
        # デフォルト値を返す
        return {
            'processor_name': PROCESSOR_NAME,
            'target_table': TARGET_TABLE,
            'last_cursor_id': 0,
            'batch_size': DEFAULT_BATCH_SIZE,
            'batch_number': 1
        }

def update_cursor(last_id: int, batch_number: int):
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
        logger.info(f"カーソルを更新しました: ID={last_id}, バッチ番号={batch_number}")
        
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
        logger.info("カーソルをリセットしました")
        
    except Exception as e:
        logger.error(f"カーソルリセットに失敗しました: {str(e)}")

def get_unprocessed_hashtag_data(batch_size: int, last_cursor_id: int) -> List[Dict]:
    """
    未処理のハッシュタグデータのみを効率的に取得する（カーソルベース）
    
    Args:
        batch_size (int): 取得件数
        last_cursor_id (int): 前回処理した最後のID（カーソル）
        
    Returns:
        List[Dict]: 未処理データ
    """
    try:
        query = """
            SELECT fd.id, fd.video_id, fd.hashtags, fd.created_at
            FROM frontend_data fd
            LEFT JOIN video_hashtags vh ON fd.video_id = vh.video_id
            WHERE fd.id > %(last_cursor_id)s
            AND fd.video_id IS NOT NULL 
            AND fd.hashtags IS NOT NULL 
            AND fd.hashtags != ''
            AND vh.video_id IS NULL
            ORDER BY fd.id
            LIMIT %(batch_size)s
        """
        
        params = {
            'last_cursor_id': last_cursor_id,
            'batch_size': batch_size
        }
        
        result = execute_query(query, params)
        
        return [
            {
                'id': row['id'],
                'video_id': row['video_id'],
                'hashtags': row['hashtags'],
                'post_time': row['created_at'].strftime('%Y-%m-%d') if row['created_at'] else None
            }
            for row in result
        ]
        
    except Exception as e:
        logger.error(f"未処理データ取得エラー: {str(e)}")
        return []

def get_remaining_count(last_cursor_id: int) -> int:
    """
    残りの未処理データ数を取得する
    
    Args:
        last_cursor_id (int): 現在のカーソル位置
        
    Returns:
        int: 残りの未処理データ数
    """
    try:
        query = """
            SELECT COUNT(*) as remaining_count
            FROM frontend_data fd
            LEFT JOIN video_hashtags vh ON fd.video_id = vh.video_id
            WHERE fd.id > %(last_cursor_id)s
            AND fd.video_id IS NOT NULL 
            AND fd.hashtags IS NOT NULL 
            AND fd.hashtags != ''
            AND vh.video_id IS NULL
        """
        
        params = {'last_cursor_id': last_cursor_id}
        result = execute_query(query, params)
        return result[0]['remaining_count'] if result else 0
        
    except Exception as e:
        logger.error(f"残りデータ数取得エラー: {str(e)}")
        return 0

def insert_video_hashtags(video_id: str, hashtags: str, post_time: str) -> Dict[str, str]:
    """
    ハッシュタグを分解してvideo_hashtagsテーブルに保存する
    
    Args:
        video_id (str): 動画ID
        hashtags (str): カンマ区切りのハッシュタグ文字列
        post_time (str): 投稿日（YYYY-MM-DD形式）
        
    Returns:
        Dict[str, str]: 処理結果
    """
    try:
        if not hashtags or not hashtags.strip():
            return {
                'status': 'success',
                'message': f'No hashtags to process for video {video_id}',
                'hashtag_count': 0
            }
        
        # ハッシュタグを分解
        hashtag_list = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
        
        if not hashtag_list:
            return {
                'status': 'success',
                'message': f'No valid hashtags found for video {video_id}',
                'hashtag_count': 0
            }
        
        # 各ハッシュタグを個別に保存
        insert_query = """
            INSERT INTO video_hashtags (video_id, hashtag, post_time)
            VALUES (%s, %s, %s)
        """
        
        inserted_count = 0
        for hashtag in hashtag_list:
            try:
                execute_write_query(insert_query, (video_id, hashtag, post_time))
                inserted_count += 1
            except Exception as e:
                logger.warning(f"Failed to insert hashtag '{hashtag}' for video {video_id}: {str(e)}")
                # 個別のハッシュタグ挿入失敗は処理を継続
                continue
        
        return {
            'status': 'success',
            'message': f'Successfully inserted {inserted_count}/{len(hashtag_list)} hashtags for video {video_id}',
            'hashtag_count': inserted_count
        }
        
    except Exception as e:
        logger.error(f"ハッシュタグ挿入エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'hashtag_count': 0
        }

def get_total_hashtag_records() -> int:
    """
    処理対象となるfrontend_dataレコード数を取得する
    
    Returns:
        int: 総レコード数
    """
    try:
        query = """
            SELECT COUNT(*) as total
            FROM frontend_data 
            WHERE video_id IS NOT NULL 
            AND hashtags IS NOT NULL 
            AND hashtags != ''
        """
        
        result = execute_query(query)
        return result[0]['total'] if result else 0
        
    except Exception as e:
        logger.error(f"総レコード数取得エラー: {str(e)}")
        return 0

def get_processed_hashtag_records() -> int:
    """
    既に処理済みのvideo_hashtagsレコード数を取得する
    
    Returns:
        int: 処理済みレコード数（ユニークなvideo_id数）
    """
    try:
        query = """
            SELECT COUNT(DISTINCT video_id) as processed_count
            FROM video_hashtags
        """
        
        result = execute_query(query)
        return result[0]['processed_count'] if result else 0
        
    except Exception as e:
        logger.error(f"処理済みレコード数取得エラー: {str(e)}")
        return 0

def process_hashtags_batch(max_batches: int = None) -> Dict:
    """
    カーソルベースのハッシュタグ一括処理
    
    Args:
        max_batches (int): 最大バッチ数（Noneの場合は全件処理）
        
    Returns:
        Dict: 処理結果のサマリー
    """
    start_time = datetime.now()
    logger.info(f"==== カーソルベース ハッシュタグ一括処理開始 ====")
    
    total_processed = 0
    total_errors = 0
    total_hashtags_inserted = 0
    batch_count = 0
    
    try:
        # カーソル情報を取得または作成
        cursor_data = get_or_create_cursor()
        last_cursor_id = cursor_data.get('last_cursor_id', 0)
        batch_size = cursor_data.get('batch_size', DEFAULT_BATCH_SIZE)
        batch_number = cursor_data.get('batch_number', 1)
        
        logger.info(f"処理開始 - last_cursor_id: {last_cursor_id}, batch_size: {batch_size}, batch_number: {batch_number}")
        
        # 総レコード数と残りレコード数を取得
        total_records = get_total_hashtag_records()
        remaining_count = get_remaining_count(last_cursor_id)
        logger.info(f"総レコード数: {total_records}, 残り未処理: {remaining_count}")
        
        max_id = last_cursor_id
        
        while True:
            # バッチ数制限チェック
            if max_batches and batch_count >= max_batches:
                logger.info(f"最大バッチ数 {max_batches} に到達しました")
                break
            
            # 未処理データを取得（カーソルベース）
            batch_data = get_unprocessed_hashtag_data(batch_size, max_id)
            
            if not batch_data:
                logger.info("未処理データがありません。処理を終了します。")
                # 全データ処理完了時はカーソルリセット
                reset_cursor()
                break
                
            batch_start_time = datetime.now()
            logger.info(f"バッチ {batch_number} 開始 (cursor_id > {max_id}, 件数: {len(batch_data)})")
            
            batch_processed = 0
            batch_errors = 0
            batch_hashtags = 0
            
            # バッチ内の各レコードを処理（重複チェック不要）
            for data in batch_data:
                try:
                    video_id = data['video_id']
                    hashtags = data['hashtags']
                    post_time = data['post_time']
                    
                    # ハッシュタグ挿入（重複チェック不要）
                    result = insert_video_hashtags(video_id, hashtags, post_time)
                    
                    if result.get('status') == 'success':
                        batch_processed += 1
                        batch_hashtags += result.get('hashtag_count', 0)
                    else:
                        batch_errors += 1
                        logger.error(f"動画 {video_id} の処理に失敗: {result.get('message')}")
                        
                except Exception as e:
                    batch_errors += 1
                    logger.error(f"レコード処理エラー: {str(e)}")
                    continue
            
            # 次のバッチ用にカーソル更新
            max_id = batch_data[-1]['id'] if batch_data else max_id
            next_batch_number = batch_number + 1
            
            # 統計更新
            total_processed += batch_processed
            total_errors += batch_errors
            total_hashtags_inserted += batch_hashtags
            batch_count += 1
            
            batch_elapsed = datetime.now() - batch_start_time
            logger.info(f"バッチ {batch_number} 完了 - 処理済み: {batch_processed}, エラー: {batch_errors}, ハッシュタグ挿入数: {batch_hashtags} (実行時間: {batch_elapsed.total_seconds():.2f}秒)")
            
            # 残りデータ数を確認
            remaining_count = get_remaining_count(max_id)
            
            if remaining_count > 0:
                # まだ処理するデータがある場合、カーソル更新
                update_cursor(max_id, next_batch_number)
                batch_number = next_batch_number
                logger.info(f"残り未処理データ: {remaining_count}件")
            else:
                # 全データ処理完了
                reset_cursor()
                logger.info("すべてのデータ処理が完了しました。カーソルをリセットしました。")
                break
            
            # 進捗表示
            processed_rate = ((total_records - remaining_count) / total_records * 100) if total_records > 0 else 100
            logger.info(f"全体進捗: {processed_rate:.1f}% (残り: {remaining_count}/{total_records})")
            
            # 少し休憩を入れる
            time.sleep(0.1)
        
        elapsed_time = datetime.now() - start_time
        logger.info(f"==== カーソルベース ハッシュタグ一括処理完了 ====")
        
        return {
            'status': 'success',
            'summary': {
                'total_processed': total_processed,
                'total_errors': total_errors,
                'total_hashtags_inserted': total_hashtags_inserted,
                'batch_count': batch_count,
                'execution_time_seconds': elapsed_time.total_seconds(),
                'last_cursor_id': max_id,
                'remaining_count': remaining_count,
                'is_completed': remaining_count == 0
            }
        }
        
    except Exception as e:
        logger.error(f"バッチ処理でエラー発生: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            'status': 'error',
            'message': str(e),
            'summary': {
                'total_processed': total_processed,
                'total_errors': total_errors,
                'total_hashtags_inserted': total_hashtags_inserted,
                'batch_count': batch_count
            }
        }

@functions_framework.http
def manual_hashtags_sync(request):
    """
    frontend_dataテーブルのハッシュタグを手動で一括処理するHTTPエンドポイント
    
    GET: 現在の処理状況を確認
    POST: バッチ処理を実行
    
    POSTパラメータ:
    - max_batches: 最大バッチ数（デフォルト: None=全件処理）
    """
    logger.info("==== manual_hashtags_sync関数の実行開始 ====")
    
    try:
        if request.method == 'GET':
            # 現在の状況を確認
            total_records = get_total_hashtag_records()
            processed_records = get_processed_hashtag_records()
            
            # カーソル情報も取得
            cursor_data = get_or_create_cursor()
            remaining_records = get_remaining_count(cursor_data.get('last_cursor_id', 0))
            
            return {
                'status': 'info',
                'message': 'ハッシュタグ処理状況',
                'data': {
                    'total_frontend_records': total_records,
                    'processed_video_ids': processed_records,
                    'remaining_records': remaining_records,
                    'completion_rate': f"{((total_records - remaining_records) / total_records * 100):.1f}%" if total_records > 0 else "0.0%",
                    'cursor_info': {
                        'last_cursor_id': cursor_data.get('last_cursor_id', 0),
                        'batch_number': cursor_data.get('batch_number', 1),
                        'batch_size': cursor_data.get('batch_size', DEFAULT_BATCH_SIZE)
                    }
                }
            }, 200
            
        elif request.method == 'POST':
            try:
                request_json = request.get_json(silent=True) or {}
                max_batches = request_json.get('max_batches', 1)  # デフォルトを1に変更
                
                # パラメータ検証
                if max_batches is not None and max_batches <= 0:
                    return {
                        'status': 'error',
                        'message': 'max_batchesは1以上で指定してください'
                    }, 400
                
                logger.info(f"カーソルベース バッチ処理開始 - max_batches: {max_batches}")
                
                # バッチ処理実行
                result = process_hashtags_batch(max_batches)
                
                status_code = 200 if result.get('status') == 'success' else 500
                return result, status_code
                
            except Exception as e:
                logger.error(f"リクエスト処理エラー: {str(e)}")
                return {
                    'status': 'error',
                    'message': f'リクエスト処理エラー: {str(e)}'
                }, 400
        
        else:
            return {
                'status': 'error',
                'message': 'GETまたはPOSTメソッドのみサポートしています'
            }, 405
            
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            'status': 'error',
            'message': str(e)
        }, 500
    finally:
        logger.info("==== manual_hashtags_sync関数の実行終了 ====")

if __name__ == "__main__":
    # ローカルテスト用
    logger.info("ローカルテスト実行")
    
    # 現在の状況確認
    total_records = get_total_hashtag_records()
    processed_records = get_processed_hashtag_records()
    cursor_data = get_or_create_cursor()
    remaining_records = get_remaining_count(cursor_data.get('last_cursor_id', 0))
    
    print(f"総レコード数: {total_records}")
    print(f"処理済み動画ID数: {processed_records}")
    print(f"未処理レコード数: {remaining_records}")
    print(f"現在のカーソル位置: {cursor_data.get('last_cursor_id', 0)}")
    print(f"バッチ番号: {cursor_data.get('batch_number', 1)}")
    
    # 小規模テスト実行（最大5バッチ）
    result = process_hashtags_batch(max_batches=5)
    print(f"テスト結果: {json.dumps(result, indent=2, ensure_ascii=False)}")
