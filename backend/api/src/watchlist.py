from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection
from src.auth.router import get_current_user
from src.auth.models import User
import logging
import json

# ロガーの設定
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

# ビデオウォッチリストのモデル
class VideoWatchlistItem(BaseModel):
    url: str  # ビデオのURLを保存
    watchlist_name: Optional[str] = None

class VideoWatchlistResponse(BaseModel):
    watchlist_id: int
    email: str
    url: str  # ビデオのURL
    watchlist_name: Optional[str] = None
    created_at: str
    updated_at: str

# アカウントブックマークのモデル
class AccountBookmarkItem(BaseModel):
    account_name: str
    bookmark_name: Optional[str] = None

class AccountBookmarkResponse(BaseModel):
    bookmark_id: int
    email: str
    account_name: str
    bookmark_name: Optional[str] = None
    created_at: str
    updated_at: str

# ビデオウォッチリスト関連のAPI
@router.post("/videos", response_model=VideoWatchlistResponse)
async def add_video_to_watchlist(
    video_item: VideoWatchlistItem,
    current_user: User = Depends(get_current_user)
):
    """ビデオをウォッチリストに追加する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 同じビデオが既に登録されているか確認
        cursor.execute(
            "SELECT * FROM video_watchlists WHERE email = %s AND url = %s",
            (current_user.email, video_item.url)
        )
        existing = cursor.fetchone()
        
        if existing:
            # 既存の登録を更新
            cursor.execute(
                """
                UPDATE video_watchlists 
                SET watchlist_name = %s, updated_at = NOW()
                WHERE watchlist_id = %s
                """,
                (video_item.watchlist_name, existing["watchlist_id"])
            )
            watchlist_id = existing["watchlist_id"]
        else:
            # 新規登録
            cursor.execute(
                """
                INSERT INTO video_watchlists (email, url, watchlist_name)
                VALUES (%s, %s, %s)
                """,
                (current_user.email, video_item.url, video_item.watchlist_name)
            )
            watchlist_id = cursor.lastrowid
        
        conn.commit()
        
        # 登録された情報を取得
        cursor.execute(
            "SELECT * FROM video_watchlists WHERE watchlist_id = %s",
            (watchlist_id,)
        )
        result = cursor.fetchone()
        
        return {
            "watchlist_id": result["watchlist_id"],
            "email": result["email"],
            "url": result["url"],
            "watchlist_name": result["watchlist_name"],
            "created_at": result["created_at"].isoformat(),
            "updated_at": result["updated_at"].isoformat()
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error adding video to watchlist: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.delete("/videos/{url}")
async def remove_video_from_watchlist(
    url: str,
    current_user: User = Depends(get_current_user)
):
    """ビデオをウォッチリストから削除する"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # ビデオが存在するか確認
        cursor.execute(
            "SELECT * FROM video_watchlists WHERE email = %s AND url = %s",
            (current_user.email, url)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたビデオはウォッチリストに存在しません"
            )
        
        # ウォッチリストから削除
        cursor.execute(
            "DELETE FROM video_watchlists WHERE email = %s AND url = %s",
            (current_user.email, url)
        )
        
        conn.commit()
        return {"success": True, "message": "ビデオがウォッチリストから削除されました"}
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error removing video from watchlist: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("/videos", response_model=List[VideoWatchlistResponse])
async def get_video_watchlist(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのビデオウォッチリストを取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            "SELECT * FROM video_watchlists WHERE email = %s ORDER BY updated_at DESC",
            (current_user.email,)
        )
        results = cursor.fetchall()
        
        watchlist = []
        for item in results:
            watchlist.append({
                "watchlist_id": item["watchlist_id"],
                "email": item["email"],
                "url": item["url"],
                "watchlist_name": item["watchlist_name"],
                "created_at": item["created_at"].isoformat(),
                "updated_at": item["updated_at"].isoformat()
            })
        
        return watchlist
        
    except Exception as e:
        logger.error(f"Error getting video watchlist: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("/videos/details")
async def get_video_watchlist_with_details(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのビデオウォッチリストを詳細情報付きで取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # ウォッチリストとビデオデータを結合して取得
        query = """
        SELECT 
            vw.watchlist_id, vw.email, vw.url, vw.watchlist_name, vw.created_at, vw.updated_at,
            fd.thumbnail_url, fd.created_at as video_created_at, fd.play_count, fd.play_count_increase,
            fd.ten_days_increase, fd.account_name, fd.display_name, fd.content_type,
            fd.likes_count, fd.comment_count, fd.likes_count_increase, fd.ten_days_likes_increase,
            fd.comment_count_increase, fd.ten_days_comment_increase, fd.hashtags, fd.music_info, fd.caption
        FROM video_watchlists vw
        LEFT JOIN frontend_data fd ON vw.url = fd.url
        WHERE vw.email = %s
        ORDER BY vw.updated_at DESC
        """
        
        cursor.execute(query, (current_user.email,))
        results = cursor.fetchall()
        
        watchlist_with_details = []
        for item in results:
            # サムネイルURLの処理
            thumbnail_url = item.get("thumbnail_url")
            if thumbnail_url and isinstance(thumbnail_url, str) and thumbnail_url.startswith('gs://'):
                parts = thumbnail_url.split('/')
                bucket = parts[2]
                object_path = '/'.join(parts[3:])
                thumbnail_url = f"https://storage.googleapis.com/{bucket}/{object_path}"
            
            # ハッシュタグの処理
            hashtags = []
            hashtags_raw = item.get("hashtags")
            if hashtags_raw:
                try:
                    if isinstance(hashtags_raw, str):
                        if hashtags_raw.startswith('['):
                            hashtags = json.loads(hashtags_raw)
                        else:
                            hashtags = [tag.strip() for tag in hashtags_raw.split(',') if tag.strip()]
                except json.JSONDecodeError:
                    hashtags = []
            
            # 音楽情報の処理
            music_info = {}
            music_raw = item.get("music_info")
            if music_raw:
                try:
                    if isinstance(music_raw, str):
                        if music_raw.startswith('{'):
                            music_info = json.loads(music_raw)
                        else:
                            music_info = {"title": music_raw}
                except json.JSONDecodeError:
                    music_info = {"title": str(music_raw)}
            
            # 作成日時の処理
            video_created_at = item.get("video_created_at")
            if video_created_at:
                video_created_at = video_created_at.isoformat() if hasattr(video_created_at, 'isoformat') else str(video_created_at)
            
            watchlist_with_details.append({
                "watchlist": {
                    "watchlist_id": item["watchlist_id"],
                    "email": item["email"],
                    "url": item["url"],
                    "watchlist_name": item["watchlist_name"],
                    "created_at": item["created_at"].isoformat(),
                    "updated_at": item["updated_at"].isoformat()
                },
                "video": {
                    "url": item["url"],
                    "thumbnail_url": thumbnail_url,
                    "created_at": video_created_at,
                    "play_count": int(item["play_count"]) if item["play_count"] else 0,
                    "play_count_increase": int(item["play_count_increase"]) if item["play_count_increase"] else 0,
                    "ten_days_increase": int(item["ten_days_increase"]) if item["ten_days_increase"] else 0,
                    "account_name": item["account_name"],
                    "display_name": item["display_name"],
                    "content_type": item["content_type"],
                    "likes_count": int(item["likes_count"]) if item["likes_count"] else 0,
                    "comment_count": int(item["comment_count"]) if item["comment_count"] else 0,
                    "likes_count_increase": int(item["likes_count_increase"]) if item["likes_count_increase"] else 0,
                    "ten_days_likes_increase": int(item["ten_days_likes_increase"]) if item["ten_days_likes_increase"] else 0,
                    "comment_count_increase": int(item["comment_count_increase"]) if item["comment_count_increase"] else 0,
                    "ten_days_comment_increase": int(item["ten_days_comment_increase"]) if item["ten_days_comment_increase"] else 0,
                    "hashtags": hashtags,
                    "music_info": music_info,
                    "caption": item["caption"]
                } if item["play_count"] is not None else None  # ビデオ情報がない場合はNullを返す
            })
        
        return watchlist_with_details
        
    except Exception as e:
        logger.error(f"Error getting video watchlist with details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

# アカウントブックマーク関連のAPI
@router.post("/accounts", response_model=AccountBookmarkResponse)
async def add_account_to_bookmarks(
    account_item: AccountBookmarkItem,
    current_user: User = Depends(get_current_user)
):
    """アカウントをブックマークに追加する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 同じアカウントが既に登録されているか確認
        cursor.execute(
            "SELECT * FROM account_bookmarks WHERE email = %s AND account_name = %s",
            (current_user.email, account_item.account_name)
        )
        existing = cursor.fetchone()
        
        if existing:
            # 既存の登録を更新
            cursor.execute(
                """
                UPDATE account_bookmarks 
                SET bookmark_name = %s, updated_at = NOW()
                WHERE bookmark_id = %s
                """,
                (account_item.bookmark_name, existing["bookmark_id"])
            )
            bookmark_id = existing["bookmark_id"]
        else:
            # 新規登録
            cursor.execute(
                """
                INSERT INTO account_bookmarks (email, account_name, bookmark_name)
                VALUES (%s, %s, %s)
                """,
                (current_user.email, account_item.account_name, account_item.bookmark_name)
            )
            bookmark_id = cursor.lastrowid
        
        conn.commit()
        
        # 登録された情報を取得
        cursor.execute(
            "SELECT * FROM account_bookmarks WHERE bookmark_id = %s",
            (bookmark_id,)
        )
        result = cursor.fetchone()
        
        return {
            "bookmark_id": result["bookmark_id"],
            "email": result["email"],
            "account_name": result["account_name"],
            "bookmark_name": result["bookmark_name"],
            "created_at": result["created_at"].isoformat(),
            "updated_at": result["updated_at"].isoformat()
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error adding account to bookmarks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.delete("/accounts/{account_name}")
async def remove_account_from_bookmarks(
    account_name: str,
    current_user: User = Depends(get_current_user)
):
    """アカウントをブックマークから削除する"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # アカウントが存在するか確認
        cursor.execute(
            "SELECT * FROM account_bookmarks WHERE email = %s AND account_name = %s",
            (current_user.email, account_name)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたアカウントはブックマークに存在しません"
            )
        
        # ブックマークから削除
        cursor.execute(
            "DELETE FROM account_bookmarks WHERE email = %s AND account_name = %s",
            (current_user.email, account_name)
        )
        
        conn.commit()
        return {"success": True, "message": "アカウントがブックマークから削除されました"}
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error removing account from bookmarks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("/accounts", response_model=List[AccountBookmarkResponse])
async def get_account_bookmarks(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのアカウントブックマークを取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            "SELECT * FROM account_bookmarks WHERE email = %s ORDER BY updated_at DESC",
            (current_user.email,)
        )
        results = cursor.fetchall()
        
        bookmarks = []
        for item in results:
            bookmarks.append({
                "bookmark_id": item["bookmark_id"],
                "email": item["email"],
                "account_name": item["account_name"],
                "bookmark_name": item["bookmark_name"],
                "created_at": item["created_at"].isoformat(),
                "updated_at": item["updated_at"].isoformat()
            })
        
        return bookmarks
        
    except Exception as e:
        logger.error(f"Error getting account bookmarks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("/accounts/details")
async def get_account_bookmarks_with_details(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのアカウントブックマークをアカウント詳細情報付きで取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # アカウントブックマークとアカウント集計データを結合して取得
        query = """
        SELECT 
            ab.bookmark_id, ab.email, ab.account_name, ab.bookmark_name, ab.created_at, ab.updated_at,
            COUNT(DISTINCT fd.url) AS total_videos,
            SUM(fd.play_count) AS total_plays,
            SUM(fd.play_count_increase) AS total_play_increase,
            MAX(fd.display_name) AS display_name,
            MAX(fd.account_type) AS account_type
        FROM account_bookmarks ab
        LEFT JOIN frontend_data fd ON ab.account_name = fd.account_name
        WHERE ab.email = %s
        GROUP BY ab.bookmark_id, ab.email, ab.account_name, ab.bookmark_name, ab.created_at, ab.updated_at
        ORDER BY ab.updated_at DESC
        """
        
        cursor.execute(query, (current_user.email,))
        results = cursor.fetchall()
        
        bookmarks_with_details = []
        for item in results:
            bookmarks_with_details.append({
                "bookmark": {
                    "bookmark_id": item["bookmark_id"],
                    "email": item["email"],
                    "account_name": item["account_name"],
                    "bookmark_name": item["bookmark_name"],
                    "created_at": item["created_at"].isoformat(),
                    "updated_at": item["updated_at"].isoformat()
                },
                "account": {
                    "account_name": item["account_name"],
                    "display_name": item["display_name"],
                    "account_type": item["account_type"],
                    "total_videos": int(item["total_videos"]) if item["total_videos"] else 0,
                    "total_plays": int(item["total_plays"]) if item["total_plays"] else 0,
                    "total_play_increase": int(item["total_play_increase"]) if item["total_play_increase"] else 0
                } if item["total_videos"] else None  # アカウントデータがない場合はNullを返す
            })
        
        return bookmarks_with_details
        
    except Exception as e:
        logger.error(f"Error getting account bookmarks with details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close() 