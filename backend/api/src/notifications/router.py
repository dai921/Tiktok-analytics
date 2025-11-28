from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from src.auth.models import User
from src.auth.router import get_current_user
from src.db.database import engine, execute_query


router = APIRouter(prefix="/api", tags=["notifications"])


class NotificationCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    body: str = Field(..., min_length=1)
    scheduled_at: Optional[datetime] = None


class MarkReadPayload(BaseModel):
    read: bool = True


def _ensure_admin(user: User) -> None:
    if not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin only",
        )


def _extract_lastrowid(result) -> Optional[int]:
    if hasattr(result, "lastrowid"):
        return result.lastrowid  # type: ignore[attr-defined]
    try:
        pk = getattr(result, "inserted_primary_key", None)
        return pk[0] if pk else None
    except Exception:
        return None


def _derive_title(body: str, title: Optional[str] = None) -> str:
    if title:
        t = title.strip()
        if t:
            return t[:255]
    body_trimmed = (body or "").strip()
    if body_trimmed:
        return body_trimmed[:40]
    return "お知らせ"


JST = ZoneInfo("Asia/Tokyo")


def _to_jst_trim_seconds(dt: datetime) -> datetime:
    """
    Convert to JST and drop seconds/microseconds (keep minutes).
    Treat naive datetimes as UTC because the frontend sends ISO strings with Z.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    jst = dt.astimezone(JST)
    return jst.replace(second=0, microsecond=0, tzinfo=None)


@router.post("/admin/notifications")
async def create_and_send_notification(
    payload: NotificationCreate,
    current_user: User = Depends(get_current_user),
):
    """通知を作成し全ユーザーに即時配信する"""
    _ensure_admin(current_user)

    base_datetime = payload.scheduled_at or datetime.utcnow().replace(tzinfo=timezone.utc)
    scheduled_at = _to_jst_trim_seconds(base_datetime)
    sent_at = scheduled_at if payload.scheduled_at else _to_jst_trim_seconds(datetime.utcnow())
    derived_title = _derive_title(payload.body, payload.title)

    with engine.begin() as conn:
        insert_result = conn.execute(
            text(
                """
                INSERT INTO notifications (
                  title, body, target_scope, status,
                  scheduled_at, sent_at, created_by, created_at, updated_at
                )
                VALUES (
                  :title, :body, 'all', 'sent',
                  :scheduled_at, :sent_at, :created_by, NOW(), NOW()
                )
                """
            ),
            {
                "title": derived_title,
                "body": payload.body,
                "scheduled_at": scheduled_at,
                "sent_at": sent_at,
                "created_by": current_user.id,
            },
        )
        notification_id = _extract_lastrowid(insert_result)
        if notification_id is None:
            row = conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()
            notification_id = int(row["id"]) if row and row.get("id") is not None else None

        if notification_id is None:
            raise HTTPException(status_code=500, detail="Failed to get notification id")

        # 全ユーザー分の配信レコードを一括挿入
        conn.execute(
            text(
                """
                INSERT INTO notification_receipts (
                  notification_id, user_id, delivered_at, is_read, created_at, updated_at
                )
                SELECT
                  :notification_id,
                  u.id,
                  :delivered_at,
                  0,
                  NOW(),
                  NOW()
                FROM users u
                """
            ),
            {
                "notification_id": notification_id,
                "delivered_at": sent_at,
            },
        )

        notification_row = conn.execute(
            text(
                """
                SELECT
                  id, title, body, target_scope, status,
                  scheduled_at, sent_at, created_by, created_at, updated_at
                FROM notifications
                WHERE id = :notification_id
                """
            ),
            {"notification_id": notification_id},
        ).mappings().first()

        count_row = conn.execute(
            text(
                """
                SELECT COUNT(*) AS total
                FROM notification_receipts
                WHERE notification_id = :notification_id
                """
            ),
            {"notification_id": notification_id},
        ).mappings().first()

    return {
        "success": True,
        "notification": notification_row,
        "delivery_count": int(count_row["total"]) if count_row and count_row.get("total") is not None else 0,
    }


@router.get("/admin/notifications")
async def list_notifications_admin(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """通知一覧（管理者向け）"""
    _ensure_admin(current_user)

    rows = execute_query(
        """
        SELECT
          n.id,
          n.title,
          n.body,
          n.status,
          n.scheduled_at,
          n.sent_at,
          n.created_by,
          n.created_at,
          n.updated_at,
          COALESCE(stats.total, 0) AS delivery_total,
          COALESCE(stats.read_count, 0) AS read_count
        FROM notifications n
        LEFT JOIN (
          SELECT
            notification_id,
            COUNT(*) AS total,
            SUM(is_read = 1) AS read_count
          FROM notification_receipts
          GROUP BY notification_id
        ) AS stats ON stats.notification_id = n.id
        ORDER BY n.sent_at DESC, n.created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {"limit": limit, "offset": offset},
    )
    return {"success": True, "data": rows}


@router.get("/notifications")
async def list_notifications_for_user(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    only_unread: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """ログインユーザー向け通知一覧"""
    params = {"user_id": current_user.id, "limit": limit, "offset": offset}
    unread_clause = "AND nr.is_read = 0" if only_unread else ""

    rows = execute_query(
        f"""
        SELECT
          nr.notification_id AS id,
          n.title,
          n.body,
          n.sent_at,
          nr.delivered_at,
          nr.is_read,
          nr.read_at
    FROM notification_receipts nr
    INNER JOIN notifications n ON n.id = nr.notification_id
    WHERE nr.user_id = :user_id {unread_clause}
    ORDER BY nr.delivered_at DESC, n.sent_at DESC
    LIMIT :limit OFFSET :offset
        """,
        params,
    )

    totals = execute_query(
        """
        SELECT
          COUNT(*) AS total,
          SUM(is_read = 0) AS unread_total
        FROM notification_receipts
        WHERE user_id = :user_id
        """,
        {"user_id": current_user.id},
    )
    total_row = totals[0] if totals else {"total": 0, "unread_total": 0}

    return {
        "success": True,
        "data": rows,
        "total": int(total_row.get("total") or 0),
        "unread_total": int(total_row.get("unread_total") or 0),
    }


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    payload: MarkReadPayload = Body(...),
    current_user: User = Depends(get_current_user),
):
    """既読・未読の更新"""
    with engine.begin() as conn:
        existing = conn.execute(
            text(
                """
                SELECT id, is_read, read_at
                FROM notification_receipts
                WHERE notification_id = :notification_id AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"notification_id": notification_id, "user_id": current_user.id},
        ).mappings().first()

        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found",
            )

        if payload.read:
            conn.execute(
                text(
                    """
                    UPDATE notification_receipts
                    SET is_read = 1, read_at = COALESCE(read_at, NOW()), updated_at = NOW()
                    WHERE notification_id = :notification_id AND user_id = :user_id
                    """
                ),
                {"notification_id": notification_id, "user_id": current_user.id},
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE notification_receipts
                    SET is_read = 0, read_at = NULL, updated_at = NOW()
                    WHERE notification_id = :notification_id AND user_id = :user_id
                    """
                ),
                {"notification_id": notification_id, "user_id": current_user.id},
            )

        updated = conn.execute(
            text(
                """
                SELECT
                  nr.notification_id AS id,
                  n.title,
                  n.body,
                  n.sent_at,
                  nr.delivered_at,
                  nr.is_read,
                  nr.read_at
                FROM notification_receipts nr
                INNER JOIN notifications n ON n.id = nr.notification_id
                WHERE nr.notification_id = :notification_id AND nr.user_id = :user_id
                LIMIT 1
                """
            ),
            {"notification_id": notification_id, "user_id": current_user.id},
        ).mappings().first()

    return {"success": True, "data": updated}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    """
    Mark all notifications for the current user as read.
    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                UPDATE notification_receipts
                SET is_read = 1,
                    read_at = COALESCE(read_at, NOW()),
                    updated_at = NOW()
                WHERE user_id = :user_id AND is_read = 0
                """
            ),
            {"user_id": current_user.id},
        )

    updated = result.rowcount or 0
    return {"success": True, "updated": updated}
