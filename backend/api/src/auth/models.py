from pydantic import BaseModel, EmailStr, constr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    password: constr(min_length=8)  # 8文字以上のパスワードを要求

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: str
    user_number: int
    email_verified: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    is_admin: bool = False

    class Config:
        from_attributes = True

class Session(BaseModel):
    id: str
    user_id: str
    session_token: str
    expires: datetime

class VerificationToken(BaseModel):
    id: str
    email: str
    token: str
    expires: datetime
    type: str  # 'RESET_PASSWORD' or 'VERIFY_EMAIL'

class Token(BaseModel):
    access_token: str
    token_type: str
    is_admin: bool = False

class TokenData(BaseModel):
    email: Optional[str] = None

class PasswordChange(BaseModel):
    email: Optional[str] = None  # 管理者がユーザーを指定する場合に使用
    current_password: str
    new_password: str 