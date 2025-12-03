from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.auth.models import User
from src.auth.router import get_current_user
from src.db.database import MYSQL_DATABASE, execute_query


router = APIRouter(
    prefix="/api/admin/usage",
    tags=["admin_usage"],
)


def _ensure_admin(user: User) -> None:
    if not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理者のみ利用できます",
        )


def _to_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _iso_jst(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return (dt + timedelta(hours=9)).isoformat()


def _mask_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    text = str(token)
    if len(text) <= 8:
        return text
    return f"{text[:4]}...{text[-4:]}"


@lru_cache
def _has_column(table: str, column: str) -> bool:
    try:
        rows = execute_query(
            """
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = :schema
              AND TABLE_NAME = :table
              AND COLUMN_NAME = :column
            LIMIT 1
            """,
            {"schema": MYSQL_DATABASE, "table": table, "column": column},
        )
        return bool(rows)
    except Exception:
        return False


@lru_cache
def _has_table(table: str) -> bool:
    try:
        rows = execute_query(
            """
            SELECT 1
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = :schema
              AND TABLE_NAME = :table
            LIMIT 1
            """,
            {"schema": MYSQL_DATABASE, "table": table},
        )
        return bool(rows)
    except Exception:
        return False


@router.get("/sessions")
async def get_session_usage(
    order: str = Query("desc", pattern="^(?i)(asc|desc)$"),
    summary_sort: str = Query("last_used_at", pattern="^(last_used_at|session_count)$"),
    current_user: User = Depends(get_current_user),
):
    """管理者向けにユーザーのセッションと最終利用日時を返す。"""
    print(f"[DEBUG get_session_usage] ★ ENDPOINT HIT ★")  # ← これを先頭に追加
    print(f"[DEBUG get_session_usage] current_user: id={current_user.id}, is_admin={current_user.is_admin}")
    _ensure_admin(current_user)

    has_last_used = _has_column("sessions", "last_used_at")
    has_is_customer = _has_column("users", "is_customer")
    last_used_expr = "COALESCE(s.last_used_at, s.created_at)" if has_last_used else "s.created_at"
    customer_filter = "u.is_customer = 1" if has_is_customer else "1=1"

    direction = "ASC" if order.lower() == "asc" else "DESC"
    summary_sort_column = "session_count" if summary_sort == "session_count" else "last_used_at"

    try:
        session_rows = execute_query(
            f"""
            SELECT
                u.id AS user_id,
                u.user_number AS user_number,
                u.name AS user_name,
                u.email AS email,
                s.id AS session_id,
                s.session_token AS session_token,
                s.expires AS expires_at,
                s.created_at AS created_at,
                {last_used_expr} AS last_used_at
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE {customer_filter}
            ORDER BY last_used_at {direction}
            """
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"sessions query failed: {exc}")

    try:
        summary_rows = execute_query(
            f"""
            SELECT
                u.id AS user_id,
                u.user_number AS user_number,
                u.name AS user_name,
                u.email AS email,
                COUNT(s.id) AS session_count,
                MAX({last_used_expr}) AS last_used_at
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE {customer_filter}
            GROUP BY u.id, u.user_number, u.name, u.email
            ORDER BY {summary_sort_column} {direction}
            """
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"sessions summary query failed: {exc}")

    def _map_session(row: Dict[str, Any]) -> Dict[str, Any]:
        last_used = _to_datetime(row.get("last_used_at"))
        created_at = _to_datetime(row.get("created_at"))
        expires_at = _to_datetime(row.get("expires_at"))
        return {
            "session_id": row.get("session_id"),
            "user_id": row.get("user_id"),
            "user_number": row.get("user_number"),
            "user_name": row.get("user_name"),
            "email": row.get("email"),
            "last_used_at": _iso(last_used),
            "last_used_at_jst": _iso_jst(last_used),
            "created_at": _iso(created_at),
            "created_at_jst": _iso_jst(created_at),
            "expires_at": _iso(expires_at),
            "expires_at_jst": _iso_jst(expires_at),
            "session_token_preview": _mask_token(row.get("session_token")),
        }

    def _map_summary(row: Dict[str, Any]) -> Dict[str, Any]:
        last_used = _to_datetime(row.get("last_used_at"))
        return {
            "user_id": row.get("user_id"),
            "user_number": row.get("user_number"),
            "user_name": row.get("user_name"),
            "email": row.get("email"),
            "session_count": int(row.get("session_count") or 0),
            "last_used_at": _iso(last_used),
            "last_used_at_jst": _iso_jst(last_used),
        }

    return {
        "success": True,
        "count": len(session_rows),
        "data": {
            "sessions": [_map_session(row) for row in session_rows],
            "summary": [_map_summary(row) for row in summary_rows],
        },
        "order": direction.lower(),
        "summary_sort": summary_sort_column,
    }


@router.get("/transcription")
async def get_transcription_usage(
    missing_limit: int = Query(200, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
):
    """文字起こし利用数とツール未登録動画の利用状況を返す。"""
    _ensure_admin(current_user)

    has_video_master = _has_table("video_master")
    has_video_transcription = _has_table("video_transcription")

    if not has_video_transcription:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="video_transcriptionテーブルが見つかりません",
        )

    try:
        usage_rows = execute_query(
            """
            SELECT
                u.user_number AS user_number,
                u.name AS user_name,
                COUNT(*) AS transcription_count
            FROM video_transcription vt
            INNER JOIN users u ON vt.user_number = u.user_number
            GROUP BY u.user_number, u.name
            ORDER BY transcription_count DESC
            """
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"transcription usage query failed: {exc}")

    missing_rows: list[dict[str, Any]] = []
    missing_detail_rows: list[dict[str, Any]] = []
    if has_video_master:
        try:
            missing_rows = execute_query(
                """
                SELECT
                    u.user_number AS user_number,
                    u.name AS user_name,
                    COUNT(*) AS missing_count
                FROM video_transcription vt
                INNER JOIN users u ON vt.user_number = u.user_number
                LEFT JOIN video_master vm ON vt.video_id = vm.video_id
                WHERE vm.video_id IS NULL
                GROUP BY u.user_number, u.name
                ORDER BY missing_count DESC
                """
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"missing summary query failed: {exc}")

        try:
            missing_detail_rows = execute_query(
                """
                SELECT
                    u.user_number AS user_number,
                    u.name AS user_name,
                    vt.video_id AS video_id,
                    vt.account_name AS account_name,
                    vt.file_path AS file_path
                FROM video_transcription vt
                INNER JOIN users u ON vt.user_number = u.user_number
                LEFT JOIN video_master vm ON vt.video_id = vm.video_id
                WHERE vm.video_id IS NULL
                ORDER BY u.name, vt.id DESC
                LIMIT :limit
                """,
                {"limit": missing_limit},
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"missing detail query failed: {exc}")

    def _build_video_url(row: Dict[str, Any]) -> Optional[str]:
        video_id = row.get("video_id")
        account_name = row.get("account_name")
        if not video_id:
            return None
        if account_name:
            return f"https://www.tiktok.com/@{account_name}/video/{video_id}"
        return f"https://www.tiktok.com/video/{video_id}"

    return {
        "success": True,
        "data": {
            "usage_by_user": [
                {
                    "user_number": row.get("user_number"),
                    "user_name": row.get("user_name"),
                    "transcription_count": int(row.get("transcription_count") or 0),
                }
                for row in usage_rows
            ],
            "missing_by_user": [
                {
                    "user_number": row.get("user_number"),
                    "user_name": row.get("user_name"),
                    "missing_count": int(row.get("missing_count") or 0),
                }
                for row in missing_rows
            ],
            "missing_videos": [
                {
                    "user_number": row.get("user_number"),
                    "user_name": row.get("user_name"),
                    "video_id": row.get("video_id"),
                    "account_name": row.get("account_name"),
                    "file_path": row.get("file_path"),
                    "video_url": _build_video_url(row),
                }
                for row in missing_detail_rows
            ],
        },
        "missing_limit": missing_limit,
    }
