from typing import Dict, List, Optional
import functions_framework
from google.cloud import bigquery, storage
from datetime import datetime
import requests
from urllib.parse import urlparse
import logging
import os

from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config

def categorize_video_type(video_url: str) -> str:
    """動画URLからコンテンツタイプを判定する"""
    if 'video' in video_url.lower():
        return 'video'
    elif 'photo' in video_url.lower():
        return 'carousel'
    return 'unknown'

def title_analysis(title: str) -> Dict[str, str]:
    """動画タイトルからカテゴリと商品名を抽出する"""
    try:
        # カテゴリキーワードの取得
        category_query = """
            SELECT 
                ck.keyword,
                cm.category_name,
                cm.category_id
            FROM category_keywords ck
            JOIN category_master cm ON ck.category_id = cm.category_id
        """
        keywords_data = execute_query(category_query)

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

        video_title_lower = title.lower() if title else ''
        
        # カテゴリの判定
        categories = set()
        for keyword_data in keywords_data:
            keyword = keyword_data['keyword'].lower()
            if keyword in video_title_lower:
                categories.add((
                    keyword_data['category_name'],
                    keyword_data['category_id']
                ))

        # 商品名の判定
        product_name = ''
        for product_info in product_data:
            keyword = product_info['keyword'].lower()
            if keyword in video_title_lower:
                # 商品がマッチした場合、そのproduct_categoryを確認
                if product_info['product_category'] == '複数':
                    # product_categoryが「複数」の場合、別名テーブルを検索
                    alias_query = """
                        SELECT 
                            pa.alias_name,
                            pa.alias_priority,
                            pak.keyword
                        FROM product_alias pa
                        JOIN product_alias_keywords pak ON pa.alias_id = pak.alias_id
                        WHERE pa.product_name = %s
                    """
                    alias_data = execute_query(alias_query, (product_info['product_name'],))
                    
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
                    if not alias_match:
                        product_name = priority_alias if priority_alias else product_info['product_name']
                else:
                    # product_categoryが「複数」でない場合は、そのまま商品名を使用
                    product_name = product_info['product_name']
                break  # 最初にマッチした商品で処理を終了

        # カテゴリ名をカンマ区切りで結合（空の場合は「その他」）
        category_names = ','.join(sorted(set(cat[0] for cat in categories))) if categories else 'その他'

        return {
            'category': category_names,
            'product_name': product_name
        }

    except Exception as e:
        logging.error(f"タイトル解析エラー: {str(e)}, title: {title}")
        return {
            'category': 'その他',
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
    ニックネームから最後の「・」以降を取り除く
    
    Args:
        nickname (str): 元のニックネーム（例: 'ユーザー・その他・2024-03-20'）
    
    Returns:
        str: クリーニング後のニックネーム（例: 'ユーザー・その他'）
    """
    if not nickname or '・' not in nickname:
        return nickname
        
    # 最後の「・」の位置を見つける
    last_dot_index = nickname.rindex('・')
    return nickname[:last_dot_index]

def extract_hashtags(title: str) -> str:
    """
    動画タイトルからハッシュタグを抽出し、カンマ区切りの文字列として返す
    
    Args:
        title (str): 動画タイトル
        
    Returns:
        str: カンマ区切りのハッシュタグ文字列（例: "ハッシュタグA,ハッシュタグB"）
    """
    if not title:
        return ""
        
    # #で分割し、最初の要素（タイトル本文）を除外
    parts = title.split('#')
    if len(parts) <= 1:  # ハッシュタグがない場合
        return ""
        
    # ハッシュタグ部分を処理（先頭の#を除去し、空白を除去）
    hashtags = [tag.strip() for tag in parts[1:] if tag.strip()]
    
    # カンマ区切りの文字列として結合
    return ','.join(hashtags)

def sync_video_data(request) -> Dict[str, str]:
    """
    HTTP CloudFunctionのメインハンドラ
    video_light_raw_dataとvideo_heavy_raw_dataからデータを抽出し、
    video_masterテーブルに同期する
    """
    client = bigquery.Client()

    # Light Raw Dataからの抽出クエリ
    light_query = """
    SELECT 
        video_url,
        video_id,
        user_username,
        play_count,
        video_thumbnail_url
    FROM video_light_raw_data
    """

    # Heavy Raw Dataからの抽出クエリ
    heavy_query = """
    SELECT 
        video_id,
        user_nickname,
        post_time,
        audio_title,
        video_title,
        like_count,
        comment_count,
        collect_count
    FROM video_heavy_raw_data
    """

    try:
        # データの取得
        light_data = client.query(light_query).result()
        heavy_data = client.query(heavy_query).result()

        # Heavy dataをディクショナリに変換（video_idをキーとして）
        heavy_data_dict = {row.video_id: row for row in heavy_data}

        # 同期用のデータを準備
        sync_rows = []
        for light_row in light_data:
            heavy_row = heavy_data_dict.get(light_row.video_id)
            if not heavy_row:
                continue

            # 前回のデータを取得（MySQL用のクエリ）
            prev_data_query = """
                SELECT 
                    play_count,
                    likes_count,
                    comment_count,
                    save_count
                FROM video_master
                WHERE video_id = %s
                ORDER BY created_at DESC
                LIMIT 1
            """
            prev_data_params = (light_row.video_id,)
            prev_data_results = execute_query(prev_data_query, prev_data_params)
            prev_data = prev_data_results[0] if prev_data_results else None

            # 増加量の計算
            current_play_count = heavy_row.play_count if heavy_row.play_count is not None else 0
            current_likes_count = heavy_row.like_count if heavy_row.like_count is not None else 0
            current_comment_count = heavy_row.comment_count if heavy_row.comment_count is not None else 0
            current_save_count = heavy_row.collect_count if heavy_row.collect_count is not None else 0

            if prev_data:
                # 前回のデータが存在する場合は差分を計算
                prev_play_count = prev_data['play_count'] if prev_data['play_count'] is not None else 0
                prev_likes_count = prev_data['likes_count'] if prev_data['likes_count'] is not None else 0
                prev_comment_count = prev_data['comment_count'] if prev_data['comment_count'] is not None else 0
                prev_save_count = prev_data['save_count'] if prev_data['save_count'] is not None else 0

                play_count_increase = current_play_count - prev_play_count
                likes_count_increase = current_likes_count - prev_likes_count
                comment_count_increase = current_comment_count - prev_comment_count
                save_count_increase = current_save_count - prev_save_count
            else:
                # 新規動画の場合は現在の値をそのまま増加量とする
                play_count_increase = current_play_count
                likes_count_increase = current_likes_count
                comment_count_increase = current_comment_count
                save_count_increase = current_save_count

            # サムネイル画像の取得と保存
            thumbnail_result = download_and_save_thumbnail(
                video_id=light_row.video_id,
                video_url=light_row.video_url,
                fallback_url=light_row.video_thumbnail_url
            )

            # 保存されたサムネイルURLまたは元のURLを使用
            thumbnail_url = thumbnail_result['url'] if thumbnail_result['status'] == 'success' else None

            # タイトル分析
            title_analysis = TitleAnalyzer.analyze(heavy_row.video_title)
            
            # コンテンツタイプの判定
            content_type = categorize_video_type(light_row.video_url)

            # ニックネームのクリーニング
            cleaned_nickname = clean_nickname(heavy_row.user_nickname)

            # ハッシュタグの抽出
            hashtags = extract_hashtags(heavy_row.video_title)

            # 同期データの作成
            sync_row = {
                'video_id': light_row.video_id,
                'url': light_row.video_url,
                'username': light_row.user_username,
                'display_name': cleaned_nickname,
                'cover_image_url': thumbnail_url,
                'description': heavy_row.video_title,
                'hashtags': hashtags,
                'category': title_analysis['category'],
                'product_name': title_analysis['product_name'],
                'content_type': content_type,
                'created_at': heavy_row.post_time,
                'playCountIncrease': play_count_increase,
                'likesCountIncrease': likes_count_increase,
                'commentCountIncrease': comment_count_increase,
                'saveCountIncrease': save_count_increase,
                'music_title': heavy_row.audio_title,
                'play_count': light_row.play_count,
                'likes_count': heavy_row.like_count,
                'comment_count': heavy_row.comment_count,
                'save_count': heavy_row.collect_count
            }
            sync_rows.append(sync_row)

        # video_masterテーブルへの同期
        if sync_rows:
            table_id = 'video_master'
            errors = client.insert_rows_json(table_id, sync_rows)
            if errors:
                return {'status': 'error', 'message': f'Insertion errors: {errors}'}

        return {
            'status': 'success',
            'message': f'Successfully synced {len(sync_rows)} records'
        }

    except Exception as e:
        return {'status': 'error', 'message': str(e)}

# Cloud Functionのエントリーポイント
@functions_framework.http
def sync_video_master(request):
    """
    HTTPトリガーでvideo_masterテーブルの同期を実行する
    """
    result = sync_video_data(request)
    return result 