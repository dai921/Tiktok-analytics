import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
from typing import List, Dict, Any, Optional
import base64
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
from google.cloud import scheduler_v1
from google.api_core.exceptions import NotFound

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv('PROJECT_ID', 'tiktok-analytics-prod-451609')
LOCATION = 'asia-northeast1'    # リージョンを設定
SCHEDULER_CLIENT = scheduler_v1.CloudSchedulerClient()

# 設定の初期化
initialize_config()

def update_affiliate_frontend_from_master() -> Dict[str, Any]:
    """
    video_masterからfrontend_affiliate_dataを更新（parent_account_type='アフィ'のみ）
    """
    try:
        print("video_masterからfrontend_affiliate_dataの更新を開始")
        
        # カーソル情報の取得または初期化
        cursor_info = get_or_initialize_cursor("frontend_affiliate_data_update", "frontend_affiliate_data")
        processor_name = cursor_info["processor_name"]
        target_table = cursor_info["target_table"]
        last_cursor_id = cursor_info["last_cursor_id"]
        batch_size = cursor_info["batch_size"]
        batch_number = cursor_info["batch_number"]
        
        print(f"アフィリエイトバッチ処理情報: processor={processor_name}, target={target_table}, " 
                   f"last_id={last_cursor_id}, batch_size={batch_size}, batch_number={batch_number}")
        
        
        # アフィリエイト動画のデータ取得クエリ
        min_date = '2023-12-01'
        max_date = "DATE_SUB(CURDATE(), INTERVAL 2 DAY)"
        
        select_query = """
        SELECT 
            vm.id,
            vm.url,
            vm.video_id,
            vm.cover_image_url as thumbnail_url,
            vm.created_at,
            vm.play_count,
            vm.playCountIncrease as play_count_increase,
            vm.username as account_name,
            vm.likes_count,
            vm.comment_count,
            COALESCE(vm.hashtags, '') as hashtags,
            vm.music_title as music_info,
            vm.description as caption,
            vm.category,
            vm.product,
            vm.content_type,
            vm.status,
            vm.display_name,
            vm.save_count,
            vm.likesCountIncrease,
            vm.commentCountIncrease,
            vm.saveCountIncrease,
            vm.account_type,
            vm.is_pr,
            vm.parent_account_type
        FROM 
            video_master vm
        LEFT JOIN frontend_affiliate_data fad ON vm.id = fad.id
        WHERE 
            vm.status != 'deleted'
            AND vm.created_at IS NOT NULL
            AND vm.front_needs_update = 1
            AND vm.play_count is not null
            AND vm.play_needs_update = 1
            AND vm.account_type is not null
            AND vm.cover_image_url is not null
            AND vm.is_delay = 0
            AND vm.parent_account_type = 'アフィ'
            AND vm.created_at >= %(min_date)s
            AND vm.created_at <= """ + max_date + """
            AND vm.id > %(last_id)s
        ORDER BY 
            vm.id
        LIMIT %(batch_size)s
        """
        
        params = {
            'min_date': min_date,
            'last_id': last_cursor_id,
            'batch_size': batch_size
        }
        
        print(f"アフィリエイト実行するバッチクエリ: {select_query}")
        print(f"アフィリエイトクエリパラメータ: {params}")
        
        batch_rows = execute_query(select_query, params)
        
        # このバッチの最大IDを取得
        max_id = batch_rows[-1]['id'] if batch_rows else last_cursor_id
        
        # 残りのレコード数を確認するクエリ
        count_query = f"""
        SELECT 
            COUNT(*) as remaining_count
        FROM 
            video_master vm
        LEFT JOIN frontend_affiliate_data fad ON vm.id = fad.id
        WHERE 
            vm.status != 'deleted'
            AND vm.created_at IS NOT NULL
            AND vm.parent_account_type = 'アフィ'
            AND vm.created_at >= %(min_date)s
            AND vm.created_at <= {max_date}
            AND vm.id > %(max_id)s
        """
        
        # 残り件数のクエリ実行
        remaining_data = execute_query(count_query, {
            'min_date': min_date, 
            'max_id': max_id
        })
        remaining_count = remaining_data[0]['remaining_count'] if remaining_data else 0
        
        # 取得したデータの検証
        batch_size = len(batch_rows)
        print(f"アフィリエイトバッチ#{batch_number}: 取得したレコード数: {batch_size}, 残り: {remaining_count}")
        
        if not batch_rows:
            print("アフィリエイト処理すべきデータがありません。バッチ処理を完了します。")
            
            # カーソルをリセット（次回は最初から）
            reset_cursor(processor_name, target_table)
            
            # Pub/Subにバッチ処理完了のメッセージを送信
            publish_message("frontend-affiliate-update-status", {
                "status": "completed",
                "message": "アフィリエイト全バッチの処理が完了しました",
                "timestamp": datetime.now().isoformat()
            })
            
            # 企業アカウント処理を開始するメッセージを送信
            publish_message("frontend-corporate-trigger", {
                "status": "start", 
                "message": "アフィリエイト処理完了、企業アカウント処理を開始します",
                "timestamp": datetime.now().isoformat()
            })
            print("企業アカウント処理開始のPub/Subメッセージを送信しました")
        
        # バッチ処理の実行
        updated_count = 0
        batch_start_time = datetime.now()
        
        for row in batch_rows:
            try:
                # ハッシュタグの処理
                hashtags = row['hashtags']
                if hashtags is None or hashtags == '' or hashtags == '[]':
                    hashtags = ''
                else:
                    # カンマ区切りの文字列として処理
                    hashtags = ','.join([tag.strip() for tag in hashtags.split(',') if tag.strip()])
                
                # created_atの処理
                created_at = row['created_at']
                if created_at is None:
                    continue
                
                try:
                    if isinstance(created_at, str):
                        date_obj = datetime.strptime(created_at, '%Y-%m-%d')
                        created_at = date_obj.strftime('%Y-%m-%d')
                except ValueError:
                    continue
                
                update_query = """
                REPLACE INTO frontend_affiliate_data (
                    id, url, video_id, thumbnail_url, created_at, play_count, 
                    play_count_increase, account_name, likes_count, comment_count, 
                    hashtags, music_info, caption, category, display_name,
                    content_type, product, save_count, likes_count_increase, 
                    comment_count_increase, save_count_increase, account_type, 
                    is_pr, parent_account_type
                ) VALUES (
                    %(id)s, %(url)s, %(video_id)s, %(thumbnail_url)s, %(created_at)s, %(play_count)s, 
                    %(play_count_increase)s, %(account_name)s, %(likes_count)s, %(comment_count)s, 
                    %(hashtags)s, %(music_info)s, %(caption)s, %(category)s, %(display_name)s,
                    %(content_type)s, %(product)s, %(save_count)s, %(likesCountIncrease)s, 
                    %(commentCountIncrease)s, %(saveCountIncrease)s, %(account_type)s, 
                    %(is_pr)s, %(parent_account_type)s
                )
                """
                
                params = {
                    'id': row['id'],
                    'url': row['url'],
                    'video_id': row['video_id'],
                    'thumbnail_url': row['thumbnail_url'],
                    'created_at': created_at,
                    'play_count': row['play_count'],
                    'play_count_increase': row['play_count_increase'],
                    'account_name': row['account_name'],
                    'likes_count': row['likes_count'],
                    'comment_count': row['comment_count'],
                    'hashtags': hashtags,
                    'music_info': row['music_info'],
                    'caption': row['caption'],
                    'category': row['category'],
                    'display_name': row['display_name'],
                    'content_type': row['content_type'],
                    'product': row['product'],
                    'save_count': row['save_count'],
                    'likesCountIncrease': row['likesCountIncrease'],
                    'commentCountIncrease': row['commentCountIncrease'],
                    'saveCountIncrease': row['saveCountIncrease'],
                    'account_type': row['account_type'],
                    'is_pr': row['is_pr'],
                    'parent_account_type': row['parent_account_type']
                }
                
                execute_write_query(update_query, params)
                updated_count += 1
                
            except DatabaseError as e:
                print(f"アフィリエイトレコード更新エラー (id: {row['id']}): {str(e)}")
                continue
        
        # カーソル情報の更新
        update_cursor(processor_name, target_table, max_id, batch_number + 1)
        
        batch_execution_time = (datetime.now() - batch_start_time).total_seconds()
        print(f"アフィリエイトバッチ#{batch_number}完了: {updated_count}/{batch_size}件更新、実行時間: {batch_execution_time}秒")
        
        # 処理完了していない場合、Pub/Subに継続メッセージを送信
        if remaining_count > 0:
            publish_message("frontend-affiliate-update-status", {
                "status": "in_progress",
                "message": f"アフィリエイトバッチ#{batch_number}完了、残り{remaining_count}件",
                "batch_number": batch_number,
                "remaining": remaining_count,
                "timestamp": datetime.now().isoformat()
            })
        else:
            # 処理完了
            publish_message("frontend-affiliate-update-status", {
                "status": "completed",
                "message": "アフィリエイト全バッチの処理が完了しました",
                "timestamp": datetime.now().isoformat()
            })
            
            # 企業アカウント処理を開始するメッセージを送信
            publish_message("frontend-corporate-trigger", {
                "status": "start", 
                "message": "アフィリエイト処理完了、企業アカウント処理を開始します",
                "timestamp": datetime.now().isoformat()
            })
            print("企業アカウント処理開始のPub/Subメッセージを送信しました")
            
            # カーソルをリセット（次回は最初から）
            reset_cursor(processor_name, target_table)
        
        return {
            "status": "success",
            "batch_number": batch_number,
            "updated_count": updated_count,
            "batch_size": batch_size,
            "remaining_count": remaining_count,
            "is_complete": remaining_count == 0,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"アフィリエイト更新処理中にエラーが発生: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "execution_time": datetime.now().isoformat()
        }

# カーソル管理用の関数（既存と同じ）
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

# Pub/Subメッセージで起動するためのエントリーポイント
def process_pubsub_message(event, context):
    """
    Pub/Subメッセージで実行される関数
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    print("==== frontend_affiliate_data_update処理開始 ====")
    
    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message = json.loads(message_data)
            print(f"アフィリエイトPub/Subメッセージを受信: {message}")
        else:
            print("アフィリエイトデータなしのメッセージを受信")
            return {
                'status': 'error',
                'message': 'No data in message'
            }, 400

        # メッセージのステータスが'start'の場合、処理を開始
        if message.get("status") == "start":
            result = update_affiliate_frontend_from_master()
            status_code = 200 if result.get('status') == 'success' else 500
            print(f"アフィリエイト処理完了 - ステータス: {status_code}")
            print(f"アフィリエイト処理結果: {result}")
            return result, status_code
        else:
            print(f"アフィリエイト処理対象外のメッセージです: {message}")
            return {
                "status": "ignored", 
                "message": "アフィリエイト処理対象外のメッセージです"
            }, 200
            
    except ValueError as e:
        print(f"アフィリエイト不正なリクエスト: {str(e)}")
        return {
            'status': 'error',
            'message': f'Invalid request: {str(e)}'
        }, 400
        
    except Exception as e:
        print(f"アフィリエイトエラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return {
            'status': 'error',
            'message': str(e)
        }, 500
    finally:
        print("==== frontend_affiliate_data_update処理終了 ====")

if __name__ == "__main__":
    # ローカルテスト用
    try:
        result = update_affiliate_frontend_from_master()
        print("アフィリエイト実行結果:", result)
    except Exception as e:
        print(f"アフィリエイトエラーが発生しました: {str(e)}") 