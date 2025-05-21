from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime
from src.db.database import execute_query, fetch_one, execute_update
from src.auth.router import get_current_user
from src.auth.models import User
from .models import ColumnSetting, DisplaySetting

router = APIRouter(prefix="/api/display-settings", tags=["display_settings"])

@router.post("")
async def save_display_settings(
    settings: DisplaySetting,
    current_user: User = Depends(get_current_user)
):
    """表示設定を保存/更新する"""
    try:
        # 設定名を生成
        setting_name = f"{current_user.email}_setting"
        
        # 既存の設定を確認
        existing_setting = fetch_one(
            "SELECT setting_id FROM user_display_settings WHERE email = :email",
            {"email": current_user.email}
        )
        
        if existing_setting:
            # 既存の設定を更新
            setting_id = existing_setting["setting_id"]
            execute_update(
                """
                UPDATE user_display_settings 
                SET is_default = :is_default, updated_at = NOW()
                WHERE setting_id = :setting_id
                """,
                {"is_default": settings.is_default, "setting_id": setting_id}
            )
            
            # 既存のカラム設定を削除
            execute_update(
                "DELETE FROM column_settings WHERE setting_id = :setting_id",
                {"setting_id": setting_id}
            )
        else:
            # 新規設定を作成
            result = execute_query(
                """
                INSERT INTO user_display_settings (email, setting_name, is_default)
                VALUES (:email, :setting_name, :is_default)
                """,
                {
                    "email": current_user.email, 
                    "setting_name": setting_name, 
                    "is_default": settings.is_default
                }
            )
            # 新しく挿入された行のIDを取得
            # SQLAlchemyの場合は別途クエリで取得する必要がある場合も
            last_id_result = fetch_one("SELECT LAST_INSERT_ID() as last_id")
            setting_id = last_id_result["last_id"] if last_id_result else None
        
        # カラム設定を保存
        for column in settings.columns:
            execute_update(
                """
                INSERT INTO column_settings 
                (setting_id, column_name, is_visible, display_order)
                VALUES (:setting_id, :column_name, :is_visible, :display_order)
                """,
                {
                    "setting_id": setting_id,
                    "column_name": column.column_name,
                    "is_visible": column.is_visible,
                    "display_order": column.display_order
                }
            )
        
        return {"success": True, "setting_id": setting_id}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("")
async def get_display_settings(current_user: User = Depends(get_current_user)):
    """ユーザーの表示設定を取得する"""
    try:
        # 設定の基本情報を取得
        setting = fetch_one(
            """
            SELECT setting_id, is_default 
            FROM user_display_settings 
            WHERE email = :email
            """,
            {"email": current_user.email}
        )
        
        if not setting:
            return {"success": True, "settings": None}
        
        # カラム設定を取得
        columns = execute_query(
            """
            SELECT column_name, is_visible, display_order
            FROM column_settings
            WHERE setting_id = :setting_id
            ORDER BY display_order
            """,
            {"setting_id": setting["setting_id"]}
        )
        
        return {
            "success": True,
            "settings": {
                "setting_id": setting["setting_id"],
                "is_default": setting["is_default"],
                "columns": columns
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.put("/{setting_id}/default")
async def update_default_setting(
    setting_id: int,
    is_default: bool,
    current_user: User = Depends(get_current_user)
):
    """表示設定のデフォルト状態を更新する"""
    try:
        # 設定の所有者を確認
        setting = fetch_one(
            """
            SELECT email FROM user_display_settings 
            WHERE setting_id = :setting_id
            """,
            {"setting_id": setting_id}
        )
        
        if not setting or setting["email"] != current_user.email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定された設定が見つかりません"
            )
        
        # デフォルト状態を更新
        execute_update(
            """
            UPDATE user_display_settings 
            SET is_default = :is_default, updated_at = NOW()
            WHERE setting_id = :setting_id
            """,
            {"is_default": is_default, "setting_id": setting_id}
        )
        
        return {"success": True}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        ) 