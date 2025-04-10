from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime
from src.db.database import get_db_connection
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
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 設定名を生成
        setting_name = f"{current_user.email}_setting"
        
        # 既存の設定を確認
        cursor.execute(
            "SELECT setting_id FROM user_display_settings WHERE email = %s",
            (current_user.email,)
        )
        existing_setting = cursor.fetchone()
        
        if existing_setting:
            # 既存の設定を更新
            setting_id = existing_setting["setting_id"]
            cursor.execute(
                """
                UPDATE user_display_settings 
                SET is_default = %s, updated_at = NOW()
                WHERE setting_id = %s
                """,
                (settings.is_default, setting_id)
            )
            
            # 既存のカラム設定を削除
            cursor.execute(
                "DELETE FROM column_settings WHERE setting_id = %s",
                (setting_id,)
            )
        else:
            # 新規設定を作成
            cursor.execute(
                """
                INSERT INTO user_display_settings (email, setting_name, is_default)
                VALUES (%s, %s, %s)
                """,
                (current_user.email, setting_name, settings.is_default)
            )
            setting_id = cursor.lastrowid
        
        # カラム設定を保存
        for column in settings.columns:
            cursor.execute(
                """
                INSERT INTO column_settings 
                (setting_id, column_name, is_visible, display_order)
                VALUES (%s, %s, %s, %s)
                """,
                (setting_id, column.column_name, column.is_visible, column.display_order)
            )
        
        conn.commit()
        return {"success": True, "setting_id": setting_id}
        
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("")
async def get_display_settings(current_user: User = Depends(get_current_user)):
    """ユーザーの表示設定を取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 設定の基本情報を取得
        cursor.execute(
            """
            SELECT setting_id, is_default 
            FROM user_display_settings 
            WHERE email = %s
            """,
            (current_user.email,)
        )
        setting = cursor.fetchone()
        
        if not setting:
            return {"success": True, "settings": None}
        
        # カラム設定を取得
        cursor.execute(
            """
            SELECT column_name, is_visible, display_order
            FROM column_settings
            WHERE setting_id = %s
            ORDER BY display_order
            """,
            (setting["setting_id"],)
        )
        columns = cursor.fetchall()
        
        return {
            "success": True,
            "settings": {
                "setting_id": setting["setting_id"],
                "is_default": setting["is_default"],
                "columns": columns
            }
        }
        
    finally:
        cursor.close()
        conn.close()

@router.put("/{setting_id}/default")
async def update_default_setting(
    setting_id: int,
    is_default: bool,
    current_user: User = Depends(get_current_user)
):
    """表示設定のデフォルト状態を更新する"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 設定の所有者を確認
        cursor.execute(
            """
            SELECT email FROM user_display_settings 
            WHERE setting_id = %s
            """,
            (setting_id,)
        )
        setting = cursor.fetchone()
        
        if not setting or setting[0] != current_user.email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定された設定が見つかりません"
            )
        
        # デフォルト状態を更新
        cursor.execute(
            """
            UPDATE user_display_settings 
            SET is_default = %s, updated_at = NOW()
            WHERE setting_id = %s
            """,
            (is_default, setting_id)
        )
        
        conn.commit()
        return {"success": True}
        
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close() 