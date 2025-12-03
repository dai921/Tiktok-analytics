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
    summary_limit: int = Query(100, ge=1, le=500),
    session_limit: int = Query(300, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    """管理者向けにユーザーのセッションと最終利用日時を返す。"""
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
                u.name AS user_name,
                u.email AS email,
                s.expires AS expires_at,
                s.created_at AS created_at,
                {last_used_expr} AS last_used_at
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE {customer_filter}
            ORDER BY last_used_at {direction}
            LIMIT :limit
            """,
            {"limit": session_limit},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"sessions query failed: {exc}")

    try:
        summary_rows = execute_query(
            f"""
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                u.email AS email,
                COUNT(s.id) AS session_count,
                MAX({last_used_expr}) AS last_used_at
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE {customer_filter}
            GROUP BY u.id, u.name, u.email
            ORDER BY {summary_sort_column} {direction}
            LIMIT :limit
            """,
            {"limit": summary_limit},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"sessions summary query failed: {exc}")

    def _map_session(row: Dict[str, Any]) -> Dict[str, Any]:
        last_used = _to_datetime(row.get("last_used_at"))
        created_at = _to_datetime(row.get("created_at"))
        expires_at = _to_datetime(row.get("expires_at"))
        return {
            "user_id": row.get("user_id"),
            "user_name": row.get("user_name"),
            "email": row.get("email"),
            "last_used_at": _iso(last_used),
            "last_used_at_jst": _iso_jst(last_used),
            "created_at": _iso(created_at),
            "created_at_jst": _iso_jst(created_at),
            "expires_at": _iso(expires_at),
            "expires_at_jst": _iso_jst(expires_at),
        }

    def _map_summary(row: Dict[str, Any]) -> Dict[str, Any]:
        last_used = _to_datetime(row.get("last_used_at"))
        return {
            "user_id": row.get("user_id"),
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
        "summary_limit": summary_limit,
        "session_limit": session_limit,
    }


@router.get("/transcription")
async def get_transcription_usage(
    missing_limit: int = Query(300, ge=1, le=2000),
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
    missing_by_account_rows: list[dict[str, Any]] = []
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
            missing_by_account_rows = execute_query(
                """
                SELECT
                    vt.account_name AS account_name,
                    u.name AS user_name,
                    u.user_number AS user_number,
                    COUNT(*) AS data_count
                FROM video_transcription vt
                INNER JOIN users u ON vt.user_number = u.user_number
                LEFT JOIN video_master vm ON vt.video_id = vm.video_id
                WHERE vm.video_id IS NULL
                  AND vt.account_name IS NOT NULL
                  AND vt.account_name != ''
                GROUP BY vt.account_name, u.name, u.user_number
                ORDER BY data_count DESC
                LIMIT :limit
                """,
                {"limit": missing_limit},
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"missing by account query failed: {exc}")

    def _build_account_url(account_name: Optional[str]) -> Optional[str]:
        if not account_name:
            return None
        return f"https://www.tiktok.com/@{account_name}"

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
            "missing_by_account": [
                {
                    "account_name": row.get("account_name"),
                    "user_name": row.get("user_name"),
                    "user_number": row.get("user_number"),
                    "data_count": int(row.get("data_count") or 0),
                    "account_url": _build_account_url(row.get("account_name")),
                }
                for row in missing_by_account_rows
            ],
        },
        "missing_limit": missing_limit,
    }
