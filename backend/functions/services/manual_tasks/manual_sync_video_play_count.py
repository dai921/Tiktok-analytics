from typing import Dict, Any, Tuple
import functions_framework
import logging
import json
from datetime import datetime, timedelta
from core.db_utils import execute_query, execute_write_query, DatabaseError
from core.config import initialize_config
from flask import jsonify, Request

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def manual_sync_video_play_count(request):
    """
    HTTPリクエストで実行される関数
    video_play_count_raw_dataテーブルから再生回数情報を取得し、
    video_masterテーブルを更新する
    
    Args:
        request (flask.Request): HTTPリクエスト
        
    Returns:
        flask.Response: 処理結果を含むレスポンス
    """
    logger.info("==== manual_sync_video_play_count関数の実行開始 ====")
    
    try:
        # リクエストパラメータの取得
        request_json = request.get_json(silent=True)
        request_args = request.args
        
            
        # バッチ処理を開始するかリセットするかを判断
        reset = False
        if request_json and 'reset' in request_json:
            reset = bool(request_json['reset'])
        elif request_args and 'reset' in request_args:
            reset = request_args.get('reset', '').lower() == 'true'
            
        # カーソル情報の取得
        processor_name = "manual_sync_video_play_count"
        target_table = "video_master"
        
        if reset:
            logger.info("カーソルをリセットします")
            reset_cursor(processor_name, target_table)
            
        # カーソル情報の取得
        cursor_info = get_or_initialize_cursor(processor_name, target_table, 10000)
        last_cursor_id = cursor_info["last_cursor_id"]
        batch_size = cursor_info["batch_size"]
        batch_number = cursor_info["batch_number"]
        
        logger.info(f"バッチ処理情報: processor={processor_name}, target={target_table}, " 
                   f"last_id={last_cursor_id}, batch_size={batch_size}, batch_number={batch_number}")
        
        
        # video_play_count_raw_dataテーブルからデータを取得（バッチ処理）
        query = """
        SELECT 
            r.id,
            r.video_id, 
            r.video_url,
            r.user_username,
            r.play_count
        FROM 
            video_play_count_raw_data r
        WHERE 
            r.id > %s
        ORDER BY 
            r.id
        LIMIT %s
        """
        
        raw_data = execute_query(query, (last_cursor_id, batch_size))
        
        if not raw_data:
            logger.info("処理すべきデータがありません。バッチ処理を完了します。")
            
            # カーソルをリセット（次回は最初から）
            reset_cursor(processor_name, target_table)
            
            return jsonify({
                "status": "success",
                "message": "バッチ処理完了。処理すべきデータがありませんでした。",
                "batch_number": batch_number,
                "updated_count": 0,
                "is_complete": True,
                "execution_time": datetime.now().isoformat()
            })
        
        logger.info(f"バッチ#{batch_number}: {len(raw_data)}件のデータを取得しました")
        
        # 動画IDごとに最新のデータを抽出
        latest_data = {}
        max_id = 0
        
        for row in raw_data:
            # 最大IDを追跡（カーソル更新用）
            row_id = row['id']
            if row_id > max_id:
                max_id = row_id
                
            video_id = row['video_id']
            # 各動画IDについて最新のレコードのみを保持（IDが大きいほど新しい）
            if video_id not in latest_data or row['id'] > latest_data[video_id].get('id', 0):
                latest_data[video_id] = {
                    'id': row['id'],
                    'video_id': video_id,
                    'video_url': row['video_url'],
                    'user_username': row['user_username'],
                    'play_count': row['play_count']
                }
        
        logger.info(f"処理対象の動画数: {len(latest_data)}")
        
        # 各動画について処理を実行
        results = []
        success_count = 0
        error_count = 0
        
        for video_id, data in latest_data.items():
            try:
                result = sync_play_count(data)
                results.append(result)
                
                if result['status'] == 'success':
                    success_count += 1
                else:
                    error_count += 1
            except Exception as e:
                logger.error(f"動画ID {video_id} の処理中にエラーが発生: {str(e)}")
                error_count += 1
                results.append({
                    'status': 'error',
                    'message': str(e),
                    'video_id': video_id
                })
        
        # 次回のバッチ処理のためにカーソルを更新
        if max_id > 0:
            update_cursor(processor_name, target_table, max_id, batch_number + 1)
        
        # 残りのデータ数を確認
        remaining_query = """
        SELECT COUNT(*) as remaining_count
        FROM video_play_count_raw_data
        WHERE  id > %s
        """
        
        remaining_data = execute_query(remaining_query, (max_id,))
        remaining_count = remaining_data[0]['remaining_count'] if remaining_data else 0
        
        # 完了フラグの設定
        is_complete = remaining_count == 0
        
        # 完了した場合はカーソルをリセット
        if is_complete:
            reset_cursor(processor_name, target_table)
            logger.info("全ての処理が完了しました。カーソルをリセットしました。")
        
        response = {
            'status': 'success',
            'message': f'バッチ#{batch_number}の処理が完了しました。成功: {success_count}, 失敗: {error_count}, 残り: {remaining_count}',
            'batch_number': batch_number,
            'total_processed': len(results),
            'success_count': success_count,
            'error_count': error_count,
            'remaining_count': remaining_count,
            'is_complete': is_complete,
            'execution_time': datetime.now().isoformat()
        }
        
        logger.info(f"バッチ#{batch_number}処理完了 - 成功: {success_count}, 失敗: {error_count}, 残り: {remaining_count}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
    finally:
        logger.info("==== manual_sync_video_play_count関数の実行終了 ====")

def sync_play_count(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    play_countを処理し、video_masterテーブルに同期する
    video_idが存在しない場合は新規レコードを作成する
    
    Args:
        video_data (Dict): 処理対象の動画データ
        
    Returns:
        Dict: 処理結果
    """
    try:
        video_id = video_data['video_id']
        logger.info(f"play_count処理を始めます。video_id: {video_id}")
        
        # 前回のデータを取得
        prev_data_query = """
            SELECT play_count
            FROM video_master
            WHERE video_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """
        prev_data_params = (video_id,)
        prev_data_results = execute_query(prev_data_query, prev_data_params)
        prev_data = prev_data_results[0] if prev_data_results else None

        # 増加量の計算
        current_play_count = video_data['play_count']
        
        if prev_data and prev_data['play_count'] is not None:
            # 前回のデータが存在する場合は差分を計算
            prev_play_count = prev_data['play_count']
            play_count_increase = max(0, current_play_count - prev_play_count)
        else:
            # 新規動画の場合は現在の値をそのまま増加量とする
            play_count_increase = current_play_count

        # INSERT ... ON DUPLICATE KEY UPDATE を使用して、
        # 存在しない場合は挿入、存在する場合は更新
        upsert_query = """
        INSERT INTO video_master (
            url, video_id, username,play_count, playCountIncrease, front_needs_update, created_at
        ) VALUES (
            %s, %s, %s, %s, %s, 1, NOW()
        )
        ON DUPLICATE KEY UPDATE
            play_count = VALUES(play_count),
            playCountIncrease = VALUES(playCountIncrease),
            front_needs_update = 1
        """
        execute_write_query(upsert_query, (video_data['video_url'], video_id, video_data['user_username'], current_play_count, play_count_increase))
        
        return {
            'status': 'success',
            'message': f'Successfully updated play_count for video {video_id}',
            'video_id': video_id,
            'play_count': current_play_count,
            'play_count_increase': play_count_increase
        }

    except Exception as e:
        logger.error(f"play_count同期処理エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'video_id': video_data.get('video_id', 'unknown')
        }

# カーソル管理用の関数
def get_or_initialize_cursor(processor_name, target_table, default_batch_size=10000):
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

def update_cursor(processor_name, target_table, last_cursor_id, batch_number):
    """カーソル情報を更新"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = %s, batch_number = %s, updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    
    execute_write_query(query, (last_cursor_id, batch_number, processor_name, target_table))

def reset_cursor(processor_name, target_table):
    """カーソル情報をリセット"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = 0, batch_number = 1, last_reset_time = NOW(), updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    
    execute_write_query(query, (processor_name, target_table))

if __name__ == "__main__":
    # ローカルテスト用
    from flask import Flask
    app = Flask(__name__)
    
    with app.test_request_context('/?days=7', method='GET'):
        response = manual_sync_video_play_count(app.request)
        print(response.get_data(as_text=True)) 