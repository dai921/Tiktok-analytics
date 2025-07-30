from typing import Dict, List, Optional
import functions_framework
from datetime import datetime
import logging
import os
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
import json
from dotenv import load_dotenv
import base64
from google.cloud import pubsub_v1

load_dotenv()

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
project_id = os.getenv('PROJECT_ID', 'local-project')
pubsub_emulator_host = os.getenv('PUBSUB_EMULATOR_HOST')

# 設定の初期化
initialize_config()

def check_video_hashtags_exists(video_id: str) -> bool:
    """
    video_hashtagsテーブルに指定のvideo_idが存在するかチェックする
    
    Args:
        video_id (str): 動画ID
        
    Returns:
        bool: 存在する場合True、存在しない場合False
    """
    try:
        query = """
            SELECT 1 FROM video_hashtags 
            WHERE video_id = %s 
            LIMIT 1
        """
        result = execute_query(query, (video_id,))
        return len(result) > 0
        
    except Exception as e:
        logger.error(f"video_hashtags存在チェックエラー: {str(e)}")
        return False

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
                'message': f'No hashtags to process for video {video_id}'
            }
        
        # ハッシュタグを分解
        hashtag_list = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
        
        if not hashtag_list:
            return {
                'status': 'success',
                'message': f'No valid hashtags found for video {video_id}'
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
                logger.info(f"Inserted hashtag '{hashtag}' for video {video_id}")
            except Exception as e:
                logger.error(f"Failed to insert hashtag '{hashtag}' for video {video_id}: {str(e)}")
                # 個別のハッシュタグ挿入失敗は処理を継続
                continue
        
        return {
            'status': 'success',
            'message': f'Successfully inserted {inserted_count}/{len(hashtag_list)} hashtags for video {video_id}'
        }
        
    except Exception as e:
        logger.error(f"ハッシュタグ挿入エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

def sync_video_hashtags_data(hashtag_data: Dict) -> Dict[str, str]:
    """
    ハッシュタグデータを処理してvideo_hashtagsテーブルに同期する
    
    Args:
        hashtag_data (Dict): ハッシュタグデータ
        
    Returns:
        Dict[str, str]: 処理結果
    """
    try:
        video_id = hashtag_data['video_id']
        hashtags = hashtag_data['hashtags']
        post_time = hashtag_data['post_time']
        
        logger.info(f"ハッシュタグ同期処理開始 - video_id: {video_id}")
        logger.info(f"処理対象のハッシュタグ: {hashtags}")
        
        # video_idが既に存在するかチェック
        if check_video_hashtags_exists(video_id):
            logger.info(f"video_id {video_id} は既にvideo_hashtagsテーブルに存在します。処理をスキップします。")
            return {
                'status': 'success',
                'message': f'Video {video_id} hashtags already exist, skipped processing'
            }
        
        # ハッシュタグを分解して保存
        result = insert_video_hashtags(video_id, hashtags, post_time)
        
        return result
        
    except Exception as e:
        logger.error(f"ハッシュタグ同期処理エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

def sync_video_hashtags(event, context):
    """
    Pub/Subメッセージで実行される関数
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
        
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    logger.info("==== sync_video_hashtags関数の実行開始 ====")
    
    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            hashtag_data = json.loads(message_data)
            logger.info(f"Pub/Subメッセージを受信: {hashtag_data}")
        else:
            logger.error("データなしのメッセージを受信")
            return {
                'status': 'error',
                'message': 'No data in message'
            }, 400

        # 必須フィールドの確認
        required_fields = ['video_id', 'hashtags', 'post_time']
        for field in required_fields:
            if field not in hashtag_data:
                logger.error(f"必須フィールド '{field}' が不足しています")
                return {
                    'status': 'error',
                    'message': f'Missing required field: {field}'
                }, 400

        # ハッシュタグ同期処理
        result = sync_video_hashtags_data(hashtag_data)
        
        # 結果をログ出力
        status_code = 200 if result.get('status') == 'success' else 500
        logger.info(f"処理完了 - ステータス: {status_code}")
        logger.info(f"処理結果: {result}")
        
        return result, status_code
        
    except ValueError as e:
        logger.error(f"不正なリクエスト: {str(e)}")
        return {
            'status': 'error',
            'message': f'Invalid request: {str(e)}'
        }, 400
        
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            'status': 'error',
            'message': str(e)
        }, 500
    finally:
        logger.info("==== sync_video_hashtags関数の実行終了 ====")

def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "video-hashtags-sync-sub"
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def _callback(msg):
            try:
                # msg.data は bytes → Base64 文字列へ
                encoded = base64.b64encode(msg.data).decode('utf-8')
                event = {'data': encoded}

                # context は不要なので None
                sync_video_hashtags(event, None)

                msg.ack()
                logger.info(f"Processed message {msg.message_id}")
            except Exception as e:
                logger.error(f"Callback error: {e}", exc_info=True)
                msg.nack()
                
        streaming_pull_future = subscriber.subscribe(subscription_path, _callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

if __name__ == "__main__":
    future = setup_subscription()
    logger.info("Listening for hashtag sync messages...")
    try:
        future.result()  # メインスレッドをブロック
    except KeyboardInterrupt:
        future.cancel() 