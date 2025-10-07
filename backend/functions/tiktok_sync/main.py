import asyncio
import base64
import json
import logging
import os
import sys
from pathlib import Path
import pymysql
from typing import Any, Dict, List, Optional, Set

# Ensure backend/api modules are importable both locally and in Cloud Functions
CURRENT_DIR = Path(__file__).resolve().parent
CANDIDATE_ROOTS = [
    CURRENT_DIR,
    CURRENT_DIR.parent,
    CURRENT_DIR.parent.parent,
]
API_SRC = None
for root in CANDIDATE_ROOTS:
    candidate = root / 'backend' / 'api' / 'src'
    if candidate.exists():
        API_SRC = candidate
        break
if API_SRC is None:
    # Fallback: allow packaging that copies API sources next to main.py
    candidate = CURRENT_DIR / 'backend_api'
    if candidate.exists():
        API_SRC = candidate
if API_SRC is None:
    raise RuntimeError('Unable to locate backend/api/src directory for TikTok sync function')
if str(API_SRC) not in sys.path:
    sys.path.append(str(API_SRC))
    sys.path.append(str(API_SRC))

pymysql.install_as_MySQLdb()

from src.my_report.repositories import TikTokRepository, TikTokUserConnection  # noqa: E402
from src.my_report.tiktok_sync import refresh_tokens, sync_user_videos  # noqa: E402


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)


def _decode_pubsub_message(event: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Decode Pub/Sub event payload into a dictionary."""
    if not event:
        return {}

    data = event.get("data")
    if not data:
        return {}

    try:
        decoded = base64.b64decode(data).decode("utf-8")
        return json.loads(decoded) if decoded else {}
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Failed to decode Pub/Sub message: %s", exc)
        return {}


def _normalise_sequence(value: Any) -> List[str]:
    """Normalise user-supplied value into a list of strings."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set, frozenset)):
        return [str(item) for item in value]
    return [str(value)]


async def _collect_target_connections(
    repository: TikTokRepository,
    payload: Dict[str, Any],
) -> List[TikTokUserConnection]:
    """Determine which connections should be synchronised."""
    user_ids = _normalise_sequence(payload.get("user_ids") or payload.get("user_id"))
    open_ids = _normalise_sequence(payload.get("open_ids") or payload.get("open_id"))
    open_id_filter: Optional[Set[str]] = set(open_ids) if open_ids else None

    connections: List[TikTokUserConnection] = []

    if user_ids:
        logger.info('Filtering TikTok connections by user_ids=%s open_ids=%s', user_ids, list(open_id_filter) if open_id_filter else None)
        for user_id in user_ids:
            try:
                user_connections = await repository.list_user_connections(user_id)
            except Exception as exc:
                logger.exception("Failed to load connections for user_id=%s: %s", user_id, exc)
                continue

            if open_id_filter:
                user_connections = [
                    conn for conn in user_connections if conn.tiktok_open_id in open_id_filter
                ]
            connections.extend(user_connections)
    else:
        try:
            connections = await repository.list_all_connections()
        except Exception as exc:
            logger.exception("Failed to load all TikTok connections: %s", exc)
            return []
        if open_id_filter:
            connections = [conn for conn in connections if conn.tiktok_open_id in open_id_filter]

    # Deduplicate by (user_id, open_id)
    deduped: Dict[tuple, TikTokUserConnection] = {}
    for conn in connections:
        key = (conn.user_id, conn.tiktok_open_id)
        deduped[key] = conn

    resolved = list(deduped.values())
    logger.info('Collected %s TikTok connections', len(resolved))
    return resolved


async def _run_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    repository = TikTokRepository()
    connections = await _collect_target_connections(repository, payload)

    if not connections:
        logger.info("No TikTok connections resolved for payload: %s", payload)
        return {"synced": 0, "skipped": 0, "total": 0}

    dry_run = bool(payload.get("dry_run"))
    synced = 0
    skipped = 0

    for connection in connections:
        if not connection.tiktok_access_token:
            logger.warning(
                "Skipping TikTok sync (missing access token): user_id=%s open_id=%s",
                connection.user_id,
                connection.tiktok_open_id,
            )
            skipped += 1
            continue

        if dry_run:
            logger.info(
                "[DRY-RUN] Would sync TikTok account user_id=%s open_id=%s",
                connection.user_id,
                connection.tiktok_open_id,
            )
            continue

        try:
            await sync_user_videos(connection, repository)
            synced += 1
        except Exception as exc:
            skipped += 1
            logger.exception(
                "TikTok sync failed: user_id=%s open_id=%s error=%s",
                connection.user_id,
                connection.tiktok_open_id,
                exc,
            )

    result = {
        "synced": synced,
        "skipped": skipped,
        "total": len(connections),
        "dry_run": dry_run,
    }
    logger.info("TikTok sync result: %s", result)
    return result


async def _run_token_refresh(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Refresh TikTok access tokens for resolved connections."""
    repository = TikTokRepository()
    connections = await _collect_target_connections(repository, payload)

    dry_run = bool(payload.get("dry_run"))

    if not connections:
        logger.info("No TikTok connections resolved for token refresh. payload=%s", payload)
        return {"refreshed": 0, "skipped": 0, "total": 0, "dry_run": dry_run}

    if dry_run:
        logger.info("[DRY-RUN] Would refresh tokens for %s TikTok connections", len(connections))
        return {"refreshed": 0, "skipped": len(connections), "total": len(connections), "dry_run": True}

    try:
        result = await refresh_tokens(connections, repository)
    except Exception as exc:
        logger.exception("TikTok token refresh batch failed: payload=%s error=%s", payload, exc)
        raise

    result = dict(result)
    result.setdefault("total", len(connections))
    result["dry_run"] = False
    return result


def sync_tiktok_accounts(event: Optional[Dict[str, Any]], context: Any) -> None:
    """Pub/Sub entry point for the daily TikTok data synchronisation."""
    payload = _decode_pubsub_message(event)
    if not payload and isinstance(event, dict):
        # Allow manual invocation by passing a direct payload field.
        payload = event.get("payload", {}) or {}

    logger.info('TikTok sync triggered. payload=%s', payload)
    mode = (payload.get('mode') or 'sync').lower()
    if mode == 'token_refresh':
        asyncio.run(_run_token_refresh(payload))
    else:
        asyncio.run(_run_sync(payload))

