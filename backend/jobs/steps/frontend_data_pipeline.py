import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, Optional

from backend.jobs.core.db_utils import execute_query, execute_write_query, DatabaseError
from backend.jobs.core.config import initialize_config

logger = logging.getLogger(__name__)

initialize_config()

DATE_FORMAT = "%Y-%m-%d"
MIN_DATE = date(2023, 12, 1)


@dataclass(frozen=True)
class FrontendSyncConfig:
    """フロントエンド系テーブル同期処理で利用する設定値をまとめたデータクラス。"""

    name: str
    processor_name: str
    target_table: str
    parent_account_type: Optional[str] = None
    requires_increment_reset: bool = False
    default_batch_size: int = 10000


def run_frontend_data_pipeline(collection_date: Optional[str] = None) -> None:
    """
    frontend_data系の全テーブル（通常・アフィ・企業・インフルエンサー）をまとめて同期する。
    それぞれ独立したカーソルを持ち、対象レコードがなくなるまで処理を続行する。
    """
    target_date = _normalize_collection_date(collection_date)
    tasks = [
        FrontendSyncConfig(
            name="frontend_data",
            processor_name="frontend_data_update",
            target_table="frontend_data",
            requires_increment_reset=True,
        ),
        FrontendSyncConfig(
            name="frontend_affiliate_data",
            processor_name="frontend_affiliate_data_update",
            target_table="frontend_affiliate_data",
            parent_account_type="アフィ",
        ),
        FrontendSyncConfig(
            name="frontend_corporate_data",
            processor_name="frontend_corporate_data_update",
            target_table="frontend_corporate_data",
            parent_account_type="企業アカウント",
        ),
        FrontendSyncConfig(
            name="frontend_influencer_data",
            processor_name="frontend_influencer_data_update",
            target_table="frontend_influencer_data",
            parent_account_type="インフルエンサー",
        ),
    ]

    for task in tasks:
        logger.info("==== %s sync started (collection_date=%s) ====", task.name, target_date)
        while True:
            result = _sync_frontend_dataset(task, target_date)
            if result["is_complete"]:
                logger.info(
                    "==== %s sync finished: batches=%s, processed=%s, remaining=%s ====",
                    task.name,
                    result["batch_number"],
                    result["updated_count"],
                    result["remaining_count"],
                )
                break


def _normalize_collection_date(collection_date: Optional[str]) -> date:
    if collection_date:
        return datetime.strptime(collection_date, DATE_FORMAT).date()

    jst = timezone(timedelta(hours=9))
    return (datetime.now(jst) - timedelta(days=2)).date()


def _sync_frontend_dataset(config: FrontendSyncConfig, collection_date: date) -> Dict[str, Any]:
    """与えられた設定に従い、対象テーブルの1バッチ分を抽出・同期する。"""
    try:
        cursor_info = get_or_initialize_cursor(
            config.processor_name,
            config.target_table,
            config.default_batch_size,
        )
        last_cursor_id = cursor_info["last_cursor_id"]
        batch_size = cursor_info["batch_size"]
        batch_number = cursor_info["batch_number"]

        logger.info(
            "%s cursor: processor=%s target=%s last_id=%s batch_size=%s batch_number=%s",
            config.name,
            cursor_info["processor_name"],
            cursor_info["target_table"],
            last_cursor_id,
            batch_size,
            batch_number,
        )

        if config.requires_increment_reset and batch_number == 1:
            _reset_increment_metrics(collection_date)

        select_query = f"""
        SELECT 
            vm.id,
            vm.url,
            vm.video_id,
            vm.cover_image_url AS thumbnail_url,
            vm.created_at,
            vm.play_count,
            vm.playCountIncrease AS play_count_increase,
            vm.username AS account_name,
            vm.likes_count,
            vm.comment_count,
            COALESCE(vm.hashtags, '') AS hashtags,
            vm.music_title AS music_info,
            vm.description AS caption,
            vm.category,
            vm.product,
            vm.content_type,
            vm.status,
            vm.display_name,
            vm.save_count,
            vm.likesCountIncrease,
            vm.commentCountIncrease,
            vm.saveCountIncrease,
            vm.account_type,
            vm.parent_account_type
        FROM 
            video_master vm
        LEFT JOIN {config.target_table} fd ON vm.id = fd.id
        WHERE 
            vm.status != 'deleted'
            AND vm.created_at IS NOT NULL
            AND vm.front_needs_update = 1
            AND vm.play_count IS NOT NULL
            AND vm.play_needs_update = 1
            AND vm.account_type IS NOT NULL
            AND vm.cover_image_url IS NOT NULL
            AND vm.is_delay = 0
            AND vm.created_at >= %(min_date)s
            AND vm.created_at <= %(max_date)s
            AND vm.id > %(last_id)s
        """

        if config.parent_account_type:
            select_query += " AND vm.parent_account_type = %(parent_account_type)s"

        select_query += """
        ORDER BY 
            vm.id
        LIMIT %(batch_size)s
        """

        query_params: Dict[str, Any] = {
            "min_date": MIN_DATE,
            "max_date": collection_date,
            "last_id": last_cursor_id,
            "batch_size": batch_size,
        }

        if config.parent_account_type:
            query_params["parent_account_type"] = config.parent_account_type

        batch_rows = execute_query(select_query, query_params)
        max_id = batch_rows[-1]["id"] if batch_rows else last_cursor_id

        count_query = f"""
        SELECT 
            COUNT(*) AS remaining_count
        FROM 
            video_master vm
        LEFT JOIN {config.target_table} fd ON vm.id = fd.id
        WHERE 
            vm.status != 'deleted'
            AND vm.created_at IS NOT NULL
            AND vm.created_at >= %(min_date)s
            AND vm.created_at <= %(max_date)s
            AND vm.id > %(max_id)s
        """

        count_params: Dict[str, Any] = {
            "min_date": MIN_DATE,
            "max_date": collection_date,
            "max_id": max_id,
        }

        if config.parent_account_type:
            count_query += " AND vm.parent_account_type = %(parent_account_type)s"
            count_params["parent_account_type"] = config.parent_account_type

        remaining_data = execute_query(count_query, count_params)
        remaining_count = remaining_data[0]["remaining_count"] if remaining_data else 0
        fetched_rows = len(batch_rows)

        logger.info(
            "%s batch #%s fetched=%s remaining=%s",
            config.name,
            batch_number,
            fetched_rows,
            remaining_count,
        )

        if not batch_rows:
            reset_cursor(config.processor_name, config.target_table)
            return {
                "status": "success",
                "batch_number": batch_number,
                "updated_count": 0,
                "batch_size": batch_size,
                "remaining_count": remaining_count,
                "is_complete": True,
                "execution_time": datetime.now().isoformat(),
            }

        updated_count = 0
        batch_start_time = datetime.now()

        insert_query = f"""
        INSERT INTO {config.target_table} (
            id, url, video_id, thumbnail_url, created_at, play_count, 
            play_count_increase, account_name, likes_count, comment_count, 
            hashtags, music_info, caption, category, display_name,
            content_type, product, save_count, likes_count_increase, 
            comment_count_increase, save_count_increase, account_type, 
            parent_account_type
        ) VALUES (
            %(id)s, %(url)s, %(video_id)s, %(thumbnail_url)s, %(created_at)s, %(play_count)s, 
            %(play_count_increase)s, %(account_name)s, %(likes_count)s, %(comment_count)s, 
            %(hashtags)s, %(music_info)s, %(caption)s, %(category)s, %(display_name)s,
            %(content_type)s, %(product)s, %(save_count)s, %(likesCountIncrease)s, 
            %(commentCountIncrease)s, %(saveCountIncrease)s, %(account_type)s, 
            %(parent_account_type)s
        )
        ON DUPLICATE KEY UPDATE
            id = VALUES(id),
            url = VALUES(url),
            video_id = VALUES(video_id),
            thumbnail_url = VALUES(thumbnail_url),
            created_at = VALUES(created_at),
            play_count = VALUES(play_count),
            play_count_increase = VALUES(play_count_increase),
            account_name = VALUES(account_name),
            likes_count = VALUES(likes_count),
            comment_count = VALUES(comment_count),
            hashtags = VALUES(hashtags),
            music_info = VALUES(music_info),
            caption = VALUES(caption),
            category = VALUES(category),
            display_name = VALUES(display_name),
            content_type = VALUES(content_type),
            product = VALUES(product),
            save_count = VALUES(save_count),
            likes_count_increase = VALUES(likes_count_increase),
            comment_count_increase = VALUES(comment_count_increase),
            save_count_increase = VALUES(save_count_increase),
            account_type = VALUES(account_type),
            parent_account_type = VALUES(parent_account_type)
        """

        for row in batch_rows:
            try:
                hashtags = row["hashtags"] or ""
                if hashtags and hashtags != "[]":
                    hashtags = ",".join(
                        tag.strip() for tag in hashtags.split(",") if tag.strip()
                    )

                created_at = row["created_at"]
                if created_at is None:
                    continue

                if isinstance(created_at, str):
                    try:
                        created_at = datetime.strptime(created_at, DATE_FORMAT).strftime(DATE_FORMAT)
                    except ValueError:
                        continue

                params = {
                    "id": row["id"],
                    "url": row["url"],
                    "video_id": row["video_id"],
                    "thumbnail_url": row["thumbnail_url"],
                    "created_at": created_at,
                    "play_count": row["play_count"],
                    "play_count_increase": row["play_count_increase"],
                    "account_name": row["account_name"],
                    "likes_count": row["likes_count"],
                    "comment_count": row["comment_count"],
                    "hashtags": hashtags,
                    "music_info": row["music_info"],
                    "caption": row["caption"],
                    "category": row["category"],
                    "display_name": row["display_name"],
                    "content_type": row["content_type"],
                    "product": row["product"],
                    "save_count": row["save_count"],
                    "likesCountIncrease": row["likesCountIncrease"],
                    "commentCountIncrease": row["commentCountIncrease"],
                    "saveCountIncrease": row["saveCountIncrease"],
                    "account_type": row["account_type"],
                    "parent_account_type": row["parent_account_type"],
                }

                execute_write_query(insert_query, params)
                updated_count += 1
            except DatabaseError as exc:
                logger.error(
                    "%s update error (id=%s): %s", config.name, row.get("id"), exc
                )
                continue

        update_cursor(config.processor_name, config.target_table, max_id, batch_number + 1)

        batch_execution_time = (datetime.now() - batch_start_time).total_seconds()
        logger.info(
            "%s batch #%s finished: %s/%s rows in %ss",
            config.name,
            batch_number,
            updated_count,
            fetched_rows,
            batch_execution_time,
        )

        is_complete = remaining_count == 0
        if is_complete:
            reset_cursor(config.processor_name, config.target_table)

        return {
            "status": "success",
            "batch_number": batch_number,
            "updated_count": updated_count,
            "batch_size": batch_size,
            "remaining_count": remaining_count,
            "is_complete": is_complete,
            "execution_time": datetime.now().isoformat(),
        }

    except Exception as exc:
        logger.exception("%s sync failed: %s", config.name, exc)
        raise


def _reset_increment_metrics(collection_date: date) -> None:
    """
    frontend_data本体の初回バッチ実行時に増分カラムをリセットする。
    collection_dateから逆算して、従来ロジックと同じ期間条件で更新する。
    """
    run_date = collection_date + timedelta(days=2)
    two_weeks_threshold = run_date - timedelta(days=14)
    three_days_threshold = run_date - timedelta(days=3)
    recent_window_threshold = run_date - timedelta(days=3)
    target_date = run_date - timedelta(days=2)

    logger.info("Resetting stale increment metrics (older_than=%s)", two_weeks_threshold)
    reset_query = """
    UPDATE video_master
    SET playCountIncrease = 0,
        likesCountIncrease = 0,
        commentCountIncrease = 0,
        saveCountIncrease = 0
    WHERE created_at < %(older_than)s
      AND playCountIncrease < 1000
      AND play_count < 100000
    """
    execute_write_query(reset_query, {"older_than": two_weeks_threshold})

    logger.info("Clearing increment metrics where play_count matches (older_than=%s)", three_days_threshold)
    null_reset_query = """
    UPDATE video_master
    SET playCountIncrease = 0,
        likesCountIncrease = 0,
        commentCountIncrease = 0,
        saveCountIncrease = 0
    WHERE created_at < %(older_than)s
      AND playCountIncrease = play_count
      AND is_new_video = 1
    """
    execute_write_query(null_reset_query, {"older_than": three_days_threshold})

    logger.info(
        "Aligning increment metrics for recent videos (created_at >= %s)", target_date
    )
    sync_query = """
    UPDATE video_master
    SET playCountIncrease = play_count,
        likesCountIncrease = likes_count,
        commentCountIncrease = comment_count,
        saveCountIncrease = save_count
    WHERE created_at >= %(recent_threshold)s
      AND playCountIncrease != play_count
    """
    execute_write_query(sync_query, {"recent_threshold": recent_window_threshold})


def get_or_initialize_cursor(
    processor_name: str, target_table: str, default_batch_size: int = 10000
) -> Dict[str, Any]:
    """カーソル情報を取得し、存在しなければ新規作成する。"""
    query = """
    SELECT id, processor_name, target_table, last_cursor_id,
           batch_size, batch_number, updated_at
    FROM processing_cursors
    WHERE processor_name = %s AND target_table = %s
    """

    result = execute_query(query, (processor_name, target_table))
    if result:
        return result[0]

    insert_query = """
    INSERT INTO processing_cursors
    (processor_name, target_table, last_cursor_id, batch_size, reset_interval, batch_number, created_at, updated_at)
    VALUES (%s, %s, 0, %s, 172800, 1, NOW(), NOW())
    """
    execute_write_query(insert_query, (processor_name, target_table, default_batch_size))

    return execute_query(query, (processor_name, target_table))[0]


def update_cursor(processor_name: str, target_table: str, last_cursor_id: int, batch_number: int) -> None:
    """直近で処理したIDとバッチ番号でカーソル情報を更新する。"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = %s, batch_number = %s, updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    execute_write_query(query, (last_cursor_id, batch_number, processor_name, target_table))


def reset_cursor(processor_name: str, target_table: str) -> None:
    """次回フル実行に備えてカーソル情報を初期状態に戻す。"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = 0, batch_number = 1, last_reset_time = NOW(), updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    execute_write_query(query, (processor_name, target_table))
