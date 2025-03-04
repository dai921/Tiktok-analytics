import os
import json
import logging
import mysql.connector
from datetime import datetime
import time
import sys

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数を明示的に設定
os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
environment = os.getenv('ENVIRONMENT', 'development')
project_id = os.getenv('PROJECT_ID', 'local-project')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"Pub/Subエミュレータ: {os.environ['PUBSUB_EMULATOR_HOST']}")
logger.info(f"プロジェクトID: {project_id}")

def get_db_connection():
    """データベース接続を取得する"""
    try:
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER', 'tiktok_user'),
            password=os.getenv('MYSQL_PASSWORD', 'tiktok_pass'),
            database=os.getenv('MYSQL_DATABASE', 'tiktok_data')
        )
        logger.info(f"データベース接続成功: {conn.server_host}")
        return conn
    except Exception as e:
        logger.error(f"データベース接続エラー: {e}")
        raise

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
            import base64
            pubsub_message = base64.b64decode(data['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
        else:
            message_data = data

        logger.info(f"受信したメッセージ: {message_data}")

        # 真っ先にステータスをチェック
        status = message_data.get('status', 'unknown')
        if status in ['error', 'deleted']:
            # データベース接続
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
            try:
                # video_masterの更新（INSERT ... ON DUPLICATE KEY UPDATE）
                error_upsert_query = """
                    INSERT INTO video_master (
                        url, video_id, username, status, currentFetchDate
                    ) VALUES (
                        %s, %s, %s, %s, %s
                    ) ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        currentFetchDate = VALUES(currentFetchDate)
                """
                error_values = (
                    message_data['video_url'],
                    message_data['video_id'],
                    message_data['username'],
                    status,
                    datetime.now().isoformat()
                )
                
                # video_url_dataのフラグを更新
                update_flag_query = """
                    UPDATE video_url_data 
                    SET is_new_video = FALSE,
                        needs_update = FALSE
                    WHERE video_id = %s
                """
                
                cursor.execute(error_upsert_query, error_values)
                cursor.execute(update_flag_query, (message_data['video_id'],))
                
                conn.commit()
                logger.info(f"Updated status and flags for video {message_data['video_id']}")
                return {"success": True, "execution_time": time.time() - start_time}
            
            except Exception as e:
                conn.rollback()
                logger.error(f"Error storing error/deleted status: {str(e)}")
                return {"success": False, "error": str(e)}
            
            finally:
                if cursor:
                    cursor.close()
                if conn:
                    conn.close()

        # 以降は通常の処理（status が normal の場合）
        is_new_video = message_data.get('is_new_video')

        # データベース接続
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        try:
            # カテゴリキーワードの取得
            cursor.execute("""
                SELECT ck.keyword, ck.is_product, cm.category_name, cm.category_id
                FROM category_keywords ck
                JOIN category_master cm ON ck.category_id = cm.category_id
            """)
            keywords_data = cursor.fetchall()

            # カテゴリの判定
            categories = set()
            description = message_data.get('description', '').lower()
            hashtags = message_data.get('hashtags', [])
            
            # コンテンツタイプの判定
            video_url = message_data.get('url', '')
            if 'video' in video_url.lower():
                content_type = 'video'
            elif 'photo' in video_url.lower():
                content_type = 'carousel'
            else:
                content_type = 'unknown'
            
            # ハッシュタグの処理を改善
            if isinstance(hashtags, str):
                # 文字列の場合、JSONとして解析を試みる
                try:
                    hashtags = json.loads(hashtags)
                except json.JSONDecodeError:
                    # JSONとして解析できない場合、カンマまたは空白で分割
                    if ',' in hashtags:
                        hashtags = [tag.strip() for tag in hashtags.split(',')]
                    else:
                        hashtags = [tag.strip() for tag in hashtags.split()]
            
            # リストでない場合は空リストとして扱う
            if not isinstance(hashtags, list):
                hashtags = []
            
            # ハッシュタグから#記号と空白を除去し、重複を排除
            hashtags = list(set(tag.strip('#').strip() for tag in hashtags if tag.strip()))
            
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
                cursor.execute("""
                    SELECT currentFetchDate, play_count, likes_count
                    FROM video_master
                    WHERE video_id = %s
                    ORDER BY currentFetchDate DESC
                    LIMIT 1
                """, (message_data['video_id'],))
                prev_data = cursor.fetchone()

                if prev_data:
                    message_data['prevFetchDate'] = prev_data['currentFetchDate']
                    message_data['prevPlayCount'] = prev_data['play_count']
                    message_data['prevLikesCount'] = prev_data['likes_count']

            # デバッグ用：受信したメッセージの内容を詳細に出力
            logger.info("受信したメッセージの詳細:")
            for key, value in message_data.items():
                logger.info(f"{key}: {value}")

            # play_countとlikes_countの増加量を計算
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
                        status, content_type, file_path, folder_path, image_count  # 新しいフィールド
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """
                # hashtagsをカンマ区切りの文字列として保存
                hashtags_str = ','.join(hashtags)
                
                # ファイルパスとステータスの処理
                file_path = message_data.get('file_path')
                folder_path = message_data.get('folder_path')
                image_count = message_data.get('image_count', 0)

                values = (
                    message_data['url'],
                    message_data['video_id'],
                    message_data['username'],
                    message_data['display_name'],
                    message_data['cover_image_url'],
                    message_data['description'],
                    message_data['likes_count'],
                    message_data['play_count'],
                    message_data['comment_count'],
                    message_data['share_count'],
                    message_data['save_count'],
                    message_data['created_at'],
                    hashtags_str,  # JSONではなくカンマ区切りの文字列として保存
                    message_data['duration'],
                    message_data['isViral'],
                    message_data['currentFetchDate'],
                    message_data['music_id'],
                    message_data['music_title'],
                    message_data['music_artist'],
                    category_names,
                    product_names,
                    status,                     # 新規: ステータス
                    content_type,               # コンテンツタイプを追加
                    file_path,                  # 新規: ファイルパス
                    folder_path,                # 新規: フォルダパス（カルーセル用）
                    image_count                 # 新規: 画像数（カルーセル用）
                )
            else:
                # 既存動画の更新クエリ
                update_query = """
                    UPDATE video_master 
                    SET likes_count = %s,
                        play_count = %s,
                        comment_count = %s,
                        share_count = %s,
                        save_count = %s,
                        isViral = %s,
                        currentFetchDate = %s,
                        prevFetchDate = %s,
                        prevLikesCount = %s,
                        prevPlayCount = %s,
                        playCountIncrease = %s,
                        likesCountIncrease = %s,
                        status = %s,
                        hashtags = %s,
                        category = %s,
                        product = %s,
                        content_type = %s
                    WHERE video_id = %s
                """
                
                # hashtagsをカンマ区切りの文字列として保存
                hashtags_str = ','.join(hashtags)
                
                values = (
                    message_data['likes_count'],
                    message_data['play_count'],
                    message_data['comment_count'],
                    message_data['share_count'],
                    message_data['save_count'],
                    message_data['isViral'],
                    message_data['currentFetchDate'],
                    message_data.get('prevFetchDate'),
                    message_data.get('prevLikesCount'),
                    message_data.get('prevPlayCount'),
                    play_count_increase,
                    likes_count_increase,
                    status,
                    hashtags_str,          # 追加: ハッシュタグ
                    category_names,        # 追加: カテゴリ
                    product_names,         # 追加: プロダクト
                    content_type,          # 追加: コンテンツタイプ
                    message_data['video_id']
                )

            try:
                # video_masterへの保存
                cursor.execute(insert_query if is_new_video else update_query, values)

                # 新規動画も既存動画も、video_url_dataのフラグを更新
                update_flag_query = """
                    UPDATE video_url_data 
                    SET is_new_video = FALSE,
                        needs_update = FALSE
                    WHERE video_id = %s
                """
                cursor.execute(update_flag_query, (message_data['video_id'],))
                logger.info(f"Updated flags for video_id: {message_data['video_id']}")

                conn.commit()
                logger.info(f"Successfully processed video {message_data['video_id']}")
                return {"success": True, "execution_time": time.time() - start_time}

            except Exception as e:
                conn.rollback()
                logger.error(f"SQL実行エラー: {str(e)}")
                logger.error(f"実行したクエリ: {insert_query if is_new_video else update_query}")
                logger.error(f"使用した値: {values}")
                return {"success": False, "error": str(e)}

        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {str(e)}")
            return {"success": False, "error": str(e)}

        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

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
                process_video_data(data)
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

if __name__ == "__main__":
    logger.info("スタンドアロンモードで動画処理プロセッサーを起動しています...")
    try:
        # データベース接続テスト
        connection = get_db_connection()
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
    future = setup_subscription()
    if future:
        logger.info("サブスクリプションの設定が完了しました") 