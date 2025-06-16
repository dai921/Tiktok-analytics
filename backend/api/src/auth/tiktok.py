from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import JSONResponse, RedirectResponse
import requests
import json
import os
from datetime import datetime, timedelta
from typing import Optional
import secrets

from ..my_report.models import TikTokUserConnection
from .router import get_current_user

router = APIRouter(prefix="/auth/tiktok", tags=["auth"])

# TikTok APIの設定
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "mock-client-key")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "mock-client-secret")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

@router.get("/status")
async def check_tiktok_connection(user = Depends(get_current_user)):
    """
    現在のユーザーのTikTok連携状態を確認します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    


@router.post("/complete")
async def complete_tiktok_auth(
    code: str,
    user = Depends(get_current_user)
):
    """
    TikTok認証コードを使用して認証プロセスを完了します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # 実際の実装ではTikTok APIにアクセストークンを要求
        # ここではモック実装
        # token_response = requests.post(
        #     "https://open-api.tiktok.com/oauth/access_token/",
        #     params={
        #         "client_key": TIKTOK_CLIENT_KEY,
        #         "client_secret": TIKTOK_CLIENT_SECRET,
        #         "code": code,
        #         "grant_type": "authorization_code"
        #     }
        # )
        # token_data = token_response.json()
        
        # モックのトークンデータ
        token_data = {
            "access_token": f"mock-access-token-{secrets.token_hex(8)}",
            "expires_in": 86400,  # 24時間
            "refresh_token": f"mock-refresh-token-{secrets.token_hex(8)}",
            "open_id": f"tt-user-{secrets.token_hex(8)}",
            "scope": "user.info.basic,video.list"
        }
        
        # アクセストークンとリフレッシュトークンをデータベースに保存
        connection = TikTokUserConnection(
            user_id=user.id,
            tiktok_open_id=token_data.get("open_id"),
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            token_expires_at=datetime.now() + timedelta(seconds=token_data.get("expires_in", 86400)),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # 既存の接続を更新または新規作成
        await tiktok_repository.save_user_connection(connection)
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"認証の完了に失敗しました: {str(e)}")

@router.get("/callback")
async def tiktok_auth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None
):
    """
    TikTokのOAuth認証コールバック
    """
    # エラーチェック
    if error or not code:
        error_msg = error_description or "認証が拒否されました"
        return RedirectResponse(url=f"{BASE_URL}/my-report?error={error_msg}")
    
    # 成功した場合はフロントエンドにリダイレクト（コードを含める）
    return RedirectResponse(url=f"{BASE_URL}/my-report?code={code}&tiktok_connected=true")

@router.post("/disconnect")
async def disconnect_tiktok(user = Depends(get_current_user)):
    """
    TikTokとの連携を解除します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # ユーザーのTikTok連携を削除
        await tiktok_repository.delete_user_connection(user.id)
        return {"success": True, "message": "TikTokとの連携を解除しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"連携解除に失敗しました: {str(e)}") 