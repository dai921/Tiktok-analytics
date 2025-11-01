import os
import json
import base64
import tempfile
import logging
import random
import re
from typing import Any, Dict, Optional, Tuple, List

import yt_dlp
from google.cloud import storage
import google.generativeai as genai
from urllib.parse import urlparse

# 既存のDBユーティリティ
from db_utils import execute_query, execute_write_query, DatabaseError


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===============
# ユーティリティ
# ===============

# account_name 取得は利用しないため削除


def _decode_pubsub_message(event: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not event or "data" not in event:
        return {}
    try:
        message_data = base64.b64decode(event["data"]).decode("utf-8")
        return json.loads(message_data or "{}")
    except Exception as exc:
        logger.warning("Failed to decode Pub/Sub message: %s", exc)
        return {}


def _normalize_hashtags(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        tags = raw
    elif isinstance(raw, str):
        # カンマ区切り/スペース区切り/テキスト中の # を抽出
        if "," in raw:
            tags = [p.strip() for p in raw.split(",")]
        else:
            tags = [p.strip() for p in re.split(r"\s+", raw)]
    else:
        return []

    normalized: List[str] = []
    for t in tags:
        if not t:
            continue
        # 先頭の # を除去し、半角小文字に統一
        t2 = t.strip()
        if t2.startswith("#"):
            t2 = t2[1:]
        if t2:
            normalized.append(t2.lower())
    return normalized


# ======================
# ダウンロード（yt-dlp）
# ======================

def _download_video_to_temp(url: str, video_id: str, proxy: Optional[str] = None) -> str:
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ]

    temp_dir = tempfile.mkdtemp()
    ydl_opts: Dict[str, Any] = {
        'format': 'best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 60,
        'retries': 3,
        'fragment_retries': 3,
        'noprogress': True,
        'no_color': True,
        'ignoreerrors': True,
        'encoding': 'utf-8',
        'http_headers': {
            'User-Agent': random.choice(user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1'
        },
        'outtmpl': os.path.join(temp_dir, f"{video_id}.%(ext)s"),
    }
    # tiktok-video-downloader と同じ: DBの video_download_proxies から is_alive=1 を優先取得
    if proxy is None:
        proxy = _get_active_proxy()
    if proxy:
        ydl_opts['proxy'] = proxy
        logger.info(f"yt-dlpプロキシを設定: {proxy}")

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        logger.info(f"yt-dlpでダウンロード開始: {url}")
        logger.info(f"使用プロキシ: {proxy or 'なし'}")
        info = ydl.extract_info(url, download=False)
        ydl.download([url])

        ext = info.get('ext', 'mp4')
        video_path = os.path.join(temp_dir, f"{video_id}.{ext}")
        if not os.path.exists(video_path):
            files = os.listdir(temp_dir)
            if files:
                video_path = os.path.join(temp_dir, files[0])
            else:
                raise RuntimeError("Downloaded video file not found")

    return video_path


# ========================
# Cloud Storage / DB保存
# ========================

def _upload_to_gcs(local_path: str, video_id: str) -> str:
    project_id = os.getenv("PROJECT_ID")
    bucket_name = os.getenv("CLOUD_STORAGE_BUCKET", "tiktok-videos-storage")
    client = storage.Client(project=project_id)
    bucket = client.bucket(bucket_name)

    _, ext = os.path.splitext(local_path)
    blob_name = f"videos/{video_id}{ext}"
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    return blob.public_url


def _upsert_video_file_path(video_id: str, storage_url: str, user_number: Optional[int]) -> None:
    # 既存なら更新、なければ挿入
    existing = execute_query(
        "SELECT 1 FROM video_transcription WHERE video_id = %s LIMIT 1",
        (video_id,)
    )
    if existing:
        execute_write_query(
            "UPDATE video_transcription SET file_path = %s, user_number = COALESCE(user_number, %s) WHERE video_id = %s",
            (storage_url, user_number, video_id)
        )
    else:
        execute_write_query(
            "INSERT INTO video_transcription (video_id, file_path, transcription, user_number) VALUES (%s, %s, '', %s)",
            (video_id, storage_url, user_number)
        )


def _upsert_influencer_pr_product(product_name: str, product_category: str) -> None:
    """influencer_pr_product にPR商品をUPSERT（product_name一意）"""
    if not product_name:
        return
    execute_write_query(
        """
        INSERT INTO influencer_pr_product (product_name, product_category, is_pr)
        VALUES (%s, %s, 0)
        ON DUPLICATE KEY UPDATE
          product_category = VALUES(product_category)
        """,
        (product_name, product_category)
    )


def _get_video_file_path(video_id: str) -> Optional[str]:
    rows = execute_query(
        "SELECT file_path FROM video_transcription WHERE video_id = %s LIMIT 1",
        (video_id,)
    )
    if rows:
        file_path = (rows[0].get("file_path") or "").strip()
        return file_path or None
    return None


def _get_active_proxy() -> Optional[str]:
    """tiktok-video-downloader と同一のプロキシ取得ロジック"""
    try:
        rows = execute_query(
            "SELECT proxy FROM video_download_proxies WHERE is_alive = 1 ORDER BY id LIMIT 1"
        )
        if rows:
            logger.info(f"データベースからプロキシを取得: {rows[0]['proxy']}")
            return rows[0]['proxy']
        logger.info("利用可能なプロキシがデータベースに見つかりません")
        return None
    except Exception as e:
        logger.warning(f"プロキシ取得エラー: {str(e)}")
        return None

 


def _download_gcs_bytes(storage_url: str) -> bytes:
    """GCSのURL(https:// または gs://)からバイト列を取得"""
    if not storage_url:
        raise RuntimeError("storage_url is empty")

    bucket_name: Optional[str] = None
    blob_name: Optional[str] = None

    if storage_url.startswith("gs://"):
        path = storage_url[5:]
        parts = path.split("/", 1)
        bucket_name = parts[0]
        blob_name = parts[1] if len(parts) > 1 else None
    elif "storage.googleapis.com" in storage_url:
        u = urlparse(storage_url)
        path = u.path.lstrip("/")
        parts = path.split("/", 1)  # bucket / rest
        bucket_name = parts[0] if parts else None
        blob_name = parts[1] if len(parts) > 1 else None
    else:
        raise RuntimeError(f"Unsupported storage_url: {storage_url}")

    if not bucket_name or not blob_name:
        raise RuntimeError(f"Invalid storage_url: {storage_url}")

    client = storage.Client(project=os.getenv("PROJECT_ID"))
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()


# =====================
# Gemini 解析（動画+タグ）
# =====================

def _configure_gemini() -> None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    genai.configure(api_key=api_key)


 


def _analyze_beauty_with_gemini_bytes(video_bytes: bytes, hashtags: List[str]) -> Tuple[str, str]:
    """
    Returns: (product_category, product_name) — 直接バイト列から解析
    """
    _configure_gemini()
    model = genai.GenerativeModel('gemini-2.0-flash')

    hints = ", ".join([f"#{t}" for t in hashtags]) if hashtags else "(なし)"

    prompt = (
        "あなたはTikTok動画に登場する美容商材の判定アシスタントです。\n"
        "以下の制約で回答してください。\n"
        "- 出力はJSONのみ（日本語）、キーは product_category, product_name。\n"
        "- product_category は美容カテゴリ名（例: 化粧水, 美容液, 乳液, 洗顔, メイク, ヘアケア 等）。\n"
        "- product_name はハッシュタグに存在する商品名の中から1つ決定する。特定不能なら '不明'。\n"
        "- 映像内テロップやパッケージ文字、形状、使用シーンから総合的に判断。\n"
        "- 返答は以下のような厳密なJSONのみ: {\"product_category\": \"...\", \"product_name\": \"...\"}"
    )

    response = model.generate_content([
        prompt,
        {"mime_type": "video/mp4", "data": video_bytes}
    ])

    text = (getattr(response, "text", None) or "").strip()
    try:
        json_start = text.find("{")
        json_end = text.rfind("}")
        if json_start != -1 and json_end != -1:
            text = text[json_start:json_end+1]
        parsed = json.loads(text)
        category = (parsed.get("product_category") or "").strip()
        name = (parsed.get("product_name") or "").strip()
        return category, name
    except Exception:
        logger.warning("Gemini応答のJSON解析に失敗したためフォールバックします: %s", text[:200])
        return "", text


# =====================
# Cloud Function entry
# =====================

def determine_beauty_product(event, context):
    """
    Pub/Subメッセージを受け取り、既存GCS動画の再利用または1回のみDL→GCS保存→Gemini解析→DB保存を行う。
    """
    logger.info("==== determine_beauty_product 開始 ====")

    try:
        payload = _decode_pubsub_message(event)
        if not payload:
            logger.error("メッセージが空です")
            return

        url: Optional[str] = payload.get("url")
        video_id: Optional[str] = payload.get("video_id")
        raw_hashtags = payload.get("hashtags")
        user_number: Optional[int] = payload.get("user_number")

        if not url or not video_id:
            logger.error("url と video_id は必須です: payload=%s", payload)
            return

        if "photo" in (url or ""):
            logger.warning("カルーセル（画像）投稿は対象外: %s", url)
            return

        hashtags = _normalize_hashtags(raw_hashtags)

        # 判定済みスキップは行わない（上書き許容）

        # 事前チェック: 既に動画が保存済みならそれを再利用（メモリで取得、ローカル一時ファイルは作らない）
        existing_storage_url = _get_video_file_path(video_id)
        if existing_storage_url:
            logger.info("既存の動画データを再利用: %s", existing_storage_url)
            video_bytes = _download_gcs_bytes(existing_storage_url)
            product_category, product_name = _analyze_beauty_with_gemini_bytes(video_bytes, hashtags)

            _upsert_influencer_pr_product(product_name, product_category)
            logger.info("判定結果を保存(再利用): video_id=%s, category=%s, product=%s", video_id, product_category, product_name)
            return

        # 新規: 1回のみDLして保存・解析
        proxy: Optional[str] = None
        product_category, product_name = "", ""
        video_path = _download_video_to_temp(url, video_id, proxy)
        try:
            storage_url = _upload_to_gcs(video_path, video_id)
            _upsert_video_file_path(video_id, storage_url, user_number)

            # 解析（動画+ハッシュタグ）
            with open(video_path, 'rb') as f:
                video_bytes = f.read()
            product_category, product_name = _analyze_beauty_with_gemini_bytes(video_bytes, hashtags)
        finally:
            try:
                if os.path.exists(video_path):
                    os.remove(video_path)
                    temp_dir = os.path.dirname(video_path)
                    if os.path.exists(temp_dir):
                        os.rmdir(temp_dir)
            except Exception as cleanup_err:
                logger.warning("一時ファイル削除エラー: %s", cleanup_err)

        # DB更新（PR商品マスタ）
        _upsert_influencer_pr_product(product_name, product_category)
        logger.info("判定結果を保存: video_id=%s, category=%s, product=%s", video_id, product_category, product_name)

    except DatabaseError as dbe:
        logger.error("DBエラー: %s", dbe)
        raise
    except Exception as e:
        logger.error("処理エラー: %s", e)
        raise
    finally:
        logger.info("==== determine_beauty_product 終了 ====")


