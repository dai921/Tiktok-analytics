import logging
import os
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from google.auth import compute_engine
from google.cloud import storage
from pydantic import BaseModel, Field
from sqlalchemy import text

from src.auth.models import User
from src.auth.router import get_current_user
from src.db.database import engine, execute_query


router = APIRouter(prefix="/api", tags=["notifications"])
logger = logging.getLogger(__name__)


class NotificationCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    body: str = Field(..., min_length=1)


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

CHATWORK_BASE_URL_DEFAULT = "https://api.chatwork.com/v2"
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
NOTIFICATION_IMAGE_BUCKET = os.getenv("NOTIFICATION_IMAGE_BUCKET", "").strip()


@lru_cache
def _get_chatwork_config() -> dict:
    api_token = (os.getenv("CHATWORK_API_KEY") or "").strip()
    room_id = (os.getenv("CHATWORK_ROOM_ID") or "").strip()
    base_url = (os.getenv("CHATWORK_API_BASE_URL") or CHATWORK_BASE_URL_DEFAULT).rstrip("/")

    if not api_token or not room_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chatwork APIの設定が不足しています。管理者に問い合わせてください。",
        )

    return {"api_token": api_token, "room_id": room_id, "base_url": base_url}


def _storage_client() -> storage.Client:
    """
    On Cloud Run, force metadata credentials to avoid any local key file lookups.
    Locally, fall back to default ADC for developer convenience.
    """
    if os.getenv("K_SERVICE"):
        credentials = compute_engine.Credentials()
        project_id = os.getenv("PROJECT_ID") or None
        return storage.Client(project=project_id, credentials=credentials)
    return storage.Client()


def _build_chatwork_body(
    title: str,
    body: str,
    scheduled_at: datetime,
    is_scheduled: bool,
    delivery_count: Optional[int] = None,
) -> str:
    content = (body or "").strip()
    if not content:
        content = title or "お知らせ"
    return "[toall]\n" + content

async def _prepare_image_payload(upload: UploadFile) -> Optional[dict[str, Any]]:
    """
    Validate and read an optional image upload for Chatwork.
    """
    if not upload:
        return None

    content_type = upload.content_type or ""
    if content_type and not content_type.startswith("image/"):
        await upload.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="画像ファイルのみアップロードできます",
        )

    file_bytes = await upload.read()
    await upload.close()

    logger.warning(
        {
            "phase": "prepare_image",
            "filename": upload.filename,
            "content_type": content_type,
            "size": len(file_bytes),
        }
    )

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="空のファイルはアップロードできません",
        )

    if len(file_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="画像のサイズが大きすぎます。10MB以下にしてください。",
        )

    return {
        "filename": upload.filename or "upload",
        "content": file_bytes,
        "content_type": content_type or "application/octet-stream",
    }


def _store_notification_image_gcs(notification_id: int, attachment: dict[str, Any]) -> Optional[str]:
    """
    Persist the uploaded image to Cloud Storage and return the object name.
    """
    if not attachment:
        return None
    if not NOTIFICATION_IMAGE_BUCKET:
        logger.warning(
            {
                "phase": "store_notification_image",
                "warning": "bucket_not_configured",
            }
        )
        return None

    client = _storage_client()
    bucket = client.bucket(NOTIFICATION_IMAGE_BUCKET)
    orig_name = attachment.get("filename") or "upload"
    content_type = attachment.get("content_type") or "application/octet-stream"

    suffix = Path(orig_name).suffix or ""
    object_name = f"notifications/{notification_id}/image{suffix}"

    blob = bucket.blob(object_name)
    blob.content_type = content_type
    blob.metadata = {"original_filename": orig_name}
    blob.upload_from_string(attachment.get("content") or b"", content_type=content_type)
    logger.info(
        {
            "phase": "store_notification_image",
            "bucket": NOTIFICATION_IMAGE_BUCKET,
            "object_name": object_name,
            "content_type": content_type,
            "size": len(attachment.get("content") or b""),
        }
    )
    return object_name


def _notification_image_url(notification_id: int, image_path: Optional[str]) -> Optional[str]:
    if not image_path or not NOTIFICATION_IMAGE_BUCKET:
        return None
    try:
        client = _storage_client()
        bucket = client.bucket(NOTIFICATION_IMAGE_BUCKET)
        blob = bucket.blob(image_path)
        # 署名付きURL（GET）を30分で発行
        return blob.generate_signed_url(expiration=timedelta(minutes=30), method="GET")
    except Exception:
        # 失敗時は保護付きエンドポイントにフォールバック
        logger.warning("failed to generate signed url; fallback to protected endpoint", exc_info=True)
        return f"/api/notifications/{notification_id}/image"


def _add_image_url_to_row(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return row
    try:
        nid = int(row.get("id"))
    except Exception:
        row["image_url"] = None
        return row
    row["image_url"] = _notification_image_url(nid, row.get("image_path"))
    return row


def _parse_notification_inputs(
    form_body: Optional[str],
    form_title: Optional[str],
    upload: Optional[UploadFile],
    json_payload: Optional[NotificationCreate],
) -> tuple[str, Optional[str], Optional[UploadFile], dict]:
    """
    Use FastAPI-parsed inputs (Form/File for multipart, Body for JSON) and normalize them.
    This keeps JSON clients and multipart clients working without manual boundary parsing.
    """
    debug: dict[str, Any] = {
        "source": "form" if form_body or form_title or upload else "json" if json_payload else "none",
        "has_upload": bool(upload),
        "upload_filename": getattr(upload, "filename", None),
        "body_from_form": form_body is not None,
        "title_from_form": form_title is not None,
    }

    def _clean(value: Optional[str]) -> Optional[str]:
        return value.strip() if value and value.strip() else None

    raw_body = _clean(form_body)
    raw_title = _clean(form_title)

    if not raw_body and json_payload:
        raw_body = _clean(json_payload.body)
        raw_title = raw_title or _clean(json_payload.title)
        debug["source"] = "json"

    if not raw_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="本文を入力してください",
        )

    return raw_body, raw_title, upload, debug





async def _send_chatwork_notification(
    title: str,
    body: str,
    scheduled_at: datetime,
    is_scheduled: bool,
    delivery_count: Optional[int] = None,
    attachment: Optional[dict[str, Any]] = None,
) -> None:
    config = _get_chatwork_config()
    message_body = _build_chatwork_body(title, body, scheduled_at, is_scheduled, delivery_count)
    url = (
        f"{config['base_url']}/rooms/{config['room_id']}/files"
        if attachment
        else f"{config['base_url']}/rooms/{config['room_id']}/messages"
    )
    headers = {"X-ChatWorkToken": config["api_token"]}

    try:
        async with httpx.AsyncClient(timeout=20 if attachment else 10) as client:
            if attachment:
                files = {
                    "file": (
                        attachment["filename"],
                        attachment["content"],
                        attachment.get("content_type") or "application/octet-stream",
                    )
                }
                response = await client.post(
                    url,
                    headers=headers,
                    data={"message": message_body},
                    files=files,
                )
            else:
                response = await client.post(url, headers=headers, data={"body": message_body})
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Chatwork通知の送信に失敗しました: status=%s, body=%s",
            exc.response.status_code if exc.response else "unknown",
            exc.response.text if exc.response else "",
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Chatworkへの通知送信に失敗しました。",
        )
    except httpx.HTTPError as exc:
        logger.error("Chatwork通知の送信中にエラーが発生しました: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Chatworkへの通知送信中にエラーが発生しました。",
        )


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


def _user_can_access_notification(notification_id: int, user: User) -> bool:
    if getattr(user, "is_admin", False):
        return True
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT 1
                FROM notification_receipts
                WHERE notification_id = :notification_id AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"notification_id": notification_id, "user_id": user.id},
        ).first()
    return bool(row)


@router.get("/notifications/{notification_id}/image")
async def get_notification_image(
    notification_id: int,
    current_user: User = Depends(get_current_user),
):
    if not _user_can_access_notification(notification_id, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    if not NOTIFICATION_IMAGE_BUCKET:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT image_path
                FROM notifications
                WHERE id = :notification_id
                LIMIT 1
                """
            ),
            {"notification_id": notification_id},
        ).first()

    image_path = row[0] if row else None
    if not image_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    client = _storage_client()
    bucket = client.bucket(NOTIFICATION_IMAGE_BUCKET)
    blob = bucket.blob(image_path)
    if not blob.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    data = blob.download_as_bytes()
    content_type = blob.content_type or "application/octet-stream"
    orig_name = (blob.metadata or {}).get("original_filename") if blob.metadata else None
    filename = orig_name or Path(image_path).name

    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=data, media_type=content_type, headers=headers)


@router.post("/admin/notifications")
async def create_and_send_notification(
    body: Optional[str] = Form(None, alias="body"),
    title: Optional[str] = Form(None, alias="title"),
    image: Optional[UploadFile] = File(None),
    payload: Optional[NotificationCreate] = Body(None),
    current_user: User = Depends(get_current_user),
):
    """通知を作成し全ユーザーに即時配信する"""
    _ensure_admin(current_user)

    body_text, provided_title, upload, debug_info = _parse_notification_inputs(
        form_body=body,
        form_title=title,
        upload=image,
        json_payload=payload,
    )
    attachment = await _prepare_image_payload(upload) if upload is not None else None

    scheduled_at = _to_jst_trim_seconds(datetime.utcnow().replace(tzinfo=timezone.utc))
    sent_at = scheduled_at
    derived_title = _derive_title(body_text, provided_title)
    image_path: Optional[str] = None

    with engine.begin() as conn:
        insert_result = conn.execute(
            text(
                """
                INSERT INTO notifications (
                  title, body, target_scope, status,
                  scheduled_at, sent_at, created_by, created_at, updated_at, image_path
                )
                VALUES (
                  :title, :body, 'all', 'sent',
                  :scheduled_at, :sent_at, :created_by, NOW(), NOW(), :image_path
                )
                """
            ),
            {
                "title": derived_title,
                "body": body_text,
                "scheduled_at": scheduled_at,
                "sent_at": sent_at,
                "created_by": current_user.id,
                "image_path": None,
            },
        )
        notification_id = _extract_lastrowid(insert_result)
        if notification_id is None:
            row = conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()
            notification_id = int(row["id"]) if row and row.get("id") is not None else None

        if notification_id is None:
            raise HTTPException(status_code=500, detail="Failed to get notification id")

        if attachment:
            try:
                image_path = _store_notification_image_gcs(notification_id, attachment)
                if image_path:
                    conn.execute(
                        text("UPDATE notifications SET image_path = :image_path WHERE id = :notification_id"),
                        {"image_path": image_path, "notification_id": notification_id},
                    )
                    logger.info(
                        {
                            "phase": "notification_image_path_saved",
                            "notification_id": notification_id,
                            "image_path": image_path,
                            "bucket": NOTIFICATION_IMAGE_BUCKET,
                        }
                    )
                else:
                    logger.warning(
                        {
                            "phase": "notification_image_path_missing_after_upload",
                            "notification_id": notification_id,
                            "bucket": NOTIFICATION_IMAGE_BUCKET,
                        }
                    )
            except Exception as exc:
                logger.warning({"phase": "store_notification_image_error", "error": str(exc)})

        # �S���[�U�[���̔z�M���R�[�h���ꊇ�}��
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
                  scheduled_at, sent_at, created_by, created_at, updated_at, image_path
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

    delivery_count = int(count_row["total"]) if count_row and count_row.get("total") is not None else 0

    await _send_chatwork_notification(
        title=notification_row["title"],
        body=notification_row["body"],
        scheduled_at=scheduled_at,
        is_scheduled=False,
        delivery_count=delivery_count,
        attachment=attachment,
    )

    notification_row = dict(notification_row or {})
    notification_row["image_url"] = _notification_image_url(notification_id, notification_row.get("image_path"))

    return {
        "success": True,
        "notification": notification_row,
        "delivery_count": delivery_count,
        "uploaded_image": bool(attachment),
        "received_upload": bool(attachment),
        "received_upload_name": attachment["filename"] if attachment else None,
        "debug_upload": debug_info,
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
          n.image_path,
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
    rows = [_add_image_url_to_row(dict(row)) for row in rows]
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
          n.image_path,
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

    rows = [_add_image_url_to_row(dict(row)) for row in rows]
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
                  n.image_path,
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

    if updated:
        updated = dict(updated)
        updated["image_url"] = _notification_image_url(notification_id, updated.get("image_path"))
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
