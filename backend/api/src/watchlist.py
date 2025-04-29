from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from src.db.database import get_db_connection
from src.auth.router import get_current_user
from src.auth.models import User
import logging
import json
from datetime import datetime, timedelta

# ロガーの設定
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

# ビデオウォッチリストのモデル
class VideoWatchlistItem(BaseModel):
    video_id: str  # ビデオのURLを保存
    watchlist_name: Optional[str] = None

class VideoWatchlistResponse(BaseModel):
    watchlist_id: int
    email: str
    video_id: str  # ビデオのURL
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
            "SELECT * FROM video_watchlists WHERE email = %s AND video_id = %s",
            (current_user.email, video_item.video_id)
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
                INSERT INTO video_watchlists (email, video_id, watchlist_name)
                VALUES (%s, %s, %s)
                """,
                (current_user.email, video_item.video_id, video_item.watchlist_name)
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
            "video_id": result["video_id"],
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

@router.delete("/videos/{video_id}")
async def remove_video_from_watchlist(
    video_id: str,
    current_user: User = Depends(get_current_user)
):
    """ビデオをウォッチリストから削除する"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # ビデオが存在するか確認
        cursor.execute(
            "SELECT * FROM video_watchlists WHERE email = %s AND video_id = %s",
            (current_user.email, video_id)
        )
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたビデオはウォッチリストに存在しません"
            )
        
        # ウォッチリストから削除
        cursor.execute(
            "DELETE FROM video_watchlists WHERE email = %s AND video_id = %s",
            (current_user.email, video_id)
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
                "video_id": item["video_id"],
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
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのビデオウォッチリストを詳細情報付きで取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            query = """
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """
            
            cursor.execute(query)
            dates = cursor.fetchall()
            
            if dates:
                # 7回分のデータ期間を設定
                if not end_date:
                    end_date = dates[0]["collection_date"].strftime('%Y-%m-%d')
                if not start_date:
                    start_date = dates[-1]["collection_date"].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                if not end_date:
                    end_date = datetime.now().strftime('%Y-%m-%d')
                if not start_date:
                    start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            
            logger.info(f"使用する日付範囲: 開始={start_date}, 終了={end_date}")
            
        # ウォッチリストとビデオデータを結合して取得
        query = """
        SELECT 
            vw.watchlist_id, vw.email, vw.video_id, vw.watchlist_name, vw.created_at, vw.updated_at,
            fd.thumbnail_url, fd.created_at as video_created_at, fd.play_count, 
            SUM(pch.play_count_increase) as play_count_increase,
            SUM(pch.likes_count_increase) as likes_count_increase,
            SUM(pch.comment_count_increase) as comment_count_increase,
            SUM(pch.save_count_increase) as save_count_increase,
            fd.account_name, fd.display_name, fd.content_type,
            fd.likes_count, fd.comment_count, fd.save_count, fd.hashtags, fd.caption
        FROM video_watchlists vw
        LEFT JOIN frontend_data fd ON vw.video_id = fd.video_id
        LEFT JOIN play_count_history pch ON vw.video_id = pch.video_id
        WHERE vw.email = %s
        """
        
        params = [current_user.email]
        
        # 日付範囲が指定されている場合、条件に追加
        if start_date and end_date:
            query += " AND pch.collection_date BETWEEN %s AND %s"
            params.extend([start_date, end_date])
            
        query += """
        GROUP BY 
            vw.watchlist_id, vw.email, vw.video_id, vw.watchlist_name, vw.created_at, vw.updated_at,
            fd.thumbnail_url, fd.created_at, fd.play_count, fd.account_name, fd.display_name, 
            fd.content_type, fd.likes_count, fd.comment_count, fd.save_count, fd.hashtags, fd.caption
        ORDER BY vw.updated_at DESC
        """
        
        cursor.execute(query, params)
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
            
            
            # 作成日時の処理
            video_created_at = item.get("video_created_at")
            if video_created_at:
                video_created_at = video_created_at.isoformat() if hasattr(video_created_at, 'isoformat') else str(video_created_at)
            
            # 増加数のデフォルト値を設定
            play_count_increase = int(item["play_count_increase"]) if item["play_count_increase"] else 0
            likes_count_increase = int(item["likes_count_increase"]) if item["likes_count_increase"] else 0
            comment_count_increase = int(item["comment_count_increase"]) if item["comment_count_increase"] else 0
            save_count_increase = int(item["save_count_increase"]) if item["save_count_increase"] else 0
            
            watchlist_with_details.append({
                "watchlist": {
                    "watchlist_id": item["watchlist_id"],
                    "email": item["email"],
                    "video_id": item["video_id"],
                    "watchlist_name": item["watchlist_name"],
                    "created_at": item["created_at"].isoformat(),
                    "updated_at": item["updated_at"].isoformat()
                },
                "video": {
                    "video_id": item["video_id"],
                    "thumbnail_url": thumbnail_url,
                    "created_at": video_created_at,
                    "play_count": int(item["play_count"]) if item["play_count"] else 0,
                    "play_count_increase": play_count_increase,
                    "account_name": item["account_name"],
                    "display_name": item["display_name"],
                    "content_type": item["content_type"],
                    "likes_count": int(item["likes_count"]) if item["likes_count"] else 0,
                    "comment_count": int(item["comment_count"]) if item["comment_count"] else 0,
                    "save_count": int(item["save_count"]) if item["save_count"] else 0,
                    "likes_count_increase": likes_count_increase,
                    "comment_count_increase": comment_count_increase,
                    "save_count_increase": save_count_increase,
                    "hashtags": hashtags,
                    "caption": item["caption"]
                } if item["play_count"] is not None else None  # ビデオ情報がない場合はNullを返す
            })
        
        return {
            "success": True,
            "data": watchlist_with_details,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting video watchlist with details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        cursor.close()
        conn.close()

@router.get("/videos/trends")
async def get_video_watchlist_trends(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのウォッチリスト動画のトレンドデータを取得する"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            query = """
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """
            
            cursor.execute(query)
            dates = cursor.fetchall()
            
            if dates:
                # 利用可能なデータ期間を設定
                if not end_date:
                    end_date = dates[0]["collection_date"].strftime('%Y-%m-%d')
                if not start_date:
                    start_date = dates[-1]["collection_date"].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                if not end_date:
                    end_date = datetime.now().strftime('%Y-%m-%d')
                if not start_date:
                    start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        # ウォッチリストの動画IDを取得
        watchlist_query = """
        SELECT video_id 
        FROM video_watchlists 
        WHERE email = %s
        """
        
        cursor.execute(watchlist_query, (current_user.email,))
        watchlist_videos = cursor.fetchall()
        
        if not watchlist_videos:
            return {
                "success": True,
                "data": [],
                "period": {
                    "start_date": start_date,
                    "end_date": end_date
                }
            }
        
        # ウォッチリスト動画のIDリスト
        video_ids = [v["video_id"] for v in watchlist_videos]
        
        # プレースホルダーを生成
        placeholders = ', '.join(['%s'] * len(video_ids))
        
        # 各動画のトレンドデータを取得
        trend_query = f"""
        SELECT 
            h.video_id,
            h.collection_date,
            SUM(h.play_count_increase) as play_count_increase,
            v.account_name,
            SUM(h.likes_count_increase) as likes_count_increase,
            SUM(h.comment_count_increase) as comment_count_increase, 
            SUM(h.save_count_increase) as save_count_increase
        FROM 
            play_count_history h
        LEFT JOIN 
            frontend_data v ON h.video_id = v.video_id
        WHERE 
            h.video_id IN ({placeholders})
            AND h.collection_date BETWEEN %s AND %s
        GROUP BY 
            h.video_id, h.collection_date, v.account_name
        ORDER BY 
            h.video_id, h.collection_date
        """
        
        params = video_ids + [start_date, end_date]
        cursor.execute(trend_query, params)
        trend_results = cursor.fetchall()
        
        # 結果を整形
        trend_data = {}
        for row in trend_results:
            video_id = row["video_id"]
            if video_id not in trend_data:
                trend_data[video_id] = {
                    "video_id": video_id,
                    "account_name": row["account_name"],
                    "trends": []
                }
            
            # 日付フォーマットを変換
            collection_date = row["collection_date"]
            if isinstance(collection_date, datetime):
                date_str = collection_date.strftime('%Y-%m-%d')
            else:
                date_str = str(collection_date)
            
            trend_data[video_id]["trends"].append({
                "date": date_str,
                "play_count_increase": int(row["play_count_increase"]) if row["play_count_increase"] else 0,
                "likes_count_increase": int(row["likes_count_increase"]) if row["likes_count_increase"] else 0,
                "comment_count_increase": int(row["comment_count_increase"]) if row["comment_count_increase"] else 0,
                "save_count_increase": int(row["save_count_increase"]) if row["save_count_increase"] else 0
            })
        
        return {
            "success": True,
            "data": list(trend_data.values()),
            "period": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting video watchlist trends: {str(e)}")
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
            COUNT(DISTINCT fd.video_id) AS total_videos,
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