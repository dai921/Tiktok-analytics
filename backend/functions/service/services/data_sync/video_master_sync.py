from typing import Dict, List, Optional, Tuple
import functions_framework
from google.cloud import storage
from datetime import datetime, timedelta
import requests
from urllib.parse import urlparse
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
topic_name = "video-master-sync"  

# 設定の初期化
initialize_config()

def categorize_video_type(video_url: str) -> str:
    """動画URLからコンテンツタイプを判定する"""
    if 'photo' in video_url.lower():
        return 'carousel'
    elif 'video' in video_url.lower():
        return 'video'
    return 'unknown'

def analyze_title(title: str, account_type: Optional[str] = None) -> Dict[str, str]:
    """
    動画タイトルからカテゴリと商品名を抽出する
    
    Args:
        title (str): 動画タイトル
        account_type (str, optional): アカウントタイプ
    
    Returns:
        Dict[str, str]: カテゴリと商品名の辞書
    """
    try:
        # アフィリエイトアカウント以外の場合は、空の結果を返す
        if not account_type or account_type.lower() != 'アフィリエイト':
            return {
                'category':'',
                'product_name': ''
            }

        video_title_lower = title.lower() if title else ''
        
        # 商品キーワードの取得
        product_query = """
            SELECT 
                pk.keyword,
                pm.product_name,
                pm.product_category
            FROM product_keywords pk
            JOIN product_master pm ON pk.product_id = pm.product_id
        """
        product_data = execute_query(product_query)

        # 先に商品名の判定
        product_name = ''
        product_category = ''
        
        for product_info in product_data:
            keyword = product_info['keyword'].lower()
            if keyword in video_title_lower:
                product_name = product_info['product_name']
                product_category = product_info['product_category']
                
                # product_categoryが「複数」の場合、別名テーブルを検索
                if product_category == '複数':
                    alias_query = """
                        SELECT 
                            pa.alias_name,
                            pa.alias_priority,
                            pak.keyword
                        FROM product_alias pa
                        JOIN product_alias_keywords pak ON pa.alias_id = pak.alias_id
                        WHERE pa.product_name = %s
                    """
                    alias_data = execute_query(alias_query, (product_name,))
                    
                    # 別名キーワードでマッチするか確認
                    alias_match = False
                    priority_alias = None
                    
                    for alias_info in alias_data:
                        if alias_info['keyword'].lower() in video_title_lower:
                            product_name = alias_info['alias_name']
                            alias_match = True
                            break
                        # Priority=1の別名を保持
                        elif alias_info['alias_priority'] == 1:
                            priority_alias = alias_info['alias_name']
                    
                    # キーワードマッチしなかった場合はPriority=1の別名を使用
                    if not alias_match and priority_alias:
                        product_name = priority_alias
                    
                    # 更新した商品名に対応するカテゴリを取得
                    updated_category_query = """
                        SELECT product_category
                        FROM product_master
                        WHERE product_name = %s
                    """
                    updated_category_result = execute_query(updated_category_query, (product_name,))
                    
                    # 新しいカテゴリがあれば更新
                    if updated_category_result and updated_category_result[0]['product_category'] != '複数':
                        product_category = updated_category_result[0]['product_category']
                
                break  # 最初にマッチした商品で処理を終了

        # 商品が見つかり、product_categoryが「複数」でない場合はそれをカテゴリとして使用
        if product_name and product_category:
            return {
                'category': product_category,
                'product_name': product_name
            }
        
        # 商品が見つからなかった、またはproduct_categoryが「複数」の場合は従来のカテゴリ判定を行う
        category_query = """
            SELECT 
                ck.keyword,
                cm.category_name,
                cm.category_id
            FROM category_keywords ck
            JOIN category_master cm ON ck.category_id = cm.category_id
        """
        keywords_data = execute_query(category_query)

        # カテゴリの判定
        categories = set()
        for keyword_data in keywords_data:
            keyword = keyword_data['keyword'].lower()
            if keyword in video_title_lower:
                categories.add((
                    keyword_data['category_name'],
                    keyword_data['category_id']
                ))

        # カテゴリ名をカンマ区切りで結合（空の場合は「その他」）
        category_names = ','.join(sorted(set(cat[0] for cat in categories))) if categories else 'その他'

        return {
            'category': category_names,
            'product_name': product_name
        }

    except Exception as e:
        logging.error(f"タイトル解析エラー: {str(e)}, title: {title}")
        return {
            'category': account_type or '',
            'product_name': ''
        }

def download_and_save_thumbnail(video_id: str, video_url: str, fallback_url: str) -> Dict[str, str]:
    """
    OEmbed APIを使用してサムネイルを取得・保存し、失敗した場合は直接URLからダウンロードを試みる
    
    Args:
        video_id (str): 動画ID
        video_url (str): TikTok動画URL（OEmbed用）
        fallback_url (str): フォールバック用のサムネイルURL
    """
    try:
        # 環境変数からバケット名を取得
        bucket_name = os.environ.get('BUCKET_NAME')
        if not bucket_name:
            raise ValueError("BUCKET_NAME environment variable is not set")

        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        storage_path = f'thumbnails/{video_id}.jpg'
        blob = bucket.blob(storage_path)

        # 既に保存済みの場合はそのURLを返す
        if blob.exists():
            return {
                'status': 'success',
                'url': f'https://storage.googleapis.com/{bucket_name}/{storage_path}'
            }

        # 1. まずOEmbed APIを試す
        try:
            oembed_url = f"https://www.tiktok.com/oembed?url={video_url}"
            oembed_response = requests.get(oembed_url, timeout=10)
            oembed_response.raise_for_status()
            oembed_data = oembed_response.json()
            thumbnail_url = oembed_data['thumbnail_url']
            
            # OEmbedから取得したURLから画像をダウンロード
            image_response = requests.get(thumbnail_url, timeout=10)
            image_response.raise_for_status()
            image_data = image_response.content
            content_type = image_response.headers.get('Content-Type', 'image/jpeg')

        except (requests.RequestException, KeyError, ValueError) as e:
            logging.warning(f"OEmbed API failed for {video_id}, falling back to direct download: {str(e)}")
            
            # 2. OEmbedが失敗した場合、直接URLからダウンロードを試みる
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            image_response = requests.get(fallback_url, headers=headers, timeout=10)
            image_response.raise_for_status()
            image_data = image_response.content
            content_type = image_response.headers.get('Content-Type', 'image/jpeg')

        # Content-Typeの検証
        if not content_type.startswith('image/'):
            raise ValueError(f'Invalid content type: {content_type}')

        # Cloud Storageに保存
        blob.upload_from_string(
            image_data,
            content_type=content_type
        )

        # 公開URLを返す
        public_url = f'gs://{bucket_name}/{storage_path}'
        return {
            'status': 'success',
            'url': public_url
        }

    except Exception as e:
        logging.error(f"Thumbnail download failed for video {video_id}: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

def clean_nickname(nickname: str) -> str:
    """
    ニックネームから最後の「·」以降を取り除く
    
    Args:
        nickname (str): 元のニックネーム（例: 'towa🌙 · 1-17'）
    
    Returns:
        str: クリーニング後のニックネーム（例: 'towa🌙'）
    """
    if not nickname or '·' not in nickname:  # 中点(U+00B7)を使用
        return nickname
        
    # 最後の「·」の位置を見つける
    last_dot_index = nickname.rindex('·')  # 中点(U+00B7)を使用
    return nickname[:last_dot_index].strip()  # 末尾の空白も削除

def normalize_video_title(title: str) -> str:
    """
    動画タイトルを正規化する。最初の「作成した」以降の部分を抽出する
    
    Args:
        title (str): 元の動画タイトル（例: 'TikTok で田中太郎が作成した新商品のレビュー動画を作成した'）
    
    Returns:
        str: 正規化された動画タイトル（例: '新商品のレビュー動画を作成した'）
    """
    if not title or '作成した' not in title:
        return title
        
    # 最初の「作成した」の位置を見つける
    first_marker_index = title.index('作成した')
    # 「作成した」の長さ（4文字）を加えて、それ以降の部分を取得
    return title[first_marker_index + 4:].strip()

def extract_hashtags(title: str) -> Tuple[str, bool]:
    """
    動画タイトルからハッシュタグを抽出し、PR判定も行う
    
    Args:
        title (str): 動画タイトル
        
    Returns:
        Tuple[str, bool]: (カンマ区切りのハッシュタグ文字列, PR判定フラグ)
    """
    if not title:
        return "", False
        
    # #で分割し、最初の要素（タイトル本文）を除外
    parts = title.split('#')
    if len(parts) <= 1:  # ハッシュタグがない場合
        return "", False
        
    # ハッシュタグ部分を処理（先頭の#を除去し、空白を除去）
    hashtags = [tag.strip() for tag in parts[1:] if tag.strip()]
    
    # PR判定（大文字小文字を区別しない）
    is_pr = any(tag.lower() == 'pr' for tag in hashtags)
    
    # カンマ区切りの文字列として結合
    hashtags_str = ','.join(hashtags)
    
    return hashtags_str, is_pr

def sync_video_data(video_data: Dict) -> Dict[str, str]:
    """
    Pub/Subメッセージから受け取ったデータを処理し、
    video_masterテーブルに同期する
    """
    try:
        # データの取り出し
        video_id = video_data['video_id']
        
        # ①対象のvideo_idのログ
        print(f"[LOG] 処理対象のvideo_id: {video_id}")

        # play_countとaudio_titleの値チェック
        if video_data.get('audio_title') is None:
            logger.warning(f"必須データが不足しています。video_id: {video_id}")
            return {
                'status': 'error',
                'message': f'Required data missing for video {video_id}'
            }

        # 前回のデータを取得（MySQL用のクエリ）
        prev_data_query = """
            SELECT 
                likes_count,
                comment_count,
                save_count,
                currentFetchDate
            FROM video_master
            WHERE video_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """
        prev_data_params = (video_id,)
        prev_data_results = execute_query(prev_data_query, prev_data_params)
        prev_data = prev_data_results[0] if prev_data_results else None


        # 増加量の計算
        current_likes_count = video_data['like_count']
        current_comment_count = video_data['comment_count']
        current_save_count = video_data['save_count']

        if prev_data:
            # 前回のデータが存在する場合は差分を計算
            prev_likes_count = prev_data['likes_count'] if prev_data['likes_count'] is not None else 0
            prev_comment_count = prev_data['comment_count'] if prev_data['comment_count'] is not None else 0
            prev_save_count = prev_data['save_count'] if prev_data['save_count'] is not None else 0

            likes_count_increase = current_likes_count - prev_likes_count
            comment_count_increase = current_comment_count - prev_comment_count
            save_count_increase = current_save_count - prev_save_count
        else:
            # 新規動画の場合は現在の値をそのまま増加量とする
            likes_count_increase = current_likes_count
            comment_count_increase = current_comment_count
            save_count_increase = current_save_count

        # サムネイル画像の取得と保存
        # ③加工前のサムネURLのログ
        original_thumbnail_url = video_data['video_thumbnail_url']
        print(f"[LOG] 加工前のサムネURL: {original_thumbnail_url}")
        
        thumbnail_result = download_and_save_thumbnail(
            video_id=video_id,
            video_url=video_data['video_url'],
            fallback_url=video_data['video_thumbnail_url']
        )

        # 保存されたサムネイルURLまたは元のURLを使用
        thumbnail_url = thumbnail_result['url'] if thumbnail_result['status'] == 'success' else None
        
        # ③加工後のサムネURLのログ
        print(f"[LOG] 加工後のサムネURL: {thumbnail_url}")
        
        username = video_data['user_username']

        # アカウントタイプの取得
        account_type_query = """
            SELECT account_type, parent_account_type
            FROM account_list
            WHERE favorite_user_username = %s
            LIMIT 1
        """
        account_type_results = execute_query(account_type_query, (username,))
        account_type = account_type_results[0]['account_type'] if account_type_results else None
        parent_account_type = account_type_results[0]['parent_account_type'] if account_type_results else None
        
        # タイトル分析
        # ②加工前のvideo_titleのログ
        original_video_title = video_data['video_title']
        print(f"[LOG] 加工前のvideo_title: {original_video_title}")
        
        video_title = normalize_video_title(video_data['video_title'])
        
        # ②加工後のvideo_titleのログ
        print(f"[LOG] 加工後のvideo_title: {video_title}")
        
        title_analysis = analyze_title(video_title, account_type)
        
        # コンテンツタイプの判定
        content_type = categorize_video_type(video_data['video_url'])

        # ニックネームのクリーニング
        cleaned_nickname = clean_nickname(video_data['user_nickname'])

        # ハッシュタグの抽出とPR判定
        hashtags, is_pr = extract_hashtags(video_data['video_title'])

        # post_timeを受け取った形式によって処理を変える
        if isinstance(video_data['post_time'], str):
            # 文字列形式の場合はdatetimeに変換
            post_time = datetime.fromisoformat(video_data['post_time'].replace('Z', '+00:00'))
        else:
            # すでにdatetime形式の場合はそのまま使用
            post_time = video_data['post_time']

        # 9時間加算してJST時間に
        jst_time = post_time + timedelta(hours=9)

        # 同期データの作成
        insert_params = {
            'video_id': video_id,
            'url': video_data['video_url'],
            'username': username,
            'display_name': cleaned_nickname,
            'cover_image_url': thumbnail_url,
            'description': video_title,
            'hashtags': hashtags,
            'is_pr': is_pr,
            'category': title_analysis['category'],
            'product': title_analysis['product_name'],
            'content_type': content_type,
            'created_at': jst_time,
            'account_type': account_type,
            'parent_account_type': parent_account_type,
            'likesCountIncrease': likes_count_increase,
            'commentCountIncrease': comment_count_increase,
            'saveCountIncrease': save_count_increase,
            'music_title': video_data['audio_title'],
            'likes_count': video_data['like_count'],
            'comment_count': video_data['comment_count'],
            'save_count': video_data['save_count'],
            'front_needs_update': 1
        }
  
        insert_query = """
        INSERT INTO video_master (
            video_id, url, username, display_name, cover_image_url,
            description, hashtags, is_pr, category, product, content_type,
            account_type, parent_account_type, created_at, likesCountIncrease,
            commentCountIncrease, saveCountIncrease, music_title,
            likes_count, comment_count, save_count, front_needs_update
        ) VALUES (
            %(video_id)s, %(url)s, %(username)s, %(display_name)s,
            %(cover_image_url)s, %(description)s, %(hashtags)s,
            %(is_pr)s, %(category)s, %(product)s, %(content_type)s,
            %(account_type)s, %(parent_account_type)s, %(created_at)s, %(likesCountIncrease)s,
            %(commentCountIncrease)s, %(saveCountIncrease)s,
            %(music_title)s, %(likes_count)s,
            %(comment_count)s, %(save_count)s, %(front_needs_update)s
        )
        ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            cover_image_url = VALUES(cover_image_url),
            description = VALUES(description),
            hashtags = VALUES(hashtags),
            is_pr = VALUES(is_pr),
            category = VALUES(category),
            product = VALUES(product),
            content_type = VALUES(content_type),
            account_type = VALUES(account_type),
            parent_account_type = VALUES(parent_account_type),
            created_at = VALUES(created_at),
            likesCountIncrease = VALUES(likesCountIncrease),
            commentCountIncrease = VALUES(commentCountIncrease),
            saveCountIncrease = VALUES(saveCountIncrease),
            music_title = VALUES(music_title),
            likes_count = VALUES(likes_count),
            comment_count = VALUES(comment_count),
            save_count = VALUES(save_count),
            front_needs_update = VALUES(front_needs_update)
        """
        execute_write_query(insert_query, insert_params)

        # 商品名の対策ができたらコメントアウトを外す
        # # アフィリエイトアカウントで商品名が空またはNoneの場合、Pub/Subメッセージを送信
        # if (account_type and 
        #     account_type.lower() == 'アフィリエイト' and 
        #     (title_analysis['product_name'] is None or title_analysis['product_name'].strip() == '')):
        #     try:
        #         publisher = pubsub_v1.PublisherClient()
        #         topic_path = publisher.topic_path(project_id, 'video-download-tasks')
                
        #         # メッセージデータの作成
        #         message_data = {
        #             'video_id': video_id,
        #             'url': video_data['video_url'],
        #             'type': 'product_analysis'
        #         }
                
        #         # メッセージの送信
        #         future = publisher.publish(
        #             topic_path,
        #             json.dumps(message_data).encode('utf-8')
        #         )
        #         future.result()  # 送信完了を待機
                
        #         logger.info(f"Product analysis task published for video {video_id}")
        #     except Exception as e:
        #         logger.error(f"Failed to publish product analysis task: {str(e)}")
        #         # メッセージ送信の失敗は全体の処理を失敗させない

        # return {
        #     'status': 'success',
        #     'message': f'Successfully processed video {video_id}'
        # }

    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return {'status': 'error', 'message': str(e)}

def sync_play_count(video_data: Dict) -> Dict[str, str]:
    """
    play_countのみを処理し、video_masterテーブルに同期する
    video_idが存在しない場合は新規レコードを作成する
    """
    try:
        video_id = video_data['video_id']
        logger.info(f"play_count処理を始めます。video_id: {video_id}")
        
        # 前回のデータを取得
        prev_data_query = """
            SELECT play_count
            FROM video_master
            WHERE video_id = %s
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
            url, video_id, username, play_count, playCountIncrease,play_needs_update
        ) VALUES (
            %s, %s, %s, %s, %s, 1
        )
        ON DUPLICATE KEY UPDATE
            play_count = VALUES(play_count),
            playCountIncrease = VALUES(playCountIncrease),
            play_needs_update = 1
        """
        execute_write_query(upsert_query, (video_data['video_url'], video_id, video_data['user_username'], current_play_count, play_count_increase))
        
        return {
            'status': 'success',
            'message': f'Successfully updated play_count for video {video_id}'
        }

    except Exception as e:
        logger.error(f"play_count同期処理エラー: {str(e)}")
        return {'status': 'error', 'message': str(e)}

def sync_video_master(event, context):
    """
    Pub/Subメッセージで実行される関数
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    logger.info("==== sync_video_master関数の実行開始 ====")
    
    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            video_data = json.loads(message_data)
            logger.info(f"Pub/Subメッセージを受信: {video_data}")
        else:
            logger.error("データなしのメッセージを受信")
            return {
                'status': 'error',
                'message': 'No data in message'
            }, 400

        # play_countの有無で処理を分岐
        if 'play_count' in video_data and 'video_id' in video_data:
            # play_countのみの処理
            result = sync_play_count(video_data)
        else:
            # 通常の同期処理
            result = sync_video_data(video_data)
        
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
        logger.info("==== sync_video_master関数の実行終了 ====")


def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        subscription_name = "video-master-sync-sub"  # 既存のサブスクリプション名を使用   
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        def _callback(msg):
            try:
              # msg.data は bytes → Base64 文字列へ
              encoded = base64.b64encode(msg.data).decode('utf-8')
              event = {'data': encoded}

               # context は不要なので None
              sync_video_master(event, None)

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
    logger.info("Listening for messages...")
    try:
        future.result()               # メインスレッドをブロック
    except KeyboardInterrupt:
        future.cancel()