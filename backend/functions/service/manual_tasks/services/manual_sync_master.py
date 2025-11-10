from typing import Dict, List, Optional, Tuple, Any
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

load_dotenv()
# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
project_id = os.getenv('PROJECT_ID', 'local-project') 

# 設定の初期化
initialize_config()

def categorize_video_type(video_url: str) -> str:
    """動画URLからコンテンツタイプを判定する"""
    if 'video' in video_url.lower():
        return 'video'
    elif 'photo' in video_url.lower():
        return 'carousel'
    return 'unknown'

def analyze_title(
    title: Optional[str],
    account_type: Optional[str] = None,
    comment_texts: Optional[List[str]] = None
) -> Dict[str, str]:
    """
    動画タイトルからカテゴリと商品名を抽出する
    
    Args:
        title (str): 動画タイトル
        account_type (str, optional): アカウントタイプ
        comment_texts (List[str], optional): コメント本文
    
    Returns:
        Dict[str, str]: カテゴリと商品名の辞書
    """
    try:
        # アフィリエイトアカウント以外の場合は、空の結果を返す
        if not account_type or account_type.lower() != 'アフィリエイト':
            return {
                'category': '',
                'product_name': ''
            }

        video_title_lower = title.lower() if title else ''

        combined_text = [title] if title else []
        if comment_texts:
            combined_text.extend([text for text in comment_texts if text])
        product_text_lower = ' '.join(combined_text).lower() if combined_text else video_title_lower
        
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

        # 先に商品名の判定（出現回数が最も多いキーワードを採用）
        product_name = ''
        product_category = ''
        best_product_match: Optional[Dict] = None
        
        for product_info in product_data:
            keyword = product_info['keyword'].lower()
            if not keyword:
                continue
            keyword_count = product_text_lower.count(keyword)
            if keyword_count <= 0:
                continue
            if not best_product_match or keyword_count > best_product_match['count']:
                best_product_match = {
                    'info': product_info,
                    'count': keyword_count
                }

        if best_product_match:
            product_name = best_product_match['info']['product_name']
            product_category = best_product_match['info']['product_category']
            
            # product_categoryが「複数」の場合、別名テーブルを検索し出現回数で選択
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
                
                alias_best = None
                priority_alias = None
                
                for alias_info in alias_data:
                    alias_keyword = alias_info['keyword'].lower() if alias_info['keyword'] else ''
                    keyword_count = product_text_lower.count(alias_keyword) if alias_keyword else 0
                    if keyword_count > 0 and (
                        not alias_best or keyword_count > alias_best['count']
                    ):
                        alias_best = {
                            'name': alias_info['alias_name'],
                            'count': keyword_count
                        }
                    elif alias_info['alias_priority'] == 1 and not priority_alias:
                        priority_alias = alias_info['alias_name']
                
                if alias_best:
                    product_name = alias_best['name']
                elif priority_alias:
                    product_name = priority_alias
                
                updated_category_query = """
                    SELECT product_category
                    FROM product_master
                    WHERE product_name = %s
                """
                updated_category_result = execute_query(updated_category_query, (product_name,))
                
                if updated_category_result and updated_category_result[0]['product_category'] != '複数':
                    product_category = updated_category_result[0]['product_category']

        # 商品が見つかり、product_categoryが「複数」でない場合はそれをカテゴリとして使用
        if product_name and product_category and product_category != '複数':
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


COMMENT_TEXT_SAMPLE_LIMIT = 50


def fetch_comment_texts(video_id: str) -> List[str]:
    """video_heavy_raw_dataのcomments_jsonからテキストを抽出する"""
    try:
        comments_query = """
            SELECT comments_json
            FROM video_heavy_raw_data
            WHERE video_id = %s
            ORDER BY id DESC
            LIMIT 1
        """
        comments_result = execute_query(comments_query, (video_id,))
        if not comments_result:
            return []

        raw_comments = comments_result[0].get('comments_json')
        if not raw_comments:
            return []

        try:
            payload = json.loads(raw_comments)
        except json.JSONDecodeError:
            stripped = raw_comments.strip() if isinstance(raw_comments, str) else ''
            return [stripped] if stripped else []

        if isinstance(payload, list):
            texts = [text.strip() for text in payload if isinstance(text, str) and text.strip()]
            return texts[:COMMENT_TEXT_SAMPLE_LIMIT]

        if isinstance(payload, dict):
            raw_texts = payload.get('comments') or payload.get('items') or payload.get('data')
            if isinstance(raw_texts, list):
                texts: List[str] = []
                for item in raw_texts:
                    if len(texts) >= COMMENT_TEXT_SAMPLE_LIMIT:
                        break
                    if isinstance(item, str):
                        stripped = item.strip()
                        if stripped:
                            texts.append(stripped)
                    elif isinstance(item, dict):
                        candidate = item.get('text') or item.get('comment') or item.get('content')
                        if isinstance(candidate, str):
                            stripped = candidate.strip()
                            if stripped:
                                texts.append(stripped)
                return texts

        return []
    except Exception as e:
        logger.warning(f"コメント取得に失敗しました: {str(e)}, video_id: {video_id}")
        return []


def find_music_title_from_alt(alt_text: Optional[str]) -> Optional[str]:
    """
    alt_textの「を使用して」より左側から楽曲名候補を抽出し、music_infoで照会して最初にヒットしたタイトルを返す
    """
    if not alt_text:
        return None
    end = alt_text.find('を使用して')
    if end == -1:
        return None
    before = alt_text[:end]

    positions = [i for i, ch in enumerate(before) if ch == 'の']
    if not positions:
        return None

    exists_query = """
        SELECT music_title
        FROM music_info
        WHERE music_title = %s
        LIMIT 1
    """
    for pos in reversed(positions):
        title = before[pos + 1:].strip(' 　「」『』"\'#[]()（）')
        if len(title) < 2:
            continue
        exists = execute_query(exists_query, (title,))
        if exists:
            return title
    return None


def find_music_title_from_alt_fast(alt_text: Optional[str]) -> Optional[str]:
    """
    「の」以降の候補を短い順に列挙し、IN句 + ORDER BY FIELD で優先順位を付けて1回のクエリで照会する
    """
    if not alt_text:
        return None
    end = alt_text.find('を使用して')
    if end == -1:
        return None
    before = alt_text[:end]

    positions = [i for i, ch in enumerate(before) if ch == 'の']
    if not positions:
        return None

    candidates: List[str] = []
    for pos in reversed(positions):
        title = before[pos + 1:].strip(' 　「」『』"\'#[]()（）')
        if len(title) >= 2:
            candidates.append(title)
    if not candidates:
        return None

    placeholders = ','.join(['%s'] * len(candidates))
    sql = f"""
        SELECT music_title
        FROM music_info
        WHERE music_title IN ({placeholders})
        ORDER BY FIELD(music_title, {placeholders})
        LIMIT 1
    """
    rows = execute_query(sql, tuple(candidates + candidates))
    return rows[0]['music_title'] if rows else None

def extract_username_from_url(video_url: str) -> Optional[str]:
    """
    TikTok動画URLからユーザー名を抽出する
    
    Args:
        video_url (str): TikTok動画URL (例: https://www.tiktok.com/@username/video/1234567890)
    
    Returns:
        Optional[str]: 抽出されたユーザー名、または抽出できない場合はNone
    """
    try:
        # URLが有効かチェック
        if not video_url or 'tiktok.com' not in video_url:
            return None
            
        # URLをパース
        parsed_url = urlparse(video_url)
        path = parsed_url.path
        
        # パスを分割して@usernameを検索
        path_parts = path.split('/')
        for part in path_parts:
            if part and part.startswith('@'):
                return part[1:]  # @を除いたユーザー名を返す
                
        return None
    except Exception as e:
        logger.error(f"URLからユーザー名抽出エラー: {str(e)}, URL: {video_url}")
        return None

def get_video_data_batch(batch_size: int = 700, target_video_id: Optional[str] = None) -> Tuple[List[Dict], Dict[str, int]]:
    """
    DBから動画データをバッチで取得する
    
    Args:
        batch_size (int): 1回のバッチで取得するレコード数
        target_video_id (str, optional): 特定のvideo_idのみ取得する場合に指定
        
    Returns:
        Tuple[List[Dict], Dict[str, int]]: 動画データのリストと進捗情報
    """
    try:
        if target_video_id:
            query = """
                SELECT
                    id,
                    video_id,
                    video_url,
                    video_thumbnail_url,
                    user_username,
                    video_title_light,
                    user_nickname,
                    post_time,
                    like_count,
                    comment_count,
                    collect_count,
                    audio_title,
                    (
                        SELECT vl.video_alt_info_text
                        FROM video_light_raw_data vl
                        WHERE vl.video_id = v.video_id
                        ORDER BY vl.id DESC
                        LIMIT 1
                    ) AS video_alt_info_text
                FROM video_heavy_raw_data v
                WHERE video_id = %s
                ORDER BY id DESC
                LIMIT 1
            """
            results = execute_query(query, (target_video_id,))
            return results, {
                'total': 1 if results else 0,
                'remaining': 0
            }

        # 更新対象の総数を取得
        total_count_query = """
            SELECT COUNT(*) as total
            FROM video_heavy_raw_data 
            WHERE manual_update = 1
        """
        total_result = execute_query(total_count_query)
        total_count = total_result[0]['total']

        # カーソル情報の取得
        cursor_query = """
            SELECT last_cursor_id
            FROM processing_cursors
            WHERE processor_name = 'video_sync_master'
            AND target_table = 'video_light_raw_data'
            FOR UPDATE
        """
        cursor_result = execute_query(cursor_query)
                
        if not cursor_result:
            # カーソルが存在しない場合は作成
            init_cursor_query = """
                INSERT INTO processing_cursors 
                (processor_name, target_table, last_cursor_id, batch_size)
                VALUES ('video_sync_master', 'video_light_raw_data', 0, %s)
            """
            execute_write_query(init_cursor_query, (batch_size,))
            last_cursor_id = 0
        else:
            last_cursor_id = cursor_result[0]['last_cursor_id']


        # 残り件数を計算
        remaining_count_query = """
            SELECT COUNT(*) as remaining
            FROM video_heavy_raw_data
            WHERE id > %s
            AND manual_update = 1
        """
        remaining_result = execute_query(remaining_count_query, (last_cursor_id,))
        remaining_count = remaining_result[0]['remaining']

        # バッチデータの取得
        query = """
            SELECT
                id,
                video_id,
                video_url,
                video_thumbnail_url,
                user_username,
                video_title_light,
                user_nickname,
                post_time,
                like_count,
                comment_count,
                collect_count,
                audio_title,
                (
                    SELECT vl.video_alt_info_text
                    FROM video_light_raw_data vl
                    WHERE vl.video_id = video_heavy_raw_data.video_id
                    ORDER BY vl.id DESC
                    LIMIT 1
                ) AS video_alt_info_text
            FROM video_heavy_raw_data
            WHERE id > %s
            AND manual_update = 1
            ORDER BY id
            LIMIT %s
        """
        
        results = execute_query(query, (last_cursor_id, batch_size))
        
        if results:
            # 最後のレコードのIDでカーソルを更新
            last_id = results[-1]['id']
            update_cursor_query = """
                UPDATE processing_cursors
                SET last_cursor_id = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE processor_name = 'video_sync_master'
                AND target_table = 'video_light_raw_data'
            """
            execute_write_query(update_cursor_query, (last_id,))
            
        logger.info(f"更新対象の総数: {total_count}")
        logger.info(f"残り処理件数: {remaining_count}")
            
        progress_info = {
            'total': total_count,
            'remaining': remaining_count
        }
            
        return results, progress_info

    except Exception as e:
        logger.error(f"バッチデータ取得エラー: {str(e)}")
        raise

def sync_video_data(video_data: Dict) -> Dict[str, str]:
    """
    動画データを同期する
    
    Args:
        video_data (Dict): 動画データ
    
    Returns:
        Dict[str, str]: 処理結果
    """
    try:
        video_id = video_data['video_id']
        
        # user_usernameがNullまたは空の場合、URLからユーザー名を抽出
        username = video_data.get('user_username')
        if not username:
            video_url = video_data.get('video_url', '')
            extracted_username = extract_username_from_url(video_url)
            if extracted_username:
                username = extracted_username
                logger.info(f"URLからユーザー名を抽出しました: {username}, video_id: {video_id}")
            else:
                logger.warning(f"ユーザー名が取得できません。video_id: {video_id}")
                username = None  # または適切なデフォルト値を設定

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
        prev_data_results = execute_query(prev_data_query, (video_id,))
        prev_data = prev_data_results[0] if prev_data_results else None

        # 増加量の計算
        current_likes_count = video_data['like_count']
        current_comment_count = video_data['comment_count']
        current_save_count = video_data['collect_count']

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
        thumbnail_result = download_and_save_thumbnail(
            video_id=video_id,
            video_url=video_data['video_url'],
            fallback_url=video_data['video_thumbnail_url']
        )

        # 保存されたサムネイルURLまたは元のURLを使用
        thumbnail_url = thumbnail_result['url'] if thumbnail_result['status'] == 'success' else None

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
        
        # 楽曲タイトルフォールバック（alt情報から取得）
        audio_title = video_data.get('audio_title')
        music_title: Optional[str] = None
        if audio_title is not None and str(audio_title).strip():
            music_title = str(audio_title).strip()
        else:
            alt_text = video_data.get('video_alt_info_text')
            if not alt_text:
                alt_query = """
                    SELECT video_alt_info_text
                    FROM video_light_raw_data
                    WHERE video_id = %s
                    ORDER BY id DESC
                    LIMIT 1
                """
                alt_result = execute_query(alt_query, (video_id,))
                alt_text = alt_result[0]['video_alt_info_text'] if alt_result else None

            if alt_text:
                found = find_music_title_from_alt_fast(alt_text)
                if not found:
                    found = find_music_title_from_alt(alt_text)
                if found:
                    music_title = found
                else:
                    music_title = ''
            else:
                music_title = ''

        # タイトル分析
        raw_title = video_data.get('video_alt_info_text') or video_data.get('video_title_light') or ''
        video_title = normalize_video_title(raw_title)
        comment_texts = fetch_comment_texts(video_id)
        title_analysis = analyze_title(video_title, account_type, comment_texts)
        
        # コンテンツタイプの判定
        content_type = categorize_video_type(video_data['video_url'])

        # ニックネームのクリーニング
        cleaned_nickname = clean_nickname(video_data['user_nickname'])

        # ハッシュタグの抽出とPR判定
        hashtag_source = video_data.get('video_title_light') or raw_title
        hashtags, is_pr = extract_hashtags(hashtag_source)

        # 同期データの作成
        insert_params = {
            'video_id': video_id,
            'url': video_data['video_url'],
            'username': username,
            'display_name': cleaned_nickname,
            'cover_image_url': thumbnail_url,
            'description':video_title,
            'hashtags': hashtags,
            'is_pr': is_pr,  # PRフラグを追加
            'category': title_analysis['category'],
            'product': title_analysis['product_name'],
            'content_type': content_type,
            'created_at': video_data['post_time'],
            'account_type': account_type,
            'parent_account_type': parent_account_type,
            'likesCountIncrease': likes_count_increase,
            'commentCountIncrease': comment_count_increase,
            'saveCountIncrease': save_count_increase,
            'music_title': music_title or '',
            'likes_count': video_data['like_count'],
            'comment_count': video_data['comment_count'],
            'save_count': video_data['collect_count'],
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
            %(account_type)s, %(parent_account_type)s, %(created_at)s,  %(likesCountIncrease)s,
            %(commentCountIncrease)s, %(saveCountIncrease)s,
            %(music_title)s, %(likes_count)s,
            %(comment_count)s, %(save_count)s, %(front_needs_update)s
        )
        ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            cover_image_url = VALUES(cover_image_url),
            description = VALUES(description),
            hashtags = VALUES(hashtags),
            is_pr = VALUES(is_pr),  # PRフラグの更新を追加
            category = VALUES(category),
            product = VALUES(product),
            content_type = VALUES(content_type),
            created_at = VALUES(created_at),
            account_type = VALUES(account_type),
            parent_account_type = VALUES(parent_account_type),
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

        return {
            'status': 'success',
            'message': f'Successfully processed video {video_id}'
        }

    except Exception as e:
        logger.error(f"同期処理エラー: {str(e)}")
        return {'status': 'error', 'message': str(e)}

def sync_video_data_batch(target_video_id: Optional[str] = None) -> Dict[str, Any]:
    """
    動画データをバッチで同期する
    
    Args:
        target_video_id (str, optional): 特定のvideo_idのみ処理したい場合に指定
    
    Returns:
        Dict[str, Any]: 処理結果
    """
    try:
        batch_size = 700
        processed_count = 0
        error_count = 0
        error_videos = []

        # バッチでデータを取得
        videos, progress_info = get_video_data_batch(batch_size, target_video_id)
        
        # 処理対象のデータがない場合はカーソルをリセット
        if not videos:
            if target_video_id:
                message = f"指定されたvideo_id({target_video_id})のデータが見つかりませんでした"
                logger.warning(message)
                return {
                    'status': 'error',
                    'message': message,
                    'processed_count': 0,
                    'error_count': 0,
                    'error_videos': [],
                    'progress_info': {'total': 0, 'remaining': 0}
                }

            reset_query = """
                UPDATE processing_cursors
                SET last_cursor_id = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE processor_name = 'video_sync_master'
                AND target_table = 'video_light_raw_data'
            """
            execute_write_query(reset_query)
            logger.info("全件処理完了のため、カーソルをリセットしました")
            
            return {
                'status': 'success',
                'message': '全件の処理が完了しました',
                'processed_count': 0,
                'error_count': 0,
                'error_videos': [],
                'progress_info': {'total': progress_info['total'], 'remaining': 0}
            }
        
        # 以下、既存の処理続行
        for video in videos:
            try:
                result = sync_video_data(video)
                if result['status'] == 'success':
                    processed_count += 1
                else:
                    error_count += 1
                    error_videos.append({
                        'video_id': video['video_id'],
                        'error': result['message']
                    })
            except Exception as e:
                error_count += 1
                error_videos.append({
                    'video_id': video['video_id'],
                    'error': str(e)
                })

        return {
            'status': 'success',
            'processed_count': processed_count,
            'error_count': error_count,
            'error_videos': error_videos,
            'progress_info': progress_info
        }

    except Exception as e:
        logger.error(f"バッチ同期処理エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

@functions_framework.http
def sync_video_master(request):
    """
    HTTPリクエストで実行される関数
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    logger.info("==== sync_video_master関数の実行開始 ====")
    
    try:
        target_video_id = request.args.get('video_id')
        if not target_video_id:
            try:
                request_json = request.get_json(silent=True) or {}
            except Exception:
                request_json = {}
            target_video_id = request_json.get('video_id') or request_json.get('videoId')

        # バッチ処理の実行
        result = sync_video_data_batch(target_video_id)
        
        # 結果をログ出力
        status_code = 200 if result['status'] == 'success' else 500
        logger.info(f"処理完了 - ステータス: {status_code}")
        logger.info(f"処理結果: {result}")
        
        return result, status_code
        
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


if __name__ == "__main__":
    try:
        target_video_id = os.environ.get('VIDEO_ID')
        result = sync_video_data_batch(target_video_id)
        logger.info(f"処理結果: {result}")
    except KeyboardInterrupt:
        logger.info("処理を中断しました")
    except Exception as e:
        logger.error(f"エラー発生: {str(e)}")
