from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any

from src.db.database import execute_query, execute_update, fetch_one
from src.auth.router import get_current_user
from src.auth.models import User


router = APIRouter(
    prefix="/api/influencer-pr-products",
    tags=["influencer_pr_products"],
)


class ProductUpdatePayload(BaseModel):
    product_name: Optional[str] = None
    product_category: Optional[str] = None
    source_url: Optional[str] = None
    is_pr: Optional[bool] = None


def _ensure_admin(user: User) -> None:
    if not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理者のみアクセスできます。",
        )


def _normalize_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text or None


@router.get("/pending")
async def get_pending_products(current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)

    rows = execute_query(
        """
        SELECT
            product_id,
            product_name,
            product_category,
            source_url
        FROM influencer_pr_product
        WHERE is_pr = 0
        ORDER BY product_id DESC
        """
    )
    return {
        "success": True,
        "count": len(rows),
        "data": rows,
    }


@router.get("/pending/count")
async def get_pending_products_count(current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)

    row = fetch_one(
        """
        SELECT COUNT(*) AS pending_count
        FROM influencer_pr_product
        WHERE is_pr = 0
        """
    )
    count = int(row.get("pending_count", 0)) if row else 0
    return {"success": True, "count": count}


@router.patch("/{product_id}")
async def update_product(
    product_id: int,
    payload: ProductUpdatePayload,
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    updates: Dict[str, Any] = {}
    if payload.product_name is not None:
        updates["product_name"] = _normalize_str(payload.product_name)
    if payload.product_category is not None:
        updates["product_category"] = _normalize_str(payload.product_category)
    if payload.source_url is not None:
        updates["source_url"] = _normalize_str(payload.source_url)
    if payload.is_pr is not None:
        updates["is_pr"] = 1 if payload.is_pr else 0

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更新内容がありません。",
        )

    existing = fetch_one(
        """
        SELECT product_id
        FROM influencer_pr_product
        WHERE product_id = :product_id
        """,
        {"product_id": product_id},
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="対象の商品が見つかりません。",
        )

    set_clause = ", ".join(f"{key} = :{key}" for key in updates.keys())
    params = {"product_id": product_id, **updates}

    execute_update(
        f"""
        UPDATE influencer_pr_product
        SET {set_clause}
        WHERE product_id = :product_id
        """,
        params,
    )

    updated = fetch_one(
        """
        SELECT
            product_id,
            product_name,
            product_category,
            source_url,
            is_pr
        FROM influencer_pr_product
        WHERE product_id = :product_id
        """,
        {"product_id": product_id},
    )

    return {
        "success": True,
        "data": updated,
    }


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    existing = fetch_one(
        """
        SELECT product_id
        FROM influencer_pr_product
        WHERE product_id = :product_id
        """,
        {"product_id": product_id},
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="対象の商品が見つかりません。",
        )

    execute_update(
        """
        DELETE FROM influencer_pr_product
        WHERE product_id = :product_id
        """,
        {"product_id": product_id},
    )

    return {"success": True}
