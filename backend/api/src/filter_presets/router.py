from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from src.auth.router import get_current_user
from src.auth.models import User
from .models import FilterPresetIn, FilterPresetUpdate
from . import repositories as repo

router = APIRouter(prefix="/api/filter-presets", tags=["filter_presets"])

@router.get("")
async def list_filter_presets(
    context_key: Optional[str] = Query(None, description="対象コンテキストキー"),
    current_user: User = Depends(get_current_user)
):
    try:
        rows = repo.list_presets(current_user.user_number, context_key)
        return {"success": True, "presets": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/default")
async def get_default_filter_preset(
    context_key: str = Query(..., description="対象コンテキストキー"),
    current_user: User = Depends(get_current_user)
):
    try:
        row = repo.get_default_preset(current_user.user_number, context_key)
        return {"success": True, "preset": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{preset_id}")
async def get_filter_preset(
    preset_id: str,
    current_user: User = Depends(get_current_user)
):
    row = repo.get_preset(current_user.user_number, preset_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="プリセットが見つかりません")
    return {"success": True, "preset": row}

@router.post("")
async def create_filter_preset(
    body: FilterPresetIn,
    current_user: User = Depends(get_current_user)
):
    try:
        row = repo.insert_preset(current_user.user_number, body.model_dump())
        return {"success": True, "preset": row}
    except Exception as e:
        msg = str(e)
        raise HTTPException(status_code=400 if "Duplicate" in msg else 500, detail=msg)

@router.put("/{preset_id}")
async def update_filter_preset(
    preset_id: str,
    body: FilterPresetUpdate,
    current_user: User = Depends(get_current_user)
):
    try:
        row = repo.update_preset(current_user.user_number, preset_id, body.model_dump(exclude_unset=True))
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="プリセットが見つかりません")
        return {"success": True, "preset": row}
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        raise HTTPException(status_code=400 if "Duplicate" in msg else 500, detail=msg)

@router.post("/{preset_id}/set-default")
async def set_default_filter_preset(
    preset_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        row = repo.set_default(current_user.user_number, preset_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="プリセットが見つかりません")
        return {"success": True, "preset": row}
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        raise HTTPException(status_code=400 if "Duplicate" in msg else 500, detail=msg)

@router.delete("/{preset_id}")
async def delete_filter_preset(
    preset_id: str,
    current_user: User = Depends(get_current_user)
):
    ok = repo.soft_delete(current_user.user_number, preset_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="プリセットが見つかりません")
    return {"success": True}