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
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = get_db_connection()
        query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
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
        "viewsIncrease": "total_play_inc",
        "over100kViews": "over100k_cnt",
        "postCount":     "post_cnt"
    }.get(metric, "total_play_inc")

    conn = None
    try:
        conn = get_db_connection()
        logger.info("Executing genre-stats query")

        # 既存の一時テーブルを削除
        conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_gen_base"))

        # ---------- ここから変更 ---------- #
        # ① explode → genre×video を一次表に
        conn.execute(text("""
            CREATE TEMPORARY TABLE tmp_gen_base (
                genre              VARCHAR(255),
                video_id           BIGINT UNSIGNED,
                play_inc           INT,
                like_inc           INT,
                created_at         DATETIME,
                play_count         INT,
                ten_days_increase  INT,
                account_name       VARCHAR(255),
                display_name       VARCHAR(255),
                url                TEXT,
                thumbnail_url      TEXT,
                PRIMARY KEY (genre, video_id),
                INDEX idx_g      (genre),
                INDEX idx_g_inc  (genre, play_inc DESC)
            ) ENGINE=InnoDB
        """))

        insert_sql = text("""
        INSERT INTO tmp_gen_base
        SELECT
            TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre,
            fd.video_id,
            SUM(pch.play_count_increase)  AS play_inc,
            SUM(pch.likes_count_increase) AS like_inc,
            ANY_VALUE(fd.created_at) AS created_at,
            ANY_VALUE(fd.play_count) AS play_count,
            ANY_VALUE(fd.ten_days_increase) AS ten_days_increase,
            ANY_VALUE(fd.account_name) AS account_name,
            ANY_VALUE(fd.display_name) AS display_name,
            ANY_VALUE(fd.url) AS url,
            ANY_VALUE(fd.thumbnail_url) AS thumbnail_url
        FROM play_count_history pch
        JOIN frontend_data fd ON fd.video_id = pch.video_id
        CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3
                    UNION ALL SELECT 4 UNION ALL SELECT 5) n
        WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
        AND fd.category IS NOT NULL
        AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        AND pch.collection_date BETWEEN :start_date AND :end_date
        GROUP BY genre, fd.video_id
        """)
        conn.execute(insert_sql, {"start_date": start_date, "end_date": end_date})

        # ② genre サマリ
        stats_sql = text(f"""
            SELECT
                genre,
                SUM(play_inc)           AS total_play_inc,
                SUM(play_inc>=100000)   AS over100k_cnt,
                COUNT(*)                AS post_cnt
            FROM tmp_gen_base
            GROUP BY genre
            ORDER BY {sort_column} DESC
        """)
        result = conn.execute(stats_sql)
        stats = {r["genre"]: {
            "genre"                       : r["genre"],
            "total_play_count_increase"   : r["total_play_inc"],
            "videos_over_100k"            : r["over100k_cnt"],
            "total_posts"                 : r["post_cnt"],
            "top_videos"                  : []
        } for r in result.mappings().all()}

        # ③ 各 genre の TOP10
        top_sql = text("""
            SELECT *
            FROM (
                SELECT
                    genre, url, thumbnail_url,
                    play_inc, like_inc,
                    created_at, play_count, ten_days_increase,
                    account_name, display_name,
                    ROW_NUMBER() OVER (PARTITION BY genre ORDER BY play_inc DESC) rn
                FROM tmp_gen_base
            ) t WHERE rn <= 10
        """)
        result = conn.execute(top_sql)
        for v in result.mappings().all():
            g = stats[v["genre"]]
            g["top_videos"].append({
                "url"                 : v["url"],
                "thumbnail_url"       : convert_gs_to_https(v["thumbnail_url"]),
                "play_count_increase" : v["play_inc"],
                "likes_count_increase": v["like_inc"],
                "created_at"          : v["created_at"],
                "play_count"          : v["play_count"],
                "ten_days_increase"   : v["ten_days_increase"],
                "account_name"        : v["account_name"],
                "display_name"        : v["display_name"]
            })
        ### ここまで変更 ###

        # 一時テーブルを削除
        conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_gen_base"))

        resp = {
            "data": list(stats.values()),
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        return JSONResponse(content=jsonable_encoder(resp))
    except Exception as e:
        logger.error(f"Error fetching genre stats: {str(e)}", exc_info=True)
        # エラーが発生した場合でも一時テーブルを削除する
        try:
            if conn:
                conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_gen_base"))
        except Exception:
            pass
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
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = None
        try:
            conn = get_db_connection()
            query = text("""
                SELECT DISTINCT collection_date
                FROM play_count_history
                WHERE collection_date IS NOT NULL
                ORDER BY collection_date DESC
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

    metric_expr = {
        "viewsIncrease": "SUM(play_inc)",
        "over100kViews": "SUM(play_inc >= 100000)",
        "postCount"    : "COUNT(DISTINCT video_id)"
    }[metric]

    conn = None
    try:
        conn = get_db_connection()
        logger.info("Executing genre-trends query")

        sql = f"""
        WITH base AS (
            SELECT
                pch.collection_date,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre,
                fd.video_id,
                SUM(pch.play_count_increase) AS play_inc
            FROM play_count_history pch
            JOIN frontend_data fd ON fd.video_id = pch.video_id
            CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3
                        UNION ALL SELECT 4 UNION ALL SELECT 5) n
            WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
              AND fd.category IS NOT NULL
              AND pch.collection_date BETWEEN :start_date AND :end_date
            GROUP BY pch.collection_date, fd.video_id, genre
        ),
        top10 AS (
            SELECT genre, {metric_expr} AS metric_value
            FROM base
            GROUP BY genre
            ORDER BY metric_value DESC
            LIMIT 10
        )
        SELECT
            b.collection_date                  AS date,
            b.genre,
            SUM(b.play_inc)                   AS viewsIncrease,
            SUM(b.play_inc >= 100000)         AS over100kViews,
            COUNT(DISTINCT b.video_id)        AS postCount
        FROM base b
        JOIN top10 t ON t.genre = b.genre
        GROUP BY b.collection_date, b.genre
        ORDER BY b.collection_date
        """
        result = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date})
        rows = result.mappings().all()

        trend_data = [{
            "date":   r["date"].strftime("%Y-%m-%d"),
            "genre":  r["genre"],
            "metrics": {
                "viewsIncrease": int(r["viewsIncrease"]),
                "over100kViews": int(r["over100kViews"]),
                "postCount"    : int(r["postCount"])
            }
        } for r in rows]

        resp = {
            "data": trend_data,
            "genres": list({r["genre"] for r in rows}),
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        return JSONResponse(content=jsonable_encoder(resp))
    except Exception as e:
        logger.error(f"Error fetching genre trends: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


  
