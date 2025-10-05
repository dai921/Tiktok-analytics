import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import httpx

from src.db.database import execute_update
from urllib.parse import urlsplit, urlunsplit
from .repositories import TikTokRepository, TikTokUserConnection

logger = logging.getLogger(__name__)

VIDEO_LIST_ENDPOINT = "https://open.tiktokapis.com/v2/video/list/"
VIDEO_LIST_FIELDS = [
    "id",
    "create_time",
    "title",
    "cover_image_url",
]

USER_INFO_ENDPOINT = "https://open.tiktokapis.com/v2/user/info/"
USER_INFO_FIELDS = [
    "open_id",
    "display_name",
    "avatar_url",
    "follower_count",
    "likes_count",
    "video_count",
]

VIDEO_QUERY_ENDPOINT = "https://open.tiktokapis.com/v2/video/query/"
VIDEO_QUERY_FIELDS = [
    "id",
    "video_description",
    "view_count",
    "like_count",
    "comment_count",
    "share_count",
]
VIDEO_QUERY_CHUNK_SIZE = 20

TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/"

MAX_FETCH_COUNT = 300
PAGE_SIZE = 20


def _extract_token_payload(token_payload: Dict[str, object]) -> Dict[str, object]:
    if not isinstance(token_payload, dict):
        raise ValueError('TikTok token response is not a dict')

    data = token_payload.get('data')
    if isinstance(data, dict):
        return data

    if all(key in token_payload for key in ("access_token", "refresh_token")):
        return token_payload

    raise ValueError(f"TikTok token response missing expected fields: {token_payload}")


async def _refresh_access_token(connection: TikTokUserConnection, repository: TikTokRepository) -> bool:
    if not connection.tiktok_refresh_token:
        logger.warning('Skipping token refresh: missing refresh token for user_id=%s open_id=%s', connection.user_id, connection.tiktok_open_id)
        return False

    client_key = os.getenv('TT_CLIENT_KEY')
    client_secret = os.getenv('TT_CLIENT_SECRET')
    if not client_key or not client_secret:
        logger.error('TikTok client credentials are not configured. Cannot refresh tokens.')
        return False

    payload = {
        'client_key': client_key,
        'client_secret': client_secret,
        'grant_type': 'refresh_token',
        'refresh_token': connection.tiktok_refresh_token,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                TOKEN_ENDPOINT,
                data=payload,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
            )
            response.raise_for_status()
            token_data = _extract_token_payload(response.json() or {})
    except httpx.HTTPError as exc:
        logger.exception('TikTok refresh_token request failed: user_id=%s open_id=%s error=%s', connection.user_id, connection.tiktok_open_id, exc)
        return False
    except ValueError as exc:
        logger.exception('TikTok refresh_token response malformed: user_id=%s open_id=%s error=%s', connection.user_id, connection.tiktok_open_id, exc)
        return False

    access_token = token_data.get('access_token')
    refresh_token = token_data.get('refresh_token') or connection.tiktok_refresh_token
    expires_in = int(token_data.get('expires_in') or 0)
    expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else datetime.now(timezone.utc)
    expires_at = expires_at_dt.astimezone(timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S')

    updated = TikTokUserConnection(
        id=None,
        user_id=connection.user_id,
        user_number=connection.user_number,
        tiktok_open_id=connection.tiktok_open_id,
        tiktok_access_token=access_token,
        tiktok_refresh_token=refresh_token,
        expires_at=expires_at,
        display_name=connection.display_name,
        linked_at=connection.linked_at,
        account_type=connection.account_type,
        mainly_video_type=connection.mainly_video_type,
    )

    try:
        await repository.save_user_connection(updated)
        await repository.upsert_token_record(connection.user_id, access_token, refresh_token, expires_in, expires_at)
        logger.info('Refreshed TikTok token: user_id=%s open_id=%s', connection.user_id, connection.tiktok_open_id)
        return True
    except Exception as exc:
        logger.exception('Failed to persist refreshed TikTok token: user_id=%s open_id=%s error=%s', connection.user_id, connection.tiktok_open_id, exc)
        return False


async def refresh_tokens(connections: List[TikTokUserConnection], repository: TikTokRepository) -> Dict[str, int]:
    refreshed = 0
    skipped = 0
    for connection in connections:
        success = await _refresh_access_token(connection, repository)
        if success:
            refreshed += 1
        else:
            skipped += 1

    result = {'refreshed': refreshed, 'skipped': skipped, 'total': len(connections)}
    logger.info('TikTok token refresh summary: %s', result)
    return result



async def _fetch_video_page(access_token: str, cursor: Optional[str]) -> Dict:
    headers = {"Authorization": f"Bearer {access_token}"}
    payload: Dict[str, object] = {"max_count": PAGE_SIZE}
    if cursor:
        payload["cursor"] = cursor

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            VIDEO_LIST_ENDPOINT,
            headers=headers,
            params={"fields": ",".join(VIDEO_LIST_FIELDS)},
            json=payload,
        )
        response.raise_for_status()
        return (response.json() or {}).get("data") or {}


async def _fetch_user_profile(access_token: str) -> Optional[Dict]:
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"fields": ",".join(USER_INFO_FIELDS)}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(USER_INFO_ENDPOINT, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json() or {}
    except httpx.HTTPError as exc:
        logger.error("TikTok user.info failed: error=%s", exc)
        if exc.response is not None:
            try:
                logger.error("TikTok user.info response body: %s", exc.response.text)
            except Exception:
                pass
        return None

    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        user_payload = data.get("user")
        if isinstance(user_payload, dict):
            return user_payload
        return data
    return None


def _parse_datetime(value: Optional[object]) -> Optional[datetime]:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(int(value), tz=timezone.utc)
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None



def _upsert_video_metadata(user_number: int, open_id: str, video: Dict) -> Optional[str]:
    """Insert or update basic video metadata."""
    video_id = video.get("id")
    if not video_id:
        return None

    created_at = _parse_datetime(video.get("create_time"))
    caption = video.get("title") or None
    thumbnail_url = video.get("cover_image_url") or None

    execute_update(
        """
        INSERT INTO users_videos (video_id, open_id, user_number, caption, thumbnail_url, created_at)
        VALUES (:video_id, :open_id, :user_number, :caption, :thumbnail_url, :created_at)
        ON DUPLICATE KEY UPDATE
            caption = VALUES(caption),
            thumbnail_url = VALUES(thumbnail_url),
            created_at = VALUES(created_at)
        """,
        {
            "video_id": video_id,
            "open_id": open_id,
            "user_number": user_number,
            "caption": caption,
            "thumbnail_url": thumbnail_url,
            "created_at": created_at.strftime("%Y-%m-%d %H:%M:%S") if created_at else None,
        },
    )

    return video_id


def _upsert_video_stats(video_id: str, stats: Dict[str, object]) -> Dict[str, int]:
    """Insert or update daily metrics for a video."""
    play_cnt = int(stats.get("view_count") or 0)
    like_cnt = int(stats.get("like_count") or 0)
    comment_cnt = int(stats.get("comment_count") or 0)
    share_cnt = int(stats.get("share_count") or 0)
    save_cnt = 0

    collection_date = datetime.now(timezone.utc).date().isoformat()

    execute_update(
        """
        INSERT INTO users_video_daily_metrics_new (
            video_id,
            collection_date,
            play_cnt,
            like_cnt,
            comment_cnt,
            share_cnt,
            save_cnt
        ) VALUES (
            :video_id,
            :collection_date,
            :play_cnt,
            :like_cnt,
            :comment_cnt,
            :share_cnt,
            :save_cnt
        ) ON DUPLICATE KEY UPDATE
            play_cnt = VALUES(play_cnt),
            like_cnt = VALUES(like_cnt),
            comment_cnt = VALUES(comment_cnt),
            share_cnt = VALUES(share_cnt),
            save_cnt = VALUES(save_cnt)
        """,
        {
            "video_id": video_id,
            "collection_date": collection_date,
            "play_cnt": play_cnt,
            "like_cnt": like_cnt,
            "comment_cnt": comment_cnt,
            "share_cnt": share_cnt,
            "save_cnt": save_cnt,
        },
    )

    description = stats.get("video_description")
    if description:
        execute_update(
            "UPDATE users_videos SET caption = :caption WHERE video_id = :video_id",
            {"caption": description, "video_id": video_id},
        )

    return {
        "play_cnt": play_cnt,
        "like_cnt": like_cnt,
        "comment_cnt": comment_cnt,
        "share_cnt": share_cnt,
        "save_cnt": save_cnt,
    }


def _chunked(sequence: List[str], size: int) -> List[List[str]]:
    for idx in range(0, len(sequence), size):
        yield sequence[idx : idx + size]


async def _fetch_video_metrics(access_token: str, video_ids: List[str]) -> Dict[str, Dict[str, object]]:
    if not video_ids:
        return {}

    headers = {"Authorization": f"Bearer {access_token}"}
    fields_param = ",".join(VIDEO_QUERY_FIELDS)
    metrics: Dict[str, Dict[str, object]] = {}

    async with httpx.AsyncClient(timeout=10) as client:
        for chunk in _chunked(video_ids, VIDEO_QUERY_CHUNK_SIZE):
            payload = {"filters": {"video_ids": chunk}}
            try:
                response = await client.post(
                    VIDEO_QUERY_ENDPOINT,
                    headers=headers,
                    params={"fields": fields_param},
                    json=payload,
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.error("TikTok video.query failed: video_ids=%s error=%s", chunk, exc)
                if exc.response is not None:
                    try:
                        logger.error("TikTok video.query response body: %s", exc.response.text)
                    except Exception:
                        pass
                continue

            body = response.json() or {}
            videos = (body.get("data") or {}).get("videos") or []
            for video in videos:
                vid = video.get("id")
                if not vid:
                    continue
                metrics[vid] = video

    return metrics


async def sync_user_videos(connection: TikTokUserConnection, repository: TikTokRepository) -> None:
    if not connection.tiktok_access_token or not connection.tiktok_open_id:
        return

    user_number = connection.user_number
    if not user_number:
        user_number = await repository.get_user_id_mapping(connection.user_id)
        if not user_number:
            logger.warning("TikTok sync skipped: user_number missing user_id=%s", connection.user_id)
            return

    profile = await _fetch_user_profile(connection.tiktok_access_token)
    if profile is None:
        logger.warning("TikTok user.info returned no data: user_id=%s", connection.user_id)
    followers = int((profile or {}).get("follower_count") or 0)
    likes_value = int((profile or {}).get("likes_count") or 0)
    profile_video_count = int((profile or {}).get("video_count") or 0)

    cursor: Optional[str] = None
    fetched = 0
    video_ids: List[str] = []

    while True:
        try:
            data = await _fetch_video_page(connection.tiktok_access_token, cursor)
        except httpx.HTTPError as exc:
            logger.error("TikTok video.list failed: user_id=%s error=%s", connection.user_id, exc)
            if exc.response is not None:
                try:
                    logger.error("TikTok video.list response body: %s", exc.response.text)
                except Exception:
                    pass
            break

        videos: List[Dict] = data.get("videos") or []
        for video in videos:
            video_id = _upsert_video_metadata(user_number, connection.tiktok_open_id, video)
            if not video_id:
                continue
            video_ids.append(video_id)
            fetched += 1

        cursor = data.get("cursor")
        has_more = bool(data.get("has_more"))
        if not has_more or not cursor or fetched >= MAX_FETCH_COUNT:
            break

    metrics_map = await _fetch_video_metrics(connection.tiktok_access_token, video_ids)

    total_play_count = 0
    total_like_count = 0
    for video_id in video_ids:
        totals = _upsert_video_stats(video_id, metrics_map.get(video_id, {}))
        total_play_count += totals.get("play_cnt", 0)
        total_like_count += totals.get("like_cnt", 0)

    videos_count = len(video_ids)
    if profile_video_count > 0 and profile_video_count > videos_count:
        videos_count = profile_video_count

    collection_date = datetime.now(timezone.utc).date().isoformat()
    likes_for_storage = likes_value if likes_value > 0 else total_like_count

    try:
        await repository.upsert_account_daily_metrics(
            user_number=user_number,
            open_id=connection.tiktok_open_id,
            collection_date=collection_date,
            followers=followers,
            likes=likes_for_storage,
            videos_count=videos_count,
            total_play_count=total_play_count,
        )
    except Exception as exc:
        logger.error("TikTok account metrics upsert failed: user_id=%s error=%s", connection.user_id, exc)

    logger.info(
        "TikTok sync summary: user_id=%s videos=%s followers=%s likes=%s plays=%s",
        connection.user_id,
        fetched,
        followers,
        likes_for_storage,
        total_play_count,
    )
async def run_initial_sync(user_id: str) -> None:
    repository = TikTokRepository()
    connection = await repository.get_user_connection(user_id)
    if not connection:
        logger.warning("TikTok initial sync skipped: connection missing user_id=%s", user_id)
        return

    try:
        await sync_user_videos(connection, repository)
        logger.info("TikTok initial sync completed: user_id=%s", user_id)
    except Exception as exc:
        logger.error("TikTok initial sync failed: user_id=%s error=%s", user_id, exc)


def schedule_initial_sync(user_id: str) -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(run_initial_sync(user_id))
    except RuntimeError:
        asyncio.run(run_initial_sync(user_id))










