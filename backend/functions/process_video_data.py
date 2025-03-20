import os
import json
import logging
from datetime import datetime
import time
import sys
import functions_framework
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment, get_db_config
from pubsub_utils import publish_message
import base64
from cloudevents.http import CloudEvent

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

def process_video_data(cloud_event):
    """動画データを処理する"""
    start_time = time.time()
    logger.info(f"====== process_video_data 開始：{datetime.now().isoformat()} ======")

    # cloud_eventからデータを取得
    if isinstance(cloud_event, dict):
        data = cloud_event
    else:
        data = cloud_event.data

    try:
        # Pub/Subメッセージからデータを取得
        if isinstance(data, dict) and 'data' in data:
            pubsub_message = base64.b64decode(data['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
        else:
            message_data = data

        logger.info(f"受信したメッセージ: {message_data}")
        
        # 必須フィールドの検証
        required_fields = ['video_id', 'username']
        missing_required = [field for field in required_fields if field not in message_data]
        if missing_required:
            error_msg = f"必須フィールドがありません: {', '.join(missing_required)}"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
            
        # video_urlフィールドの検証
        if 'video_url' not in message_data and 'url' in message_data:
            message_data['video_url'] = message_data['url']
        elif 'video_url' not in message_data and 'url' not in message_data:
            error_msg = "必須フィールドがありません: video_url または url"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
            
        # account_urlの自動補完
        if 'account_url' not in message_data:
            message_data['account_url'] = f"https://www.tiktok.com/@{message_data['username']}"
            logger.info(f"account_urlを自動生成しました: {message_data['account_url']}")
            
        # statusのデフォルト値設定
        if 'status' not in message_data:
            message_data['status'] = 'normal'
            logger.info("statusをデフォルト値'normal'に設定しました")

        # 真っ先にステータスをチェック
        status = message_data.get('status', 'normal')
        if status in ['error', 'deleted']:
            try:
                # video_masterの更新（INSERT ... ON DUPLICATE KEY UPDATE）
                error_upsert_query = """
                    INSERT INTO video_master (
                        url, video_id, username, status, currentFetchDate
                    ) VALUES (
                        %(video_url)s, %(video_id)s, %(username)s, %(status)s, %(current_date)s
                    ) ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        currentFetchDate = VALUES(currentFetchDate)
                """
                error_params = {
                    'video_url': message_data['video_url'],
                    'video_id': message_data['video_id'],
                    'username': message_data['username'],
                    'status': status,
                    'current_date': datetime.now().isoformat()
                }
                
                # video_url_dataのフラグを更新
                update_flag_query = """
                    UPDATE video_url_data 
                    SET is_new_video = FALSE,
                        needs_update = FALSE
                    WHERE video_id = %(video_id)s
                """
                update_params = {
                    'video_id': message_data['video_id']
                }
                
                # db_utilsの関数を使用して実行
                execute_write_query(error_upsert_query, error_params)
                execute_write_query(update_flag_query, update_params)
                
                logger.info(f"Updated status and flags for video {message_data['video_id']}")
                return {"success": True, "execution_time": time.time() - start_time}
            
            except DatabaseError as e:
                logger.error(f"Error storing error/deleted status: {str(e)}")
                return {"success": False, "error": str(e)}

        # 以降は通常の処理（status が normal の場合）
        is_new_video = message_data.get('is_new_video')

        try:
            # カテゴリキーワードの取得
            category_query = """
                SELECT ck.keyword, ck.is_product, cm.category_name, cm.category_id
                FROM category_keywords ck
                JOIN category_master cm ON ck.category_id = cm.category_id
            """
            keywords_data = execute_query(category_query)

            # カテゴリの判定
            categories = set()
            description = message_data.get('description', '').lower()
            hashtags = message_data.get('hashtags', '')
            
            # ハッシュタグの処理を単純化
            if isinstance(hashtags, str):
                # カンマ区切りの文字列として処理
                hashtags = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
            elif isinstance(hashtags, list):
                # リストの場合はそのまま使用
                hashtags = [str(tag).strip() for tag in hashtags if str(tag).strip()]
            else:
                # その他の場合は空リストとして扱う
                hashtags = []
            
            # ハッシュタグをカンマ区切りの文字列に変換
            hashtags_str = ','.join(hashtags)
            
            # コンテンツタイプの判定
            video_url = message_data.get('url', '')
            if 'video' in video_url.lower():
                content_type = 'video'
            elif 'photo' in video_url.lower():
                content_type = 'carousel'
            else:
                content_type = 'unknown'
            
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

            if not is_new_video:
                # 既存動画の場合、前回のデータを取得
                prev_data_query = """
                    SELECT currentFetchDate, play_count, likes_count
                    FROM video_master
                    WHERE video_id = %(video_id)s
                    ORDER BY currentFetchDate DESC
                    LIMIT 1
                """
                prev_data_params = {'video_id': message_data['video_id']}
                prev_data_results = execute_query(prev_data_query, prev_data_params)
                
                if prev_data_results:
                    prev_data = prev_data_results[0]
                    message_data['prevFetchDate'] = prev_data['currentFetchDate']
                    message_data['prevPlayCount'] = prev_data['play_count']
                    message_data['prevLikesCount'] = prev_data['likes_count']

            # デバッグ用：受信したメッセージの内容を詳細に出力
            logger.info("受信したメッセージの詳細:")
            for key, value in message_data.items():
                logger.info(f"{key}: {value}")

            # 既存動画も新規動画も、増加量の値を設定
            play_count_increase = message_data['play_count']
            
            # 既存動画の場合は差分を計算
            if not is_new_video and 'prevPlayCount' in message_data:
                play_count_increase = message_data['play_count'] - message_data.get('prevPlayCount', 0)
                likes_count_increase = message_data['likes_count'] - message_data.get('prevLikesCount', 0)

            # 正常な場合は既存の処理を続行
            if is_new_video:
                insert_query = """
                    INSERT INTO video_master (
                        url, video_id, username, display_name, 
                        cover_image_url, description, likes_count, play_count,
                        comment_count, share_count, save_count, created_at,
                        hashtags, duration, isViral, currentFetchDate,
                        music_id, music_title, music_artist, category, product,
                        status, content_type, file_path, folder_path, image_count,
                        playCountIncrease
                    ) VALUES (
                        %(url)s, %(video_id)s, %(username)s, %(display_name)s, 
                        %(cover_image_url)s, %(description)s, %(likes_count)s, %(play_count)s,
                        %(comment_count)s, %(share_count)s, %(save_count)s, %(created_at)s,
                        %(hashtags)s, %(duration)s, %(isViral)s, %(currentFetchDate)s,
                        %(music_id)s, %(music_title)s, %(music_artist)s, %(category)s, %(product)s,
                        %(status)s, %(content_type)s, %(file_path)s, %(folder_path)s, %(image_count)s,
                        %(playCountIncrease)s
                    )
                """
                
                # ファイルパスとステータスの処理
                file_path = message_data.get('file_path')
                folder_path = message_data.get('folder_path')
                image_count = message_data.get('image_count', 0)

                insert_params = {
                    'url': message_data['url'],
                    'video_id': message_data['video_id'],
                    'username': message_data['username'],
                    'display_name': message_data['display_name'],
                    'cover_image_url': message_data['cover_image_url'],
                    'description': message_data['description'],
                    'likes_count': message_data['likes_count'],
                    'play_count': message_data['play_count'],
                    'comment_count': message_data['comment_count'],
                    'share_count': message_data['share_count'],
                    'save_count': message_data['save_count'],
                    'created_at': message_data['created_at'],
                    'hashtags': hashtags_str,
                    'duration': message_data['duration'],
                    'isViral': message_data['isViral'],
                    'currentFetchDate': message_data['currentFetchDate'],
                    'music_id': message_data['music_id'],
                    'music_title': message_data['music_title'],
                    'music_artist': message_data['music_artist'],
                    'category': category_names,
                    'product': product_names,
                    'status': status,
                    'content_type': content_type,
                    'file_path': file_path,
                    'folder_path': folder_path,
                    'image_count': image_count,
                    'playCountIncrease': play_count_increase
                }
                
                execute_write_query(insert_query, insert_params)
            else:
                # 既存動画の更新クエリ
                update_query = """
                    UPDATE video_master 
                    SET likes_count = %(likes_count)s,
                        play_count = %(play_count)s,
                        comment_count = %(comment_count)s,
                        share_count = %(share_count)s,
                        save_count = %(save_count)s,
                        isViral = %(isViral)s,
                        currentFetchDate = %(currentFetchDate)s,
                        prevFetchDate = %(prevFetchDate)s,
                        prevLikesCount = %(prevLikesCount)s,
                        prevPlayCount = %(prevPlayCount)s,
                        playCountIncrease = %(playCountIncrease)s,
                        likesCountIncrease = %(likesCountIncrease)s,
                        status = %(status)s,
                        hashtags = %(hashtags)s,
                        category = %(category)s,
                        product = %(product)s,
                        content_type = %(content_type)s
                    WHERE video_id = %(video_id)s
                """
                
                update_params = {
                    'likes_count': message_data['likes_count'],
                    'play_count': message_data['play_count'],
                    'comment_count': message_data['comment_count'],
                    'share_count': message_data['share_count'],
                    'save_count': message_data['save_count'],
                    'isViral': message_data['isViral'],
                    'currentFetchDate': message_data['currentFetchDate'],
                    'prevFetchDate': message_data.get('prevFetchDate'),
                    'prevLikesCount': message_data.get('prevLikesCount'),
                    'prevPlayCount': message_data.get('prevPlayCount'),
                    'playCountIncrease': play_count_increase,
                    'likesCountIncrease': likes_count_increase,
                    'status': status,
                    'hashtags': hashtags_str,
                    'category': category_names,
                    'product': product_names,
                    'content_type': content_type,
                    'video_id': message_data['video_id']
                }
                
                execute_write_query(update_query, update_params)

            # 新規動画も既存動画も、video_url_dataのフラグを更新
            update_flag_query = """
                UPDATE video_url_data 
                SET is_new_video = FALSE,
                    needs_update = FALSE
                WHERE video_id = %(video_id)s
            """
            update_flag_params = {'video_id': message_data['video_id']}
            
            execute_write_query(update_flag_query, update_flag_params)
            logger.info(f"Updated flags for video_id: {message_data['video_id']}")
            
            logger.info(f"Successfully processed video {message_data['video_id']}")
            return {"success": True, "execution_time": time.time() - start_time}

        except DatabaseError as e:
            logger.error(f"Database error: {str(e)}")
            return {"success": False, "error": str(e)}

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "video-data-sub"  # 既存のサブスクリプション名を使用
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                
                # Cloud Eventオブジェクトをシミュレート
                class MockCloudEvent:
                    def __init__(self, data):
                        self.data = data
                
                cloud_event = MockCloudEvent(data)
                process_video_data(cloud_event)
                
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
                import traceback
                logger.error(traceback.format_exc())
            finally:
                message.ack()
        
        streaming_pull_future = subscriber.subscribe(subscription_path, callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def process_pubsub(event, context):
    """
    GKEからのPub/Subメッセージを処理するCloud Function
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    Returns:
        dict: 処理結果
    """
    logger.info(f"====== process_pubsub 開始：{datetime.now().isoformat()} ======")
    
    try:
        # Pub/Subメッセージデータの取得
        if 'data' in event:
            pubsub_data = base64.b64decode(event['data']).decode("utf-8")
            message_data = json.loads(pubsub_data)
            logger.info(f"デコード後のメッセージ: {message_data}")
            
            return process_video_data(message_data)
        else:
            logger.error("イベントデータがありません")
            return {"success": False, "error": "イベントデータがありません"}
    except Exception as e:
        logger.error(f"Pub/Subメッセージ処理エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    logger.info("スタンドアロンモードで動画処理プロセッサーを起動しています...")
    try:
        # データベース接続テスト
        with get_connection() as connection:
            logger.info("データベース接続テスト成功")
        
        # サブスクリプション設定
        future = setup_subscription()
        
        if future:
            try:
                logger.info("メッセージを待機中...")
                future.result()
            except KeyboardInterrupt:
                future.cancel()
                logger.info("キーボード割り込みにより停止しました")
            except Exception as e:
                future.cancel()
                logger.error(f"エラーが発生しました: {e}")
        else:
            logger.error("サブスクリプションの設定に失敗しました")
            
    except Exception as e:
        logger.error(f"初期化中にエラーが発生: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
else:
    logger.info("Functions Frameworkモードで準備完了") 