from fastapi import APIRouter, HTTPException
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection
from sqlalchemy.sql import text
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import json

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------- Pydantic Models ---------- #

class HashtagVideoStats(BaseModel):
    url: str
    thumbnail_url: Optional[str]
    play_count_increase: int
    likes_count_increase: int
    account_name: str
    display_name: str
    created_at: Optional[str]
    play_count: Optional[int]
    ten_days_increase: Optional[int]
    play_count_increase_2d: Optional[int]
    account_type: Optional[str]

class HashtagStats(BaseModel):
    hashtag: str
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[HashtagVideoStats]

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    """Google Storage URLをHTTPS URLに変換"""
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url

# ---------- /api/hashtag-stats ---------- #

@router.get("/api/hashtag-stats")
async def get_hashtag_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metric: str = "postCount",
    parent_account_type: Optional[str] = None
):
    """ハッシュタグ統計情報を取得するAPIエンドポイント"""
    logger.info(f"hashtag-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}, parent_account_type={parent_account_type}")
    print(f"hashtag-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}, parent_account_type={parent_account_type}")
    
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = get_db_connection()
        try:
            # ハッシュタグ日次サマリーテーブルから収集日を取得
            query = text("""
                SELECT DISTINCT fetch_date
                FROM hashtags_daily_summary_top150
                WHERE fetch_date IS NOT NULL
                ORDER BY fetch_date DESC
                LIMIT 7
            """)
            result = conn.execute(query)
            dates = result.fetchall()
        finally:
            conn.close()
        
        if dates:
            end_date = dates[0][0].strftime("%Y-%m-%d")
            start_date = dates[-1][0].strftime("%Y-%m-%d")
        else:
            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=18)).strftime("%Y-%m-%d")
        
        logger.info(f"Calculated date range: start_date={start_date}, end_date={end_date}")

    # 集約列→ORDER BY 用
    sort_column = {
        "viewsIncrease": "total_plays_increase",
        "over100kViews": "total_over_100k", 
        "postCount": "total_post_count"
    }.get(metric, "total_plays_increase")

    params = {"start_date": start_date, "end_date": end_date}
    
    # parent_account_typeフィルターの追加（hashtags_daily_summary_top150用）
    summary_parent_account_type_filter = ""
    if parent_account_type:
        summary_parent_account_type_filter = "AND hds.parent_account_type = :parent_account_type"
        params["parent_account_type"] = parent_account_type
    
    conn = None
    try:
        conn = get_db_connection()
        logger.info(f"Executing hashtag-stats query with metric: {metric}, sort_column: {sort_column}")
        print(f"Executing hashtag-stats query with metric: {metric}, sort_column: {sort_column}")

        # ハッシュタグサマリーテーブルから統計を取得（カラム名を修正）
        stats_sql = text(f"""
        SELECT
            hds.hashtags,
            SUM(hds.plays_increase) AS total_plays_increase,
            SUM(hds.over_100k) AS total_over_100k,
            SUM(hds.post_count) AS total_post_count
        FROM hashtags_daily_summary_top150 hds
        WHERE hds.fetch_date BETWEEN :start_date AND :end_date
          AND hds.hashtags IS NOT NULL 
          AND hds.hashtags != ''
          {summary_parent_account_type_filter}
        GROUP BY hds.hashtags
        ORDER BY {sort_column} DESC
        LIMIT 50
        """)
        
        result = conn.execute(stats_sql, params)
        summary_results = result.mappings().all()

        # 辞書に変換してハッシュタグ統計を作成
        stats = {}
        hashtags = []
        
        for r in summary_results:
            hashtag = r["hashtags"]  # カラム名を修正
            hashtags.append(hashtag)
            stats[hashtag] = {
                "hashtag": hashtag,
                "total_play_count_increase": r["total_plays_increase"],
                "videos_over_100k": r["total_over_100k"], 
                "total_posts": r["total_post_count"],
                "top_videos": []
            }

        # 各ハッシュタグのトップ動画を取得
        if hashtags:
            # プレースホルダとパラメータを準備
            hashtag_placeholders = []
            for i, hashtag in enumerate(hashtags):
                placeholder = f"hashtag_{i}"
                hashtag_placeholders.append(f":{placeholder}")
                params[placeholder] = hashtag
            
            # parent_account_typeフィルターの追加（hashtags_daily_top100_videos用）
            videos_parent_account_type_filter = ""
            if parent_account_type:
                videos_parent_account_type_filter = "AND hdv.parent_account_type = :parent_account_type"
            
            # ハッシュタグ関連動画の詳細情報を取得（期間合計でソート）
            videos_sql = text(f"""
            SELECT 
                hdv.hashtags,
                hdv.video_id,
                fd.url,
                fd.thumbnail_url,
                SUM(hdv.plays_increase) AS total_play_inc,
                SUM(hdv.likes_increase) AS total_like_inc,
                MAX(hdv.post_time) AS created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                fd.play_count_increase,
                fd.account_type
            FROM hashtags_daily_top100_videos hdv
            JOIN frontend_data fd ON fd.video_id = hdv.video_id
            WHERE hdv.fetch_date BETWEEN :start_date AND :end_date
              AND hdv.hashtags IN ({', '.join(hashtag_placeholders)})
              {videos_parent_account_type_filter}
            GROUP BY hdv.hashtags, hdv.video_id, fd.url, fd.thumbnail_url, 
                     fd.play_count, fd.ten_days_increase, fd.account_name, 
                     fd.display_name, fd.play_count_increase, fd.account_type
            ORDER BY hdv.hashtags, total_play_inc DESC
            """)
            
            videos_result = conn.execute(videos_sql, params)
            video_rows = videos_result.mappings().all()
            
            # 各ハッシュタグごとに上位20件のトップ動画を追加
            hashtag_video_counts = {hashtag: 0 for hashtag in hashtags}
            
            for video in video_rows:
                hashtag = video["hashtags"]  # カラム名を修正
                if hashtag in stats and hashtag_video_counts[hashtag] < 20:
                    stats[hashtag]["top_videos"].append({
                        "url": video["url"],
                        "thumbnail_url": convert_gs_to_https(video["thumbnail_url"]),
                        "play_count_increase": video["total_play_inc"],
                        "likes_count_increase": video["total_like_inc"],
                        "created_at": video["created_at"],
                        "play_count": video["play_count"],
                        "ten_days_increase": video["ten_days_increase"],
                        "account_name": video["account_name"],
                        "display_name": video["display_name"],
                        "play_count_increase_2d": video["play_count_increase"],
                        "account_type": video["account_type"]
                    })
                    hashtag_video_counts[hashtag] += 1

        logger.info(f"Hashtag stats query returned {len(stats)} hashtags")
        print(f"Hashtag stats query returned {len(stats)} hashtags")
        
        # レスポンス返却
        response_data = {
            "data": list(stats.values()),
            "date_range": {
                "start_date": start_date, 
                "end_date": end_date
            }
        }
        return JSONResponse(content=jsonable_encoder(response_data))
        
    except Exception as e:
        logger.error(f"Error fetching hashtag stats: {str(e)}", exc_info=True)
        print(f"Error fetching hashtag stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close() 