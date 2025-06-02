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

# ---------- Pydantic ---------- #

class VideoStats(BaseModel):
    url: str
    thumbnail_url: Optional[str]
    play_count_increase: int
    account_name: str
    display_name: str

class GenreStats(BaseModel):
    genre: str
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[VideoStats]

class GenreTrendData(BaseModel):
    date: str
    genre: str
    metrics: dict

class GenreTrendResponse(BaseModel):
    data: List[GenreTrendData]
    genres: List[str]
    date_range: Optional[dict]

# ---------- util ---------- #

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    if url and url.startswith("gs://"):
        b, *p = url.split("/")[2:]
        return f"https://storage.googleapis.com/{b}/{'/'.join(p)}"
    return url

# ---------- /api/genre-stats ---------- #

@router.get("/api/genre-stats")
async def get_genre_stats(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    metric:     str = "viewsIncrease"
):
    # リクエストパラメータのログ出力を追加
    logger.info(f"genre-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}")
    print(f"genre-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}")
    
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = get_db_connection()
        query = text("""
            SELECT DISTINCT fetch_date
            FROM genre_daily_summary
            WHERE fetch_date IS NOT NULL
            ORDER BY fetch_date DESC
            LIMIT 7
        """)
        result = conn.execute(query)
        dates = result.fetchall()
        conn.close()
        
        end_date = dates[0][0].strftime("%Y-%m-%d") if dates else datetime.now().strftime("%Y-%m-%d")
        start_date = dates[-1][0].strftime("%Y-%m-%d") if dates else (datetime.now()-timedelta(days=18)).strftime("%Y-%m-%d")
        logger.info(f"Calculated date range: {start_date=}  {end_date=}")

    # 集約列→ORDER BY 用
    sort_column = {
        "viewsIncrease": "total_plays_increase",
        "over100kViews": "total_over_100k",
        "postCount":     "total_post_count"
    }.get(metric, "total_plays_increase")

    params = {"start_date": start_date, "end_date": end_date}
    
    conn = None
    try:
        conn = get_db_connection()
        logger.info(f"Executing genre-stats query with metric: {metric}, sort_column: {sort_column}")
        print(f"Executing genre-stats query with metric: {metric}, sort_column: {sort_column}")

        # サマリテーブルから直接ジャンル統計を取得
        stats_sql = text(f"""
        SELECT
            video_genre AS genre,
            SUM(plays_increase) AS total_plays_increase,
            SUM(over_100k) AS total_over_100k,
            SUM(post_count) AS total_post_count
        FROM genre_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        GROUP BY video_genre
        ORDER BY {sort_column} DESC
        LIMIT 12
        """)
        
        result = conn.execute(stats_sql, params)
        all_results = result.mappings().all()

        # 「その他」と空文字の処理も調整
        has_other_in_top10 = any(r["genre"] == "その他" for r in all_results[:10])
        has_empty_in_top10 = any(r["genre"] == "" for r in all_results[:10])

        # 条件に応じて表示件数を変える
        if has_other_in_top10 and has_empty_in_top10:
            limited_results = all_results  # 12件すべて使用
        elif has_other_in_top10 or has_empty_in_top10:
            limited_results = all_results[:11]  # 11件使用
        else:
            limited_results = all_results[:10]  # 10件使用

        # 辞書に変換
        stats = {r["genre"]: {
            "genre"                       : r["genre"],
            "total_play_count_increase"   : r["total_plays_increase"],
            "videos_over_100k"            : r["total_over_100k"],
            "total_posts"                 : r["total_post_count"],
            "top_videos"                  : []
        } for r in limited_results}

        # genre_daily_top100_videosテーブルから各ジャンルのTOP10動画を取得
        top_sql = text("""
            SELECT 
                video_genre AS genre,
                video_id,
                url,
                thumbnail_url,
                plays_increase,
                likes_increase,
                account_name,
                display_name,
                post_time AS created_at,
                play_count,
                ten_days_increase
            FROM (
                SELECT 
                    t.*,
                    fd.url,
                    fd.account_name,
                    fd.display_name,
                    fd.play_count,
                    fd.ten_days_increase,
                    ROW_NUMBER() OVER (PARTITION BY product ORDER BY plays_increase DESC) rn
                FROM genre_daily_top100_videos t
                JOIN frontend_data fd ON fd.video_id = t.video_id
                WHERE t.fetch_date = :end_date
                AND t.video_genre IN :genres
            ) ranked
            WHERE rn <= 10
        """)
        
        # ジャンル名のリストをタプルに変換
        genre_names = tuple(stats.keys())
        result = conn.execute(top_sql, {"end_date": end_date, "genres": genre_names})
        
        for v in result.mappings().all():
            genre = v["genre"]
            if genre in stats:
                g = stats[genre]
                g["top_videos"].append({
                    "url"                 : v["url"],
                    "thumbnail_url"       : convert_gs_to_https(v["thumbnail_url"]),
                    "play_count_increase" : v["plays_increase"],
                    "likes_count_increase": v["likes_increase"],
                    "created_at"          : v["created_at"],
                    "play_count"          : v["play_count"],
                    "ten_days_increase"   : v["ten_days_increase"],
                    "account_name"        : v["account_name"],
                    "display_name"        : v["display_name"]
                })

        # ログを追加
        logger.info(f"Genre stats query returned {len(stats)} genres")
        print(f"Genre stats query returned {len(stats)} genres")
        
        # レスポンス返却
        resp = {
            "data": list(stats.values()),
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        return JSONResponse(content=jsonable_encoder(resp))
    except Exception as e:
        logger.error(f"Error fetching genre stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ---------- /api/genre-trends ---------- #

@router.get("/api/genre-trends")
async def get_genre_trends(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    metric:     str = "viewsIncrease"
):
    # リクエストパラメータのログ出力を追加
    logger.info(f"genre-trends API called with params: start_date={start_date}, end_date={end_date}, metric={metric}")
    print(f"genre-trends API called with params: start_date={start_date}, end_date={end_date}, metric={metric}")
    
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = None
        try:
            conn = get_db_connection()
            query = text("""
                SELECT DISTINCT fetch_date
                FROM genre_daily_summary
                WHERE fetch_date IS NOT NULL
                ORDER BY fetch_date DESC
                LIMIT 7
            """)
            result = conn.execute(query)
            dates = result.fetchall()
        finally:
            if conn:
                conn.close()

        end_date = dates[0][0].strftime("%Y-%m-%d") if dates else datetime.now().strftime("%Y-%m-%d")
        start_date = dates[-1][0].strftime("%Y-%m-%d") if dates else (datetime.now()-timedelta(days=18)).strftime("%Y-%m-%d")
        logger.info(f"Calculated date range: {start_date=}  {end_date=}")

    # メトリックに応じたカラム名を設定
    metric_column = {
        "viewsIncrease": "plays_increase",
        "over100kViews": "over_100k",
        "postCount": "post_count"
    }[metric]

    conn = None
    try:
        conn = get_db_connection()
        logger.info(f"Executing genre-trends query with metric: {metric}")
        print(f"Executing genre-trends query with metric: {metric}")

        # 1. まず人気トップ10ジャンルを取得
        top_genres_sql = text(f"""
        SELECT 
            video_genre AS genre,
            SUM({metric_column}) AS metric_value
        FROM genre_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        GROUP BY video_genre
        ORDER BY metric_value DESC
        LIMIT 12
        """)
        
        result = conn.execute(top_genres_sql, {"start_date": start_date, "end_date": end_date})
        top_genres = [row["genre"] for row in result.mappings().all()]

        # 「その他」や空文字列を除外
        excluded_genres = ["その他", ""]
        filtered_genres = [g for g in top_genres if g not in excluded_genres and g.strip() != ""][:10]

        if not filtered_genres:
            # フィルタリング後にジャンルがなくなった場合の対応
            return JSONResponse(content=jsonable_encoder({
                "data": [],
                "genres": [],
                "date_range": {"start_date": start_date, "end_date": end_date}
            }))

        # 2. 日別・ジャンル別のデータを取得
        trends_sql = text("""
        SELECT
            fetch_date AS date,
            video_genre AS genre,
            plays_increase AS viewsIncrease,
            over_100k AS over100kViews,
            post_count AS postCount
        FROM genre_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        AND video_genre IN :genres
        ORDER BY fetch_date, video_genre
        """)
        
        result = conn.execute(trends_sql, {"start_date": start_date, "end_date": end_date, "genres": tuple(filtered_genres)})
        rows = result.mappings().all()

        # トレンドデータを整形
        trend_data = [{
            "date": r["date"].strftime("%Y-%m-%d"),
            "genre": r["genre"],
            # valueフィールドを追加
            "value": int(r[{
                "viewsIncrease": "viewsIncrease",
                "over100kViews": "over100kViews",
                "postCount": "postCount"
            }[metric]]),
            "metrics": {
                "viewsIncrease": int(r["viewsIncrease"]),
                "over100kViews": int(r["over100kViews"]),
                "postCount": int(r["postCount"])
            }
        } for r in rows]

        resp = {
            "data": trend_data,
            "genres": filtered_genres,
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        
        # レスポンス返却前にログ
        logger.info(f"Returning {len(trend_data)} data points for {len(resp['genres'])} genres")
        print(f"Returning {len(trend_data)} data points for {len(resp['genres'])} genres")
        return JSONResponse(content=jsonable_encoder(resp))
    except Exception as e:
        logger.error(f"Error fetching genre trends: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


  
