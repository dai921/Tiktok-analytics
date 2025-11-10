from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from src.db.database import get_db_connection
from sqlalchemy.sql import text
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
    video_watchlist_name: Optional[str] = None

class VideoWatchlistResponse(BaseModel):
    id: int
    email: str
    video_id: str  # ビデオのURL
    video_watchlist_name: Optional[str] = None
    created_at: str
    updated_at: str

# アカウントブックマークのモデル
class AccountBookmarkItem(BaseModel):
    account_name: str
    account_watchlist_name: Optional[str] = None

class AccountBookmarkResponse(BaseModel):
    id: int
    email: str
    account_name: str
    account_watchlist_name: Optional[str] = None
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
    
    try:
        # 同じビデオが既に登録されているか確認
        query = text(
            "SELECT * FROM video_watchlists WHERE email = :email AND video_id = :video_id"
        )
        result = conn.execute(query, {"email": current_user.email, "video_id": video_item.video_id})
        existing = result.mappings().first()
        
        if existing:
            # 既存の登録を更新
            update_query = text(
                """
                UPDATE video_watchlists 
                SET video_watchlist_name = :video_watchlist_name, updated_at = NOW()
                WHERE id = :id
                """
            )
            conn.execute(update_query, {
                "video_watchlist_name": video_item.video_watchlist_name, 
                "id": existing["id"]
            })
            id = existing["id"]
        else:
            # 新規登録
            insert_query = text(
                """
                INSERT INTO video_watchlists (email, video_id, video_watchlist_name)
                VALUES (:email, :video_id, :video_watchlist_name)
                """
            )
            result = conn.execute(insert_query, {
                "email": current_user.email, 
                "video_id": video_item.video_id, 
                "video_watchlist_name": video_item.video_watchlist_name
            })
            id = result.lastrowid
        
        conn.commit()
        
        # 登録された情報を取得
        select_query = text(
            "SELECT * FROM video_watchlists WHERE id = :id"
        )
        result = conn.execute(select_query, {"id": id})
        result_row = result.mappings().first()
        
        return {
            "id": result_row["id"],
            "email": result_row["email"],
            "video_id": result_row["video_id"],
            "video_watchlist_name": result_row["video_watchlist_name"],
            "created_at": result_row["created_at"].isoformat(),
            "updated_at": result_row["updated_at"].isoformat()
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error adding video to watchlist: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        conn.close()

@router.delete("/videos/{video_id}")
async def remove_video_from_watchlist(
    video_id: str,
    current_user: User = Depends(get_current_user)
):
    """ビデオをウォッチリストから削除する"""
    conn = get_db_connection()
    
    try:
        # ビデオが存在するか確認
        check_query = text(
            "SELECT * FROM video_watchlists WHERE email = :email AND video_id = :video_id"
        )
        result = conn.execute(check_query, {"email": current_user.email, "video_id": video_id})
        if not result.first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたビデオはウォッチリストに存在しません"
            )
        
        # ウォッチリストから削除
        delete_query = text(
            "DELETE FROM video_watchlists WHERE email = :email AND video_id = :video_id"
        )
        conn.execute(delete_query, {"email": current_user.email, "video_id": video_id})
        
        conn.commit()
        print(f"[DELETE][ビデオウォッチリスト] email={current_user.email} video_id={video_id} ts={datetime.utcnow().isoformat()}")
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
        conn.close()

@router.get("/videos", response_model=List[VideoWatchlistResponse])
async def get_video_watchlist(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのビデオウォッチリストを取得する"""
    conn = get_db_connection()
    
    try:
        query = text(
            "SELECT * FROM video_watchlists WHERE email = :email ORDER BY updated_at DESC"
        )
        result = conn.execute(query, {"email": current_user.email})
        results = result.mappings().all()
        
        watchlist = []
        for item in results:
            watchlist.append({
                "id": item["id"],
                "email": item["email"],
                "video_id": item["video_id"],
                "video_watchlist_name": item["video_watchlist_name"],
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
        conn.close()

@router.get("/videos/details")
async def get_video_watchlist_with_details(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのビデオウォッチリストを詳細情報付きで取得する"""
    conn = get_db_connection()
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            dates_query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(dates_query)
            dates = result.mappings().all()
            
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
        # 日付条件はJOIN句に付与してLEFT JOIN特性を維持する
        base_query = """
        SELECT 
            vw.id, vw.email, vw.video_id, vw.video_watchlist_name, vw.created_at, vw.updated_at,
            fd.thumbnail_url, fd.created_at as video_created_at, fd.play_count, 
            SUM(pch.play_count_increase) as play_count_increase,
            SUM(pch.likes_count_increase) as likes_count_increase,
            SUM(pch.comment_count_increase) as comment_count_increase,
            SUM(pch.save_count_increase) as save_count_increase,
            fd.account_name, fd.display_name, fd.content_type,
            fd.likes_count, fd.comment_count, fd.save_count, fd.hashtags, fd.caption
        FROM video_watchlists vw
        LEFT JOIN frontend_data fd ON vw.video_id = fd.video_id
        LEFT JOIN play_count_history pch ON vw.video_id = pch.video_id {pch_date_condition}
        WHERE vw.email = :email
        """

        pch_date_condition = ""
        params = {"email": current_user.email}

        # 日付範囲が指定されている場合、JOIN句に条件を付与
        if start_date and end_date:
            pch_date_condition = "AND pch.collection_date BETWEEN :start_date AND :end_date"
            params.update({"start_date": start_date, "end_date": end_date})

        query = text(base_query.format(pch_date_condition=pch_date_condition))
            
        query = text(query.text + """
        GROUP BY 
            vw.id, vw.email, vw.video_id, vw.video_watchlist_name, vw.created_at, vw.updated_at,
            fd.thumbnail_url, fd.created_at, fd.play_count, fd.account_name, fd.display_name, 
            fd.content_type, fd.likes_count, fd.comment_count, fd.save_count, fd.hashtags, fd.caption
        ORDER BY vw.updated_at DESC
        """)
        
        result = conn.execute(query, params)
        results = result.mappings().all()
        
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
                    "id": item["id"],
                    "email": item["email"],
                    "video_id": item["video_id"],
                    "video_watchlist_name": item["video_watchlist_name"],
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
        conn.close()

@router.get("/videos/trends")
async def get_video_watchlist_trends(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのウォッチリスト動画のトレンドデータを取得する"""
    conn = get_db_connection()
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            dates_query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(dates_query)
            dates = result.mappings().all()
            
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
        watchlist_query = text("""
        SELECT video_id 
        FROM video_watchlists 
        WHERE email = :email
        """)
        
        result = conn.execute(watchlist_query, {"email": current_user.email})
        watchlist_videos = result.mappings().all()
        
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
        
        # 各動画のトレンドデータを取得
        trend_query = text(f"""
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
            h.video_id IN :video_ids
            AND h.collection_date BETWEEN :start_date AND :end_date
        GROUP BY 
            h.video_id, h.collection_date, v.account_name
        ORDER BY 
            h.video_id, h.collection_date
        """)
        
        params = {"video_ids": tuple(video_ids), "start_date": start_date, "end_date": end_date}
        result = conn.execute(trend_query, params)
        trend_results = result.mappings().all()
        
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
        conn.close()

# アカウントブックマーク関連のAPI
@router.post("/accounts", response_model=AccountBookmarkResponse)
async def add_account_to_bookmarks(
    account_item: AccountBookmarkItem,
    current_user: User = Depends(get_current_user)
):
    """アカウントをブックマークに追加する"""
    conn = get_db_connection()
    
    try:
        # 同じアカウントが既に登録されているか確認
        check_query = text(
            "SELECT * FROM account_watchlists WHERE email = :email AND account_name = :account_name"
        )
        result = conn.execute(check_query, {
            "email": current_user.email, 
            "account_name": account_item.account_name
        })
        existing = result.mappings().first()
        
        if existing:
            # 既存の登録を更新
            update_query = text(
                """
                UPDATE account_watchlists 
                SET account_watchlist_name = :account_watchlist_name, updated_at = NOW()
                WHERE id = :id
                """
            )
            conn.execute(update_query, {
                "account_watchlist_name": account_item.account_watchlist_name, 
                "id": existing["id"]
            })
            id = existing["id"]
        else:
            # 新規登録
            insert_query = text(
                """
                INSERT INTO account_watchlists (email, account_name, account_watchlist_name)
                VALUES (:email, :account_name, :account_watchlist_name)
                """
            )
            result = conn.execute(insert_query, {
                "email": current_user.email, 
                "account_name": account_item.account_name, 
                "account_watchlist_name": account_item.account_watchlist_name
            })
            id = result.lastrowid
        
        conn.commit()
        
        # 登録された情報を取得
        select_query = text(
            "SELECT * FROM account_watchlists WHERE id = :id"
        )
        result = conn.execute(select_query, {"id": id})
        result_row = result.mappings().first()
        
        return {
            "id": result_row["id"],
            "email": result_row["email"],
            "account_name": result_row["account_name"],
            "account_watchlist_name": result_row["account_watchlist_name"],
            "created_at": result_row["created_at"].isoformat(),
            "updated_at": result_row["updated_at"].isoformat()
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error adding account to bookmarks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        conn.close()

@router.delete("/accounts/{account_name}")
async def remove_account_from_bookmarks(
    account_name: str,
    current_user: User = Depends(get_current_user)
):
    """アカウントをブックマークから削除する"""
    conn = get_db_connection()
    
    try:
        # アカウントが存在するか確認
        check_query = text(
            "SELECT * FROM account_watchlists WHERE email = :email AND account_name = :account_name"
        )
        result = conn.execute(check_query, {"email": current_user.email, "account_name": account_name})
        if not result.first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたアカウントはブックマークに存在しません"
            )
        
        # ブックマークから削除
        delete_query = text(
            "DELETE FROM account_watchlists WHERE email = :email AND account_name = :account_name"
        )
        conn.execute(delete_query, {"email": current_user.email, "account_name": account_name})
        
        conn.commit()
        print(f"[DELETE][アカウントウォッチリスト] email={current_user.email} account_name={account_name} ts={datetime.utcnow().isoformat()}")
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
        conn.close()

@router.get("/accounts", response_model=List[AccountBookmarkResponse])
async def get_account_bookmarks(
    current_user: User = Depends(get_current_user)
):
    """ユーザーのアカウントブックマークを取得する"""
    conn = get_db_connection()
    
    try:
        query = text(
            "SELECT * FROM account_watchlists WHERE email = :email ORDER BY updated_at DESC"
        )
        result = conn.execute(query, {"email": current_user.email})
        results = result.mappings().all()
        
        bookmarks = []
        for item in results:
            bookmarks.append({
                "id": item["id"],
                "email": item["email"],
                "account_name": item["account_name"],
                "account_watchlist_name": item["account_watchlist_name"],
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
        conn.close()

@router.get("/accounts/details")
async def get_account_bookmarks_with_details(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのアカウントブックマークをアカウント詳細情報付きで取得する"""
    conn = get_db_connection()
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            dates_query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(dates_query)
            dates = result.mappings().all()
            
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
        
        # アカウントブックマークとアカウント集計データを結合して取得（期間条件はJOIN句に付与）
        base_query = """
        SELECT 
            ab.id, ab.email, ab.account_name, ab.account_watchlist_name, ab.created_at, ab.updated_at,
            COUNT(DISTINCT fd.video_id) AS total_videos,
            SUM(fd.play_count) AS total_plays,
            SUM(pch.play_count_increase) AS total_play_increase,
            SUM(pch.likes_count_increase) AS total_likes_increase,
            SUM(pch.comment_count_increase) AS total_comments_increase,
            SUM(pch.save_count_increase) AS total_saves_increase,
            MAX(fd.display_name) AS display_name,
            MAX(al.account_type) AS account_type
        FROM account_watchlists ab
        LEFT JOIN frontend_data fd ON ab.account_name = fd.account_name
        LEFT JOIN play_count_history pch ON fd.video_id = pch.video_id {pch_date_condition}
        LEFT JOIN account_list al ON ab.account_name = al.favorite_user_username
        WHERE ab.email = :email
        """

        pch_date_condition = ""
        params = {"email": current_user.email}

        # 日付範囲が指定されている場合、JOIN句に条件を付与
        if start_date and end_date:
            pch_date_condition = "AND pch.collection_date BETWEEN :start_date AND :end_date"
            params.update({"start_date": start_date, "end_date": end_date})

        query = text(base_query.format(pch_date_condition=pch_date_condition))
        
        query = text(query.text + """
        GROUP BY ab.id, ab.email, ab.account_name, ab.account_watchlist_name, ab.created_at, ab.updated_at
        ORDER BY ab.updated_at DESC
        """)
        
        result = conn.execute(query, params)
        results = result.mappings().all()
        
        bookmarks_with_details = []
        for item in results:
            bookmarks_with_details.append({
                "bookmark": {
                    "id": item["id"],
                    "email": item["email"],
                    "account_name": item["account_name"],
                    "account_watchlist_name": item["account_watchlist_name"],
                    "created_at": item["created_at"].isoformat(),
                    "updated_at": item["updated_at"].isoformat()
                },
                "account": {
                    "account_name": item["account_name"],
                    "display_name": item["display_name"],
                    "account_type": item["account_type"],
                    "total_videos": int(item["total_videos"]) if item["total_videos"] else 0,
                    "total_plays": int(item["total_plays"]) if item["total_plays"] else 0,
                    "total_play_increase": int(item["total_play_increase"]) if item["total_play_increase"] else 0,
                    "total_likes_increase": int(item["total_likes_increase"]) if item["total_likes_increase"] else 0,
                    "total_comments_increase": int(item["total_comments_increase"]) if item["total_comments_increase"] else 0,
                    "total_saves_increase": int(item["total_saves_increase"]) if item["total_saves_increase"] else 0
                } if item["total_videos"] else None  # アカウントデータがない場合はNullを返す
            })
        
        return {
            "success": True,
            "data": bookmarks_with_details,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting account bookmarks with details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        conn.close()

@router.get("/accounts/trends")
async def get_account_trends(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）")
):
    """ユーザーのアカウントブックマークのトレンドデータを取得する"""
    conn = get_db_connection()
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近7回分のデータ）
        if not start_date or not end_date:
            # 収集日の一覧を取得
            dates_query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(dates_query)
            dates = result.mappings().all()
            
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
                    start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        # ブックマークされているアカウント名を取得
        bookmark_query = text("""
        SELECT account_name 
        FROM account_watchlists 
        WHERE email = :email
        """)
        
        result = conn.execute(bookmark_query, {"email": current_user.email})
        bookmarked_accounts = result.mappings().all()
        
        if not bookmarked_accounts:
            return {
                "success": True,
                "data": [],
                "period": {
                    "start_date": start_date,
                    "end_date": end_date
                }
            }
        
        # ブックマークされているアカウント名のリスト
        account_names = [account["account_name"] for account in bookmarked_accounts]
        
        # 各アカウントのトレンドデータを取得
        trend_query = text("""
        SELECT 
            fd.account_name,
            fd.display_name,
            pch.collection_date,
            SUM(pch.play_count_increase) as play_count_increase,
            SUM(pch.likes_count_increase) as likes_count_increase,
            SUM(pch.comment_count_increase) as comment_count_increase, 
            SUM(pch.save_count_increase) as save_count_increase
        FROM 
            frontend_data fd
        LEFT JOIN 
            play_count_history pch ON fd.video_id = pch.video_id
        WHERE 
            fd.account_name IN :account_names
            AND pch.collection_date BETWEEN :start_date AND :end_date
        GROUP BY 
            fd.account_name, fd.display_name, pch.collection_date
        ORDER BY 
            fd.account_name, pch.collection_date
        """)
        
        params = {
            "account_names": tuple(account_names), 
            "start_date": start_date, 
            "end_date": end_date
        }
        result = conn.execute(trend_query, params)
        trend_results = result.mappings().all()
        
        # 結果を整形
        trend_data = {}
        for row in trend_results:
            account_name = row["account_name"]
            if account_name not in trend_data:
                trend_data[account_name] = {
                    "account_name": account_name,
                    "display_name": row["display_name"],
                    "trends": []
                }
            
            # 日付フォーマットを変換
            collection_date = row["collection_date"]
            if isinstance(collection_date, datetime):
                date_str = collection_date.strftime('%Y-%m-%d')
            else:
                date_str = str(collection_date)
            
            trend_data[account_name]["trends"].append({
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
        logger.error(f"Error getting account trends: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        conn.close()

@router.get("/accounts/videos")
async def get_account_videos(
    current_user: User = Depends(get_current_user),
    account_name: str = Query(..., description="アカウント名"),
    start_date: Optional[str] = Query(None, description="開始日（YYYY-MM-DD形式）"),
    end_date: Optional[str] = Query(None, description="終了日（YYYY-MM-DD形式）"),
    sort_by: str = Query("play_count_increase", description="ソート基準")
):
    """指定されたアカウントの動画一覧を取得する"""
    conn = get_db_connection()
    
    try:
        # デフォルトの期間を設定（指定がない場合は直近30日分のデータ）
        if not start_date or not end_date:
            # 現在の日付を取得
            today = datetime.now()
            
            if not end_date:
                end_date = today.strftime('%Y-%m-%d')
            if not start_date:
                start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
        
        # ソート基準の検証
        valid_sort_fields = ["play_count_increase", "likes_count_increase", "comment_count_increase", "save_count_increase"]
        if sort_by not in valid_sort_fields:
            sort_by = "play_count_increase"  # デフォルト値
        
        # アカウントの動画一覧を取得（期間条件はJOIN句に付与）
        base_query = """
        SELECT 
            fd.video_id, fd.thumbnail_url, fd.url,
            fd.play_count, fd.likes_count, fd.comment_count, fd.save_count,
            SUM(pch.play_count_increase) as play_count_increase,
            SUM(pch.likes_count_increase) as likes_count_increase,
            SUM(pch.comment_count_increase) as comment_count_increase,
            SUM(pch.save_count_increase) as save_count_increase,
            fd.created_at, fd.account_name, fd.display_name
        FROM 
            frontend_data fd
        LEFT JOIN 
            play_count_history pch ON fd.video_id = pch.video_id {pch_date_condition}
        WHERE 
            fd.account_name = :account_name
        """

        pch_date_condition = ""
        params = {"account_name": account_name}

        # 日付範囲が指定されている場合、JOIN句に条件を付与
        if start_date and end_date:
            pch_date_condition = "AND pch.collection_date BETWEEN :start_date AND :end_date"
            params.update({"start_date": start_date, "end_date": end_date})

        query = text(base_query.format(pch_date_condition=pch_date_condition))
        
        query = text(query.text + f"""
        GROUP BY 
            fd.video_id, fd.thumbnail_url, fd.url, fd.play_count, fd.likes_count, fd.comment_count, fd.save_count,
            fd.created_at, fd.account_name, fd.display_name
        ORDER BY 
            {sort_by} DESC
        LIMIT 10
        """)
        
        result = conn.execute(query, params)
        results = result.mappings().all()
        
        videos = []
        for item in results:
            # サムネイルURLの処理
            thumbnail_url = item.get("thumbnail_url")
            if thumbnail_url and isinstance(thumbnail_url, str) and thumbnail_url.startswith('gs://'):
                parts = thumbnail_url.split('/')
                bucket = parts[2]
                object_path = '/'.join(parts[3:])
                thumbnail_url = f"https://storage.googleapis.com/{bucket}/{object_path}"
            
            # 作成日時の処理
            created_at = item.get("created_at")
            if created_at:
                created_at = created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at)
            
            videos.append({
                "video_id": item["video_id"],
                "thumbnail_url": thumbnail_url,
                "url": item["url"],
                "play_count": int(item["play_count"]) if item["play_count"] else 0,
                "likes_count": int(item["likes_count"]) if item["likes_count"] else 0,
                "comment_count": int(item["comment_count"]) if item["comment_count"] else 0,
                "save_count": int(item["save_count"]) if item["save_count"] else 0,
                "play_count_increase": int(item["play_count_increase"]) if item["play_count_increase"] else 0,
                "likes_count_increase": int(item["likes_count_increase"]) if item["likes_count_increase"] else 0,
                "comment_count_increase": int(item["comment_count_increase"]) if item["comment_count_increase"] else 0,
                "save_count_increase": int(item["save_count_increase"]) if item["save_count_increase"] else 0,
                "created_at": created_at,
                "account_name": item["account_name"],
                "display_name": item["display_name"]
            })
        
        # クライアントにデータを返す
        return {
            "success": True,
            "data": videos
        }
        
    except Exception as e:
        logger.error(f"Error getting account videos: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        conn.close() 