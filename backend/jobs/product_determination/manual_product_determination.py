import argparse
import base64
import importlib.util
import json
import logging
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
import random
import time

logger = logging.getLogger(__name__)

SENSITIVE_STATUS = "skip_sensitive"
PROCESSOR_NAME = "manual_product_determination"
TARGET_TABLE = "video_master"
DEFAULT_BATCH_SIZE = 1000
DEFAULT_CURSOR_RESET_INTERVAL = 86400

def _resolve_module_dir() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "backend" / "functions" / "flask-service" / "product-determination"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Unable to locate product determination sources starting from {current}"
    )


_MODULE_DIR = _resolve_module_dir()


def _ensure_module_dir() -> None:
    """Ensure the product determination module directory exists and is importable."""
    if not _MODULE_DIR.exists():
        raise FileNotFoundError(
            f"Product determination sources not found: {_MODULE_DIR}"
        )
    module_dir = str(_MODULE_DIR)
    if module_dir not in sys.path:
        sys.path.insert(0, module_dir)


@lru_cache(maxsize=1)
def _initialize_environment():
    """Load config module and initialize environment once."""
    _ensure_module_dir()
    config_module = _load_module(
        "config.py", "product_determination_config", canonical_name="config"
    )
    initialize_config = getattr(config_module, "initialize_config", None)
    if callable(initialize_config):
        try:
            initialize_config()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to initialize product determination config: %s", exc)
            raise
    return config_module


@lru_cache(maxsize=1)
def _get_db_module():
    """Return the db_utils module from the Cloud Function sources."""
    _initialize_environment()
    return _load_module(
        "db_utils.py", "product_determination_db_utils", canonical_name="db_utils"
    )


def _load_module(filename: str, unique_name: str, canonical_name: Optional[str] = None):
    """
    Load a module from the product determination sources.

    Args:
        filename: Target filename within the module directory.
        unique_name: Unique name for sys.modules registration.
        canonical_name: Optional canonical name used by the original code.

    Returns:
        Loaded module instance.
    """
    if canonical_name and canonical_name in sys.modules:
        return sys.modules[canonical_name]
    if unique_name in sys.modules:
        return sys.modules[unique_name]

    module_path = _MODULE_DIR / filename
    spec = importlib.util.spec_from_file_location(unique_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load module {filename} from {module_path}")

    module = importlib.util.module_from_spec(spec)
    if canonical_name:
        sys.modules[canonical_name] = module
    sys.modules[unique_name] = module
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=1)
def _get_determine_handler():
    """Load and return the determine_beauty_product handler from the Cloud Function code."""
    _initialize_environment()
    _get_db_module()
    main_module = _load_module("main.py", "product_determination_main")

    handler = getattr(main_module, "determine_beauty_product", None)
    if not callable(handler):
        raise AttributeError("determine_beauty_product handler could not be loaded")
    return handler


def _encode_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a fake Pub/Sub event for the Cloud Function handler."""
    message = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    return {"data": message.decode("utf-8")}


def _parse_hashtags(raw: Optional[str]) -> Optional[List[str]]:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            tokens = [str(item).strip() for item in parsed if str(item).strip()]
            cleaned = [token.lstrip("#") for token in tokens if token]
            return cleaned or None
    except (json.JSONDecodeError, TypeError):
        pass
    tokens = [token.strip() for token in re.split(r"[,\s]+", raw) if token.strip()]
    cleaned = [token.lstrip("#") for token in tokens if token]
    return cleaned or None


def _normalize_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize CLI/file payload to match Cloud Function expectations."""
    if not isinstance(item, dict):
        raise ValueError("Each payload must be a JSON object.")
    if "url" not in item or "video_id" not in item:
        raise ValueError("Payload must include both 'url' and 'video_id'")

    normalized: Dict[str, Any] = {
        "url": item["url"],
        "video_id": item["video_id"],
    }

    if "hashtags" in item and item["hashtags"] is not None:
        hashtags = item["hashtags"]
        if isinstance(hashtags, str):
            parsed = _parse_hashtags(hashtags)
            if parsed:
                normalized["hashtags"] = parsed
        elif isinstance(hashtags, Iterable):
            normalized["hashtags"] = [
                str(tag).lstrip("#").strip()
                for tag in hashtags
                if str(tag).strip()
            ]
    extra_keys = {"url", "video_id", "hashtags"}
    for key, value in item.items():
        if key not in extra_keys:
            normalized[key] = value
    return normalized


def _has_pr_hashtag(hashtags: Iterable[str]) -> bool:
    for tag in hashtags:
        if not tag:
            continue
        normalized_parts = [
            part for part in re.split(r"[^a-z0-9]+", tag.lower()) if part
        ]
        if "pr" in normalized_parts:
            return True
    return False


def _get_db_functions() -> Tuple[Any, Any]:
    db_module = _get_db_module()
    execute_query = getattr(db_module, "execute_query", None)
    execute_write_query = getattr(db_module, "execute_write_query", None)
    if not callable(execute_query):
        raise AttributeError("execute_query not available in db_utils module")
    if not callable(execute_write_query):
        raise AttributeError("execute_write_query not available in db_utils module")
    return execute_query, execute_write_query


def _get_or_create_processing_cursor() -> Dict[str, Any]:
    execute_query, execute_write_query = _get_db_functions()
    select_sql = """
        SELECT id, last_cursor_id, batch_size, batch_number
        FROM processing_cursors
        WHERE processor_name = %s AND target_table = %s
        LIMIT 1
    """
    params = (PROCESSOR_NAME, TARGET_TABLE)
    rows = execute_query(select_sql, params)
    if rows:
        cursor_row = rows[0]
        stored_size = cursor_row.get("batch_size")
        if stored_size != DEFAULT_BATCH_SIZE:
            execute_write_query(
                """
                UPDATE processing_cursors
                SET batch_size = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (DEFAULT_BATCH_SIZE, cursor_row.get("id")),
            )
            cursor_row["batch_size"] = DEFAULT_BATCH_SIZE
        return cursor_row

    insert_sql = """
        INSERT INTO processing_cursors
        (processor_name, target_table, last_cursor_id, batch_size, batch_number, reset_interval)
        VALUES (%s, %s, 0, %s, 1, %s)
    """
    execute_write_query(
        insert_sql,
        (PROCESSOR_NAME, TARGET_TABLE, DEFAULT_BATCH_SIZE, DEFAULT_CURSOR_RESET_INTERVAL),
    )
    rows = execute_query(select_sql, params)
    if rows:
        return rows[0]
    raise RuntimeError("Failed to initialize processing cursor record.")


def _update_processing_cursor(last_cursor_id: int, batch_number: int) -> None:
    _, execute_write_query = _get_db_functions()
    update_sql = """
        UPDATE processing_cursors
        SET last_cursor_id = %s,
            batch_number = %s,
            updated_at = NOW()
        WHERE processor_name = %s AND target_table = %s
    """
    execute_write_query(
        update_sql,
        (last_cursor_id, batch_number, PROCESSOR_NAME, TARGET_TABLE),
    )


def _determine_payloads_from_db(
    limit: Optional[int] = None,
    include_processed: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch target videos from video_master using the processing cursor."""
    execute_query, _ = _get_db_functions()
    cursor_state = _get_or_create_processing_cursor()
    last_cursor_id = int(cursor_state.get("last_cursor_id") or 0)
    batch_number = int(cursor_state.get("batch_number") or 1)

    target_batch_size = DEFAULT_BATCH_SIZE
    stored_batch_size = cursor_state.get("batch_size")
    if isinstance(stored_batch_size, int) and stored_batch_size > 0:
        target_batch_size = min(stored_batch_size, DEFAULT_BATCH_SIZE)
    if limit is not None:
        target_batch_size = min(limit, DEFAULT_BATCH_SIZE)

    query = [
        "SELECT",
        "  id,",
        "  video_id,",
        "  url,",
        "  hashtags,",
        "  product",
        "FROM video_master",
        "WHERE parent_account_type = %s",
        "  AND account_type = %s",
        "  AND id > %s",
        "  AND video_id IS NOT NULL",
        "  AND url IS NOT NULL",
        "  AND hashtags IS NOT NULL",
        "  AND hashtags <> ''",
        "  AND (status IS NULL OR status <> %s)",
    ]
    params: List[Any] = ["インフルエンサー", "美容", last_cursor_id, SENSITIVE_STATUS]

    if not include_processed:
        query.append("  AND (product IS NULL OR product = '')")

    query.append("ORDER BY id ASC")
    query.append("LIMIT %s")
    params.append(target_batch_size)

    sql = "\n".join(query)
    logger.info(
        "Fetching candidate videos from video_master (cursor_id>%s, batch_size=%s)",
        last_cursor_id,
        target_batch_size,
    )
    rows = execute_query(sql, tuple(params))

    if not rows:
        logger.info("No new rows found after cursor_id=%s.", last_cursor_id)
        return []

    payloads: List[Dict[str, Any]] = []
    last_processed_id = last_cursor_id
    for row in rows:
        row_id_raw = row.get("id")
        try:
            row_id = int(row_id_raw)
        except (TypeError, ValueError):
            row_id = last_processed_id
        last_processed_id = max(last_processed_id, row_id)
        raw_hashtags = row.get("hashtags") or ""
        parsed_hashtags = _parse_hashtags(str(raw_hashtags))
        if not parsed_hashtags:
            continue
        if not _has_pr_hashtag(parsed_hashtags):
            continue
        payload: Dict[str, Any] = {
            "url": row.get("url"),
            "video_id": str(row.get("video_id")),
            "hashtags": parsed_hashtags,
        }
        try:
            normalized = _normalize_payload(payload)
        except ValueError as exc:
            logger.warning(
                "Skipping video due to invalid payload (video_id=%s): %s",
                row.get("video_id"),
                exc,
            )
            continue
        payloads.append(normalized)

    _update_processing_cursor(last_processed_id, batch_number + 1)
    logger.info(
        "Advanced processing cursor to id=%s (next batch_number=%s)",
        last_processed_id,
        batch_number + 1,
    )
    logger.info("Fetched %s candidate videos after filtering hashtags", len(payloads))
    return payloads


def _load_payloads_from_file(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return [_normalize_payload(data)]
    if isinstance(data, list):
        return [_normalize_payload(item) for item in data]
    raise ValueError("Payload file must contain a JSON object or array of objects")


def _load_payloads_from_json(raw_json: str) -> List[Dict[str, Any]]:
    data = json.loads(raw_json)
    if isinstance(data, dict):
        return [_normalize_payload(data)]
    if isinstance(data, list):
        return [_normalize_payload(item) for item in data]
    raise ValueError("Payload JSON must be an object or array of objects")


def _build_single_payload(args: argparse.Namespace) -> Dict[str, Any]:
    if not args.video_url or not args.video_id:
        raise ValueError("--video-url and --video-id are required for single payload mode")

    payload: Dict[str, Any] = {"url": args.video_url, "video_id": args.video_id}
    hashtags = _parse_hashtags(args.hashtags)
    if hashtags:
        payload["hashtags"] = hashtags
    return _normalize_payload(payload)


def run(payloads: List[Dict[str, Any]]) -> None:
    handler = _get_determine_handler()

    for payload in payloads:
        event = _encode_event(payload)
        video_id = payload.get("video_id")
        url = payload.get("url")
        logger.info("Processing manual product determination: video_id=%s url=%s", video_id, url)
        try:
            handler(event, None)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Product determination failed: video_id=%s url=%s error=%s",
                video_id,
                url,
                exc,
            )
            raise
        else:
            delay = random.uniform(5, 10)
            logger.info("Waiting %.2f seconds before processing next video", delay)
            time.sleep(delay)


def main(argv: Optional[List[str]] = None) -> None:
    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(
        description="Manual product determination Cloud Run Job entrypoint."
    )
    parser.add_argument("--payload-file", type=Path, help="Path to JSON payload (object or array).")
    parser.add_argument("--payload-json", help="JSON string payload (object or array).")
    parser.add_argument("--video-url", help="Video URL for single run.")
    parser.add_argument("--video-id", help="Video ID for single run.")
    parser.add_argument(
        "--hashtags",
        help="Comma or space separated hashtags for single run (e.g. '#pr,#skincare').",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Maximum number of records to examine from video_master per run (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--include-processed",
        action="store_true",
        help="Include rows that already have product assigned in video_master.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only display matched video IDs without invoking the handler.",
    )

    args = parser.parse_args(argv)

    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be a positive integer.")
    effective_limit = args.limit
    if effective_limit is not None and effective_limit > DEFAULT_BATCH_SIZE:
        logger.warning(
            "limit %s exceeds the enforced maximum of %s; clamping to %s.",
            effective_limit,
            DEFAULT_BATCH_SIZE,
            DEFAULT_BATCH_SIZE,
        )
        effective_limit = DEFAULT_BATCH_SIZE

    manual_mode = bool(
        args.payload_file or args.payload_json or args.video_url or args.video_id
    )

    payloads: List[Dict[str, Any]]
    if manual_mode:
        if args.payload_file:
            if args.payload_json or args.video_url or args.video_id:
                parser.error("Do not combine --payload-file with other payload options.")
            payloads = _load_payloads_from_file(args.payload_file)
        elif args.payload_json:
            if args.video_url or args.video_id:
                parser.error("Do not combine --payload-json with single payload options.")
            payloads = _load_payloads_from_json(args.payload_json)
        else:
            payloads = [_build_single_payload(args)]
    else:
        payloads = _determine_payloads_from_db(
            limit=effective_limit,
            include_processed=args.include_processed,
        )

    if not payloads:
        logger.info("No target videos found.")
        return

    if args.dry_run:
        logger.info("Dry run requested. Listing %s videos without processing.", len(payloads))
        for payload in payloads:
            hashtags = payload.get("hashtags") or []
            if isinstance(hashtags, list):
                hashtags_str = ",".join(str(tag) for tag in hashtags)
            else:
                hashtags_str = str(hashtags)
            print(f"{payload.get('video_id')} | {payload.get('url')} | hashtags={hashtags_str}")
        return

    run(payloads)


if __name__ == "__main__":
    main()
