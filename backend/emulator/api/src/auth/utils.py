from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
import os
from dotenv import load_dotenv
import uuid
import secrets

load_dotenv()

# 設定
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")  # 本番環境では必ず環境変数から取得
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24時間
VERIFICATION_TOKEN_EXPIRE_MINUTES = 60  # 1時間
SESSION_TOKEN_EXPIRE_DAYS = 30  # 30日

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def generate_uuid() -> str:
    """UUIDを生成"""
    return str(uuid.uuid4())

def generate_token() -> str:
    """ランダムなトークンを生成"""
    return secrets.token_urlsafe(32)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """パスワードの検証"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """パスワードのハッシュ化"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """JWTトークンの生成"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[str]:
    """トークンの検証"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None

def create_verification_token(email: str, token_type: str) -> tuple[str, str, datetime]:
    """検証トークンの生成
    
    Returns:
        tuple[token_id, token, expiry]: トークンID、トークン文字列、有効期限
    """
    token_id = generate_uuid()
    token = generate_token()
    expires = datetime.utcnow() + timedelta(minutes=VERIFICATION_TOKEN_EXPIRE_MINUTES)
    return token_id, token, expires

def create_session(user_id: str) -> tuple[str, str, datetime, datetime]:
    """セッションの生成
    
    Returns:
        tuple[session_id, session_token, expires, last_used_at]: セッションID、セッショントークン、有効期限、最終利用日時
    """
    session_id = generate_uuid()
    session_token = generate_token()
    expires = datetime.utcnow() + timedelta(days=SESSION_TOKEN_EXPIRE_DAYS)
    last_used_at = datetime.utcnow()  # 最終利用日時を追加
    return session_id, session_token, expires, last_used_at

def update_session_activity(session_token: str) -> Optional[datetime]:
    """セッションの最終利用日時を更新
    
    Args:
        session_token: セッショントークン
        
    Returns:
        Optional[datetime]: 更新された最終利用日時、失敗した場合はNone
    """
    try:
        current_time = datetime.utcnow()
        # この関数は実際の実装時にDB接続してセッションを更新する
        # データベース接続はこの関数内で行うか、外部から渡す
        return current_time
    except Exception:
        return None

def get_jwt_settings():
    secret_key = os.getenv("JWT_SECRET_KEY")
    if not secret_key:
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET_KEY is not set in environment variables"
        )
    return {
        "secret_key": secret_key,
        "algorithm": os.getenv("JWT_ALGORITHM", "HS256"),
        "expire_minutes": int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    } 