from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional
from datetime import datetime
from src.db.database import get_db_connection
from .models import UserCreate, User, Token, Session
from .utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    verify_token,
    generate_uuid,
    create_session,
    create_verification_token
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Optional[User]:
    """現在のユーザーを取得"""
    email = verify_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="認証情報が無効です",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM users WHERE email = %s",
            (email,)
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ユーザーが見つかりません",
            )
        return User(**user)
    finally:
        cursor.close()
        conn.close()

@router.post("/register", response_model=User)
async def register(user_in: UserCreate):
    """新規ユーザー登録"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # メールアドレスの重複チェック
        cursor.execute(
            "SELECT id FROM users WHERE email = %s",
            (user_in.email,)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="このメールアドレスは既に登録されています",
            )
        
        # ユーザーの作成
        user_id = generate_uuid()
        hashed_password = get_password_hash(user_in.password)
        
        cursor.execute(
            """
            INSERT INTO users (id, email, password, name)
            VALUES (%s, %s, %s, %s)
            """,
            (user_id, user_in.email, hashed_password, user_in.name)
        )
        conn.commit()
        
        # 作成したユーザーの取得
        cursor.execute(
            "SELECT * FROM users WHERE id = %s",
            (user_id,)
        )
        new_user = cursor.fetchone()
        return User(**new_user)
        
    finally:
        cursor.close()
        conn.close()

@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """ログイン処理"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # ユーザーの検証
        cursor.execute(
            "SELECT * FROM users WHERE email = %s",
            (form_data.username,)
        )
        user = cursor.fetchone()
        
        if not user or not verify_password(form_data.password, user["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="メールアドレスまたはパスワードが正しくありません",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # セッションの作成
        session_id, session_token, expires = create_session(user["id"])
        cursor.execute(
            """
            INSERT INTO sessions (id, user_id, session_token, expires)
            VALUES (%s, %s, %s, %s)
            """,
            (session_id, user["id"], session_token, expires)
        )
        conn.commit()
        
        # アクセストークンの生成（is_adminを含める）
        access_token = create_access_token(data={"sub": user["email"], "is_admin": bool(user.get("is_admin", 0))})
        
        return {"access_token": access_token, "token_type": "bearer", "is_admin": bool(user.get("is_admin", 0))}
        
    finally:
        cursor.close()
        conn.close()

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """ログアウト処理"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # ユーザーのセッションを削除
        cursor.execute(
            "DELETE FROM sessions WHERE user_id = %s",
            (current_user.id,)
        )
        conn.commit()
        return {"message": "ログアウトしました"}
        
    finally:
        cursor.close()
        conn.close()

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """現在のユーザー情報を取得"""
    return current_user 