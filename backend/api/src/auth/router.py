from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional
from datetime import datetime, timedelta
from src.db.database import execute_query, fetch_one, execute_update, get_db
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
    
    user = fetch_one(
        "SELECT * FROM users WHERE email = :email",
        {"email": email}
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザーが見つかりません",
        )
    return User(**user)

@router.post("/register", response_model=User)
async def register(user_in: UserCreate):
    """新規ユーザー登録"""
    # メールアドレスの重複チェック
    existing_user = fetch_one(
        "SELECT id FROM users WHERE email = :email",
        {"email": user_in.email}
    )
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このメールアドレスは既に登録されています",
        )
    
    # ユーザーの作成
    user_id = generate_uuid()
    hashed_password = get_password_hash(user_in.password)
    
    execute_update(
        """
        INSERT INTO users (id, email, password, name)
        VALUES (:user_id, :email, :password, :name)
        """,
        {
            "user_id": user_id,
            "email": user_in.email,
            "password": hashed_password,
            "name": user_in.name
        }
    )
    
    # 作成したユーザーの取得
    new_user = fetch_one(
        "SELECT * FROM users WHERE id = :user_id",
        {"user_id": user_id}
    )
    
    return User(**new_user)

@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """ログイン処理"""
    # ユーザーの検証
    user = fetch_one(
        "SELECT * FROM users WHERE email = :email",
        {"email": form_data.username}
    )
    
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # セッションの作成
    session_id, session_token, expires, last_used_at = create_session(user["id"])
    
    execute_update(
        """
        INSERT INTO sessions (id, user_id, session_token, expires, last_used_at)
        VALUES (:session_id, :user_id, :session_token, :expires, :last_used_at)
        """,
        {
            "session_id": session_id,
            "user_id": user["id"],
            "session_token": session_token,
            "expires": expires,
            "last_used_at": last_used_at
        }
    )
    
    # アクセストークンの生成（is_adminを含める）
    access_token = create_access_token(data={"sub": user["email"], "is_admin": bool(user.get("is_admin", 0))})
    
    return {"access_token": access_token, "token_type": "bearer", "is_admin": bool(user.get("is_admin", 0))}

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """ログアウト処理"""
    # ユーザーのセッションを削除
    execute_update(
        "DELETE FROM sessions WHERE user_id = :user_id",
        {"user_id": current_user.id}
    )
    
    return {"message": "ログアウトしました"}

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
    
    target_user_id = None
    
    if password_data.email and is_admin:
        # 管理者が他のユーザーのパスワードを変更する場合
        user_data = fetch_one(
            "SELECT id FROM users WHERE email = :email",
            {"email": password_data.email}
        )
        
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたメールアドレスのユーザーが見つかりません",
            )
        
        target_user_id = user_data["id"]
        # 管理者の場合はcurrent_passwordの検証をスキップ
    else:
        # 一般ユーザーが自分自身のパスワードを変更する場合
        user_data = fetch_one(
            "SELECT id, password FROM users WHERE id = :user_id",
            {"user_id": current_user.id}
        )
        target_user_id = current_user.id
        
        # 一般ユーザーの場合のみパスワード検証
        if not verify_password(password_data.current_password, user_data["password"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="現在のパスワードが正しくありません",
            )
    
    # 新しいパスワードをハッシュ化して保存
    hashed_password = get_password_hash(password_data.new_password)
    
    execute_update(
        "UPDATE users SET password = :password WHERE id = :user_id",
        {"password": hashed_password, "user_id": target_user_id}
    )
    
    return {"message": "パスワードが正常に変更されました"}

@router.get("/tiktok/auth")
async def tiktok_auth(request: Request):
    """TikTok認証フローを開始"""
    # ユーザーの状態をチェック
    user_id = None
    session_cookie = request.cookies.get("session")
    
    if session_cookie:
        try:
            payload = jwt.decode(session_cookie, os.getenv("JWT_SECRET_KEY"), algorithms=["HS256"])
            user_id = payload.get("uid")
        except:
            # 無効なセッション
            pass
    
    # ログインしていない場合はanonymousユーザーを作成
    if not user_id:
        # 匿名ユーザーを作成
        user_id = str(uuid.uuid4())
        temp_email = f"temp_{user_id}@example.com"
        temp_password = secrets.token_urlsafe(16)
        hashed_password = get_password_hash(temp_password)
        
        try:
            execute_update(
                """
                INSERT INTO users (id, email, password, name)
                VALUES (:user_id, :email, :password, :name)
                """,
                {
                    "user_id": user_id,
                    "email": temp_email,
                    "password": hashed_password,
                    "name": "一時ユーザー"
                }
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"一時ユーザーの作成に失敗しました: {str(e)}"
            )
    
    # stateパラメータを生成して保存
    state = secrets.token_urlsafe(32)
    
    try:
        # 古いstateを削除
        execute_update(
            "DELETE FROM user_oauth_states WHERE user_id = :user_id OR created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            {"user_id": user_id}
        )
        
        # 新しいstateを保存
        execute_update(
            """
            INSERT INTO user_oauth_states (user_id, oauth_state)
            VALUES (:user_id, :state)
            """,
            {"user_id": user_id, "state": state}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth状態の保存に失敗しました: {str(e)}"
        )
    
    # セッションクッキーを設定
    cookie = jwt.encode({"uid": user_id}, os.getenv("JWT_SECRET_KEY"), algorithm="HS256")
    
    # コールバック先はフロントの登録済みURLに統一（審査回避のため）
    callback_base = os.getenv("BASE_URL") or f"https://{request.headers.get('host')}"
    redirect_uri = f"{callback_base}/api/auth/tiktok/callback"
    auth_url = (
        "https://www.tiktok.com/v2/auth/authorize?"
        f"client_key={os.getenv('TT_CLIENT_KEY')}&"
        f"redirect_uri={redirect_uri}&"
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
        samesite="none",  # クロスサイトのOAuthリダイレクトで確実に送る
        max_age=3600  # 1時間
    )
    
    return response

@router.get("/tiktok/auth-url")
async def tiktok_auth_url(current_user: User = Depends(get_current_user)):
    # state生成・古いもの掃除
    state = secrets.token_urlsafe(32)
    execute_update(
        "DELETE FROM user_oauth_states WHERE user_id = :user_id OR created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)",
        {"user_id": current_user.id}
    )
    execute_update(
        "INSERT INTO user_oauth_states (user_id, oauth_state) VALUES (:user_id, :state)",
        {"user_id": current_user.id, "state": state}
    )

    # フロントに登録済みのredirect_uriと完全一致
    redirect_uri = f"{os.getenv('BASE_URL')}/api/auth/tiktok/callback"
    auth_url = (
        "https://www.tiktok.com/v2/auth/authorize?"
        f"client_key={os.getenv('TT_CLIENT_KEY')}&"
        f"redirect_uri={redirect_uri}&"
        "response_type=code&"
        f"state={state}&"
        "scope=user.info.basic,video.list"
    )
    return {"auth_url": auth_url}

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
        payload = jwt.decode(session_cookie, os.getenv("JWT_SECRET_KEY"), algorithms=["HS256"])
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
    state_record = fetch_one(
        "SELECT oauth_state FROM user_oauth_states WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 1",
        {"user_id": user_id}
    )
    
    if not state_record or state_record["oauth_state"] != state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不正なstateパラメータ"
        )
    
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
    try:
        # トークンの暗号化
        encrypted_access_token = encrypt_data(token_data.get("access_token"))
        encrypted_refresh_token = encrypt_data(token_data.get("refresh_token"))
        expires_in = token_data.get("expires_in")
        expires_at = (datetime.now() + timedelta(seconds=int(expires_in))).strftime("%Y-%m-%d %H:%M:%S")
        
        # テーブルが存在するか確認し、存在しなければ作成
        execute_update("""
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
        execute_update("""
            INSERT INTO tiktok_tokens (user_id, access_token, refresh_token, expires_in, expires_at)
            VALUES (:user_id, :access_token, :refresh_token, :expires_in, :expires_at)
            ON DUPLICATE KEY UPDATE
                access_token = VALUES(access_token),
                refresh_token = VALUES(refresh_token),
                expires_in = VALUES(expires_in),
                expires_at = VALUES(expires_at),
                updated_at = NOW()
        """, {
            "user_id": user_id,
            "access_token": encrypted_access_token,
            "refresh_token": encrypted_refresh_token,
            "expires_in": expires_in,
            "expires_at": expires_at
        })
        
        # 使用済みstateを削除
        execute_update(
            "DELETE FROM user_oauth_states WHERE user_id = :user_id",
            {"user_id": user_id}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"トークンの保存に失敗しました: {str(e)}"
        )
    
    # ログインセッションの発行
    cookie = jwt.encode({"uid": user_id}, os.getenv("JWT_SECRET_KEY"), algorithm="HS256")
    
    # フロントエンドへリダイレクト
    response = Response(status_code=status.HTTP_302_FOUND, headers={"Location": "/app/my-report?tiktok_connected=true"})
    response.set_cookie(
        key="session", 
        value=cookie, 
        httponly=True, 
        secure=True, 
        max_age=7*86400  # 7日間
    )
    
    return response

@router.post("/tiktok/complete")
async def tiktok_complete(payload: dict):
    code = payload.get("code")
    state = payload.get("state")
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code/stateが不足しています")

    # stateからユーザーを一意特定（1時間以内、最新を採用）
    rec = fetch_one(
        """
        SELECT user_id FROM user_oauth_states
        WHERE oauth_state = :state
          AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        ORDER BY created_at DESC
        LIMIT 1
        """,
        {"state": state}
    )
    if not rec:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不正なstateパラメータ")
    user_id = rec["user_id"]

    # TikTokトークン交換（TikTokに登録済みのredirect_uriと完全一致）
    redirect_uri = f"{os.getenv('BASE_URL')}/api/auth/tiktok/callback"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            data={
                "client_key": os.getenv("TT_CLIENT_KEY"),
                "client_secret": os.getenv("TT_CLIENT_SECRET"),
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            }
        )
        r.raise_for_status()
        token_data = r.json()
        if "data" not in token_data:
            raise HTTPException(status_code=500, detail="TikTokレスポンスに必要なデータがありません")
        data = token_data["data"]

    # 保存
    enc_access = encrypt_data(data.get("access_token"))
    enc_refresh = encrypt_data(data.get("refresh_token"))
    expires_in = int(data.get("expires_in", 0))
    expires_at = (datetime.now() + timedelta(seconds=expires_in)).strftime("%Y-%m-%d %H:%M:%S")

    execute_update("""
        INSERT INTO tiktok_tokens (user_id, access_token, refresh_token, expires_in, expires_at)
        VALUES (:user_id, :access_token, :refresh_token, :expires_in, :expires_at)
        ON DUPLICATE KEY UPDATE
          access_token=VALUES(access_token),
          refresh_token=VALUES(refresh_token),
          expires_in=VALUES(expires_in),
          expires_at=VALUES(expires_at),
          updated_at=NOW()
    """, {
        "user_id": user_id,
        "access_token": enc_access,
        "refresh_token": enc_refresh,
        "expires_in": expires_in,
        "expires_at": expires_at
    })

    # stateはワンタイム消費
    execute_update("DELETE FROM user_oauth_states WHERE user_id = :user_id", {"user_id": user_id})
    return {"ok": True}
