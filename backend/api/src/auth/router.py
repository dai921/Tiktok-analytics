from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional
from datetime import datetime, timedelta
from src.db.database import get_db_connection
from .models import UserCreate, User, Token, Session, PasswordChange
from .utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    verify_token,
    generate_uuid,
    create_session,
    create_verification_token
)
import httpx, os, time, jwt
from src.utils.encryption import encrypt_data, decrypt_data
import uuid
import secrets

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
        session_id, session_token, expires, last_used_at = create_session(user["id"])
        cursor.execute(
            """
            INSERT INTO sessions (id, user_id, session_token, expires, last_used_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (session_id, user["id"], session_token, expires, last_used_at)
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

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user)
):
    """ユーザーのパスワード変更"""
    print("パスワード変更リクエスト - ユーザー情報:", {
        "user_id": current_user.id,
        "email": current_user.email,
        "is_admin_attr": getattr(current_user, "is_admin", None),
        "raw_user_data": current_user.__dict__
    })
    
    # 管理者権限のチェック
    is_admin = getattr(current_user, "is_admin", False)
    print("管理者権限チェック:", {
        "is_admin": is_admin,
        "user_email": current_user.email
    })
    
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="認証情報が無効です",
        )
    
    # 管理者権限のチェック
    if password_data.email and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この操作を行う権限がありません",
        )
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        target_user_id = None
        
        if password_data.email and is_admin:
            # 管理者が他のユーザーのパスワードを変更する場合
            cursor.execute(
                "SELECT id FROM users WHERE email = %s",
                (password_data.email,)
            )
            user_data = cursor.fetchone()
            
            if not user_data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="指定されたメールアドレスのユーザーが見つかりません",
                )
            
            target_user_id = user_data["id"]
            # 管理者の場合はcurrent_passwordの検証をスキップ
        else:
            # 一般ユーザーが自分自身のパスワードを変更する場合
            cursor.execute(
                "SELECT id, password FROM users WHERE id = %s",
                (current_user.id,)
            )
            user_data = cursor.fetchone()
            target_user_id = current_user.id
            
            # 一般ユーザーの場合のみパスワード検証
            if not verify_password(password_data.current_password, user_data["password"]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="現在のパスワードが正しくありません",
                )
        
        # 新しいパスワードをハッシュ化して保存
        hashed_password = get_password_hash(password_data.new_password)
        
        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (hashed_password, target_user_id)
        )
        conn.commit()
        
        return {"message": "パスワードが正常に変更されました"}
        
    finally:
        cursor.close()
        conn.close() 

@router.get("/tiktok/auth")
async def tiktok_auth(request: Request):
    """TikTok認証フローを開始"""
    # ユーザーの状態をチェック
    user_id = None
    session_cookie = request.cookies.get("session")
    
    if session_cookie:
        try:
            payload = jwt.decode(session_cookie, os.getenv("JWT_SECRET"), algorithms=["HS256"])
            user_id = payload.get("uid")
        except:
            # 無効なセッション
            pass
    
    # ログインしていない場合はanonymousユーザーを作成
    if not user_id:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # 匿名ユーザーを作成
            user_id = str(uuid.uuid4())
            temp_email = f"temp_{user_id}@example.com"
            temp_password = secrets.token_urlsafe(16)
            hashed_password = get_password_hash(temp_password)
            
            cursor.execute(
                """
                INSERT INTO users (id, email, password, name)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, temp_email, hashed_password, "一時ユーザー")
            )
            conn.commit()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"一時ユーザーの作成に失敗しました: {str(e)}"
            )
        finally:
            cursor.close()
            conn.close()
    
    # stateパラメータを生成して保存
    state = secrets.token_urlsafe(32)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 古いstateを削除
        cursor.execute(
            "DELETE FROM user_oauth_states WHERE user_id = %s OR created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            (user_id,)
        )
        
        # 新しいstateを保存
        cursor.execute(
            """
            INSERT INTO user_oauth_states (user_id, oauth_state)
            VALUES (%s, %s)
            """,
            (user_id, state)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth状態の保存に失敗しました: {str(e)}"
        )
    finally:
        cursor.close()
        conn.close()
    
    # セッションクッキーを設定
    cookie = jwt.encode({"uid": user_id}, os.getenv("JWT_SECRET"), algorithm="HS256")
    
    # TikTokの認証URLを生成
    auth_url = (
        "https://www.tiktok.com/v2/auth/authorize?"
        f"client_key={os.getenv('TT_CLIENT_KEY')}&"
        f"redirect_uri={os.getenv('BASE_URL')}/api/auth/tiktok/callback&"
        "response_type=code&"
        f"state={state}&"
        "scope=user.info.basic,video.list"
    )
    
    # 一時セッションを設定してTikTokにリダイレクト
    response = Response(status_code=status.HTTP_302_FOUND, headers={"Location": auth_url})
    response.set_cookie(
        key="session", 
        value=cookie, 
        httponly=True, 
        secure=True, 
        max_age=3600  # 1時間
    )
    
    return response

@router.get("/tiktok/callback")
async def tiktok_callback(request: Request, code: str = None, state: str = None):
    """TikTok認証コールバック処理"""
    # codeの検証
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="認可コードがありません")
    
    # セッションからユーザーIDを取得
    session_cookie = request.cookies.get("session")
    if not session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="セッションが見つかりません"
        )
    
    try:
        payload = jwt.decode(session_cookie, os.getenv("JWT_SECRET"), algorithms=["HS256"])
        user_id = payload.get("uid")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ユーザーIDが見つかりません"
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無効なセッション"
        )
    
    # stateパラメータの検証
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            "SELECT oauth_state FROM user_oauth_states WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
            (user_id,)
        )
        state_record = cursor.fetchone()
        
        if not state_record or state_record["oauth_state"] != state:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不正なstateパラメータ"
            )
    finally:
        cursor.close()
        conn.close()
    
    # TikTok APIとトークン交換
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                data={
                    "client_key": os.getenv("TT_CLIENT_KEY"),
                    "client_secret": os.getenv("TT_CLIENT_SECRET"),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": f"{os.getenv('BASE_URL')}/api/auth/tiktok/callback",
                }
            )
            response.raise_for_status()
            token_data = response.json()
            
            if "data" not in token_data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="TikTokからのレスポンスに必要なデータがありません"
                )
            
            token_data = token_data["data"]
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TikTokとの通信エラー: {str(e)}"
        )
    
    # トークンの暗号化と保存
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # トークンの暗号化
        encrypted_access_token = encrypt_data(token_data.get("access_token"))
        encrypted_refresh_token = encrypt_data(token_data.get("refresh_token"))
        expires_in = token_data.get("expires_in")
        expires_at = (datetime.now() + timedelta(seconds=int(expires_in))).strftime("%Y-%m-%d %H:%M:%S")
        
        # テーブルが存在するか確認し、存在しなければ作成
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tiktok_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                expires_in INT NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            )
        """)
        
        # トークンを保存
        cursor.execute("""
            INSERT INTO tiktok_tokens (user_id, access_token, refresh_token, expires_in, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                access_token = VALUES(access_token),
                refresh_token = VALUES(refresh_token),
                expires_in = VALUES(expires_in),
                expires_at = VALUES(expires_at),
                updated_at = NOW()
        """, (user_id, encrypted_access_token, encrypted_refresh_token, expires_in, expires_at))
        
        # 使用済みstateを削除
        cursor.execute("DELETE FROM user_oauth_states WHERE user_id = %s", (user_id,))
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"トークンの保存に失敗しました: {str(e)}"
        )
    finally:
        cursor.close()
        conn.close()
    
    # ログインセッションの発行
    cookie = jwt.encode({"uid": user_id}, os.getenv("JWT_SECRET"), algorithm="HS256")
    
    # フロントエンドへリダイレクト
    response = Response(status_code=status.HTTP_302_FOUND, headers={"Location": "/app/my-account"})
    response.set_cookie(
        key="session", 
        value=cookie, 
        httponly=True, 
        secure=True, 
        max_age=7*86400  # 7日間
    )
    
    return response