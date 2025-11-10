from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional
from datetime import datetime, timedelta
import asyncio
from src.my_report.repositories import TikTokRepository, TikTokUserConnection as RepoTikTokUserConnection
from src.my_report.tiktok_sync import schedule_initial_sync
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

async def fetch_tiktok_user_profile(access_token: Optional[str]) -> Optional[dict]:
    if not access_token:
        return None

    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"fields": "open_id,display_name,account_type,mainly_video_type"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://open.tiktokapis.com/v2/user/info/",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json() or {}
            data = payload.get("data")
            if not data:
                return None
            if isinstance(data, dict) and "user" in data:
                return data.get("user")
            return data if isinstance(data, dict) else None
    except Exception as exc:
        print(f"[ERROR] Failed to fetch TikTok user profile: {exc}")
        return None


def parse_tiktok_token_response(token_payload: dict) -> dict:
    if not isinstance(token_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TikTokレスポンスの形式が不正です"
        )

    data = token_payload.get("data")
    if isinstance(data, dict):
        return data

    if all(key in token_payload for key in ("access_token", "refresh_token")):
        return token_payload

    print(f"[ERROR] TikTok token response missing expected fields: {token_payload}")
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="TikTokレスポンスに必要なデータがありません"
    )


async def persist_tiktok_connection(user_id: str, token_payload: dict, expires_at: datetime) -> None:
    open_id = token_payload.get("open_id")
    if not open_id:
        print(f"[WARN] TikTok token payload missing open_id for user_id={user_id}")
        return

    access_token_raw = token_payload.get("access_token")
    refresh_token_raw = token_payload.get("refresh_token")

    repository = TikTokRepository()
    profile = await fetch_tiktok_user_profile(access_token_raw)
    display_name = None
    account_type = None
    mainly_video_type = None
    if isinstance(profile, dict):
        display_name = profile.get("display_name")
        account_type = profile.get("account_type")
        mainly_video_type = profile.get("mainly_video_type")

    connection = RepoTikTokUserConnection(
        user_id=user_id,
        tiktok_open_id=open_id,
        tiktok_access_token=access_token_raw,
        tiktok_refresh_token=refresh_token_raw,
        expires_at=expires_at.strftime("%Y-%m-%d %H:%M:%S"),
        display_name=display_name,
        linked_at=datetime.now(),
        account_type=account_type,
        mainly_video_type=mainly_video_type,
    )

    await repository.save_user_connection(connection)


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
    is_admin_flag = bool(user.get("is_admin", 0))
    is_developer_flag = bool(user.get("is_developer", 0))
    access_token = create_access_token(
        data={
            "sub": user["email"],
            "is_admin": is_admin_flag,
            "is_developer": is_developer_flag
        }
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_admin": is_admin_flag,
        "is_developer": is_developer_flag
    }

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
        "scope=user.info.basic,user.info.stats,video.list"
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
        "scope=user.info.basic,user.info.stats,video.list"
    )
    return {"auth_url": auth_url}

@router.get("/tiktok/callback")
async def tiktok_callback(request: Request, code: str = None, state: str = None):
    """TikTokのコールバックを処理"""
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="認可コードが見つかりません")

    session_cookie = request.cookies.get("session")
    if not session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="セッションが存在しません"
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

    state_record = fetch_one(
        "SELECT oauth_state FROM user_oauth_states WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 1",
        {"user_id": user_id}
    )
    if not state_record or state_record["oauth_state"] != state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不正なstateパラメータ")

    redirect_uri = f"{os.getenv('BASE_URL')}/api/auth/tiktok/callback"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                data={
                    "client_key": os.getenv("TT_CLIENT_KEY"),
                    "client_secret": os.getenv("TT_CLIENT_SECRET"),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                }
            )
            response.raise_for_status()
            raw_token = response.json() or {}
            token_data = parse_tiktok_token_response(raw_token)
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text
        print(f"[ERROR] TikTok token exchange failed: status={exc.response.status_code}, body={error_body}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TikTokのトークン発行に失敗しました"
        ) from exc
    except httpx.HTTPError as exc:
        print(f"[ERROR] TikTok token exchange HTTP error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TikTokのトークン発行で通信エラーが発生しました"
        ) from exc

    expires_in = int(token_data.get("expires_in", 0))
    expires_at_dt = datetime.now() + timedelta(seconds=expires_in) if expires_in else datetime.now()
    expires_at = expires_at_dt.strftime("%Y-%m-%d %H:%M:%S")

    try:
        encrypted_access_token = encrypt_data(token_data.get("access_token"))
        encrypted_refresh_token = encrypt_data(token_data.get("refresh_token"))
        execute_update(
            """
            INSERT INTO tiktok_tokens (user_id, access_token, refresh_token, expires_in, expires_at)
            VALUES (:user_id, :access_token, :refresh_token, :expires_in, :expires_at)
            ON DUPLICATE KEY UPDATE
              access_token=VALUES(access_token),
              refresh_token=VALUES(refresh_token),
              expires_in=VALUES(expires_in),
              expires_at=VALUES(expires_at),
              updated_at=NOW()
            """,
            {
                "user_id": user_id,
                "access_token": encrypted_access_token,
                "refresh_token": encrypted_refresh_token,
                "expires_in": expires_in,
                "expires_at": expires_at,
            },
        )
        execute_update(
            "DELETE FROM user_oauth_states WHERE user_id = :user_id",
            {"user_id": user_id}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"トークンの保存に失敗しました: {str(exc)}"
        )

    try:
        await persist_tiktok_connection(user_id, token_data, expires_at_dt)
    except Exception as sync_exc:
        print(f"[WARN] TikTok connection persistence failed: user_id={user_id} error={sync_exc}")

    try:
        schedule_initial_sync(user_id)
    except Exception as sync_exc:
        print(f"[WARN] TikTok initial sync scheduling failed: user_id={user_id} error={sync_exc}")

    cookie = jwt.encode({"uid": user_id}, os.getenv("JWT_SECRET_KEY"), algorithm="HS256")
    response = Response(status_code=status.HTTP_302_FOUND, headers={"Location": "/app/my-report?tiktok_connected=true"})
    response.set_cookie(
        key="session",
        value=cookie,
        httponly=True,
        secure=True,
        max_age=7 * 86400,
    )
    return response


@router.post("/tiktok/complete")
async def tiktok_complete(payload: dict):
    code = payload.get("code")
    state = payload.get("state")
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code/stateが不足しています")

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

    redirect_uri = f"{os.getenv('BASE_URL')}/api/auth/tiktok/callback"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                data={
                    "client_key": os.getenv("TT_CLIENT_KEY"),
                    "client_secret": os.getenv("TT_CLIENT_SECRET"),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                }
            )
            response.raise_for_status()
            raw_token = response.json() or {}
            token_data = parse_tiktok_token_response(raw_token)
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text
        print(f"[ERROR] TikTok token exchange failed: status={exc.response.status_code}, body={error_body}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TikTokのトークン発行に失敗しました"
        ) from exc
    except httpx.HTTPError as exc:
        print(f"[ERROR] TikTok token exchange HTTP error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TikTokのトークン発行で通信エラーが発生しました"
        ) from exc

    expires_in = int(token_data.get("expires_in", 0))
    expires_at_dt = datetime.now() + timedelta(seconds=expires_in) if expires_in else datetime.now()
    expires_at = expires_at_dt.strftime("%Y-%m-%d %H:%M:%S")

    execute_update(
        """
        INSERT INTO tiktok_tokens (user_id, access_token, refresh_token, expires_in, expires_at)
        VALUES (:user_id, :access_token, :refresh_token, :expires_in, :expires_at)
        ON DUPLICATE KEY UPDATE
          access_token=VALUES(access_token),
          refresh_token=VALUES(refresh_token),
          expires_in=VALUES(expires_in),
          expires_at=VALUES(expires_at),
          updated_at=NOW()
    """,
        {
            "user_id": user_id,
            "access_token": encrypt_data(token_data.get("access_token")),
            "refresh_token": encrypt_data(token_data.get("refresh_token")),
            "expires_in": expires_in,
            "expires_at": expires_at,
        }
    )

    execute_update("DELETE FROM user_oauth_states WHERE user_id = :user_id", {"user_id": user_id})
    try:
        await persist_tiktok_connection(user_id, token_data, expires_at_dt)
    except Exception as sync_exc:
        print(f"[WARN] TikTok connection persistence failed: user_id={user_id} error={sync_exc}")

    try:
        schedule_initial_sync(user_id)
    except Exception as sync_exc:
        print(f"[WARN] TikTok initial sync scheduling failed: user_id={user_id} error={sync_exc}")

    return {"ok": True}
