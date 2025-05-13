from fastapi import APIRouter, HTTPException
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection  # 正しい関数名に修正
from sqlalchemy.sql import text
from fastapi.responses import JSONResponse
from contextlib import closing
from fastapi.encoders import jsonable_encoder
import json
import random


# --- 追加 import ---
import os
from textwrap import indent

# --- デバッグフラグ（環境変数 ENABLE_SQL_DEBUG=1 で有効） ---
DEBUG_SQL = False

def debug_explain(conn, sql: str, params: dict):
    """EXPLAIN ANALYZE の結果をログに吐く（デバッグ時のみ）"""
    if not DEBUG_SQL:
        return
    result = conn.execute(text("EXPLAIN ANALYZE " + sql), params)
    plan_rows = result.fetchall()
    plan = "\n".join(r[0] for r in plan_rows)
    logger.debug("\n" + indent(plan, "  "))  # 見やすくインデント


# ロガーの設定
logger = logging.getLogger(__name__)

router = APIRouter()

class VideoStats(BaseModel):
    url: str
    thumbnail_url: Optional[str]
    play_count_increase: int
    account_name: str
    display_name: str

class ProductStats(BaseModel):
    product: str
    product_category: Optional[str]
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[VideoStats]

class ProductTrendData(BaseModel):
    date: str
    value: int
    product: str
    product_category: Optional[str]

class ProductTrendResponse(BaseModel):
    data: List[ProductTrendData]
    products: List[str]
    date_range: Optional[dict]

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url

@router.get("/api/product-stats")
async def get_product_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    genres: Optional[str] = None,  # ジャンルフィルタのパラメータ
    metric: Optional[str] = "viewsIncrease"  # 指標パラメータを追加（デフォルトは再生増加数）
):
    # genresパラメータがある場合、カンマ区切りの文字列をリストに変換
    genre_list = genres.split(',') if genres else []
    
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            
            # 収集日の一覧を取得
            query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(query)
            dates = result.fetchall()
            
            if dates:
                # 7回分のデータ期間を設定
                end_date = dates[0][0].strftime('%Y-%m-%d')
                start_date = dates[-1][0].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=18)).strftime('%Y-%m-%d')
            
            conn.close()
            
            # start_dateとend_dateの値をログに出力
            print(f"Calculated date range: start={start_date}, end={end_date}")
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
            
            # datesの内容をログに出力
            print(f"Found collection dates: {[d[0] for d in dates]}")
    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    try:
        conn = get_db_connection()
        
        print("Executing product stats query")
        
        # ★変更: ジャンル IN 句を簡単に組み立てるだけ
        genre_filter_sql = ""
        genre_params = {}
        if genre_list:
            placeholders = ", ".join([f":genre_{i}" for i in range(len(genre_list))])
            genre_filter_sql = f"AND pm.product_category IN ({placeholders})"
            genre_params = {f"genre_{i}": genre for i, genre in enumerate(genre_list)}

        # ★変更: ここからクエリを全部書き換え
        base_select = f"""
            SELECT
                fd.video_id,
                fd.product,
                pm.product_category,
                fd.url,
                fd.thumbnail_url,
                fd.created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                SUM(pch.play_count_increase)  AS play_inc,
                SUM(pch.likes_count_increase) AS like_inc
            FROM play_count_history pch
            JOIN frontend_data fd ON fd.video_id = pch.video_id
            LEFT JOIN product_master pm ON pm.product_name = fd.product
            WHERE pch.collection_date BETWEEN :start_date AND :end_date
              AND fd.product IS NOT NULL
              {genre_filter_sql}
            GROUP BY
                fd.video_id,
                fd.product, pm.product_category,
                fd.url, fd.thumbnail_url,
                fd.created_at, fd.play_count,
                fd.ten_days_increase,
                fd.account_name, fd.display_name
        """
        params = {"start_date": start_date, "end_date": end_date, **genre_params}
        # --------------------------------------------
        # 既存の一時テーブルが存在する場合は削除
        conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_base"))
        
        # 1) 空の tmp_base を作成（インデックス定義が生きる）
        conn.execute(text("""
            CREATE TEMPORARY TABLE tmp_base (
                video_id           BIGINT UNSIGNED,
                product            VARCHAR(255),
                product_category   VARCHAR(255),
                url                TEXT,
                thumbnail_url      TEXT,
                created_at         DATETIME,
                play_count         INT,
                ten_days_increase  INT,
                account_name       VARCHAR(255),
                display_name       VARCHAR(255),
                play_inc           INT,
                like_inc           INT,
                PRIMARY KEY (video_id),
                INDEX idx_prod (product),            -- ★インデックス
                INDEX idx_prod_inc  (product, play_inc DESC)   -- ★←これを追加
            ) ENGINE=InnoDB
        """))

        # 2) base_select の結果を流し込む
        insert_sql = f"INSERT INTO tmp_base {base_select}"
        conn.execute(text(insert_sql), params)

        stats_sql = text("""
        SELECT
            product,
            MAX(product_category)                    AS product_category,
            SUM(play_inc)                            AS total_play_inc,
            SUM(play_inc >= 100000)                  AS over100k_cnt,
            COUNT(*)                                 AS post_cnt
        FROM tmp_base
        GROUP BY product
        ORDER BY total_play_inc DESC;
        """)
        result = conn.execute(stats_sql)
        stats = {r["product"]: {
            "product": r["product"],
            "product_category": r["product_category"],
            "total_play_count_increase": r["total_play_inc"],
            "videos_over_100k": r["over100k_cnt"],
            "total_posts": r["post_cnt"],
            "top_videos": []
        } for r in result.mappings().all()}
        
        top_sql = text("""
            SELECT *
            FROM (
                SELECT
                    product, url, thumbnail_url,
                    play_inc, like_inc,
                    created_at, play_count, ten_days_increase,
                    account_name, display_name,
                    ROW_NUMBER() OVER (PARTITION BY product ORDER BY play_inc DESC) AS rn
                FROM tmp_base
            ) t WHERE rn <= 10;
            """)
        result = conn.execute(top_sql)

        for v in result.mappings().all():
            prod = stats[v["product"]]
            prod["top_videos"].append({
                "url": v["url"],
                "thumbnail_url": convert_gs_to_https(v["thumbnail_url"]),
                "play_count_increase": v["play_inc"],
                "likes_count_increase": v["like_inc"],
                "created_at": v["created_at"],
                "play_count": v["play_count"],
                "ten_days_increase": v["ten_days_increase"],
                "account_name": v["account_name"],
                "display_name": v["display_name"]
            })
    
        # 使用済みの一時テーブルを削除
        conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_base"))
        
        formatted_response = {
            "data": list(stats.values()),
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            }
        }

        return JSONResponse(content=jsonable_encoder(formatted_response))

    except Exception as e:
        logger.error(f"Error fetching product stats: {str(e)}", exc_info=True)
        # エラーが発生した場合でも一時テーブルを削除する
        try:
            if 'conn' in locals():
                conn.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_base"))
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()
        print("Database connection closed") 

@router.get("/api/product-trends")
async def get_product_trends(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    genres: Optional[str] = None,  # ジャンルフィルタ用のパラメータ
    metric: Optional[str] = "viewsIncrease"  # 指標パラメータを追加（デフォルトは再生増加数）
):
    # genres パラメータがある場合、カンマ区切りの文字列をリストに変換
    genre_list = genres.split(',') if genres else []
    
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            
            # 収集日の一覧を取得
            query = text("""
            SELECT DISTINCT collection_date
            FROM play_count_history
            WHERE collection_date IS NOT NULL
            ORDER BY collection_date DESC
            LIMIT 7
            """)
            
            result = conn.execute(query)
            dates = result.fetchall()
            
            if dates:
                # 7回分のデータ期間を設定
                end_date = dates[0][0].strftime('%Y-%m-%d')
                start_date = dates[-1][0].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=18)).strftime('%Y-%m-%d')
            
            conn.close()
            
            # start_dateとend_dateの値をログに出力
            print(f"Calculated date range: start={start_date}, end={end_date}")
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
            
            # datesの内容をログに出力
            print(f"Found collection dates: {[d[0] for d in dates]}")
    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # ----- フィルタ SQL 断片 -----
    genre_filter_sql = ""
    genre_params = {}
    if genre_list:
        placeholders = ", ".join([f":genre_{i}" for i in range(len(genre_list))])
        genre_filter_sql = f"AND pm.product_category IN ({placeholders})"
        genre_params = {f"genre_{i}": genre for i, genre in enumerate(genre_list)}

    params = {"start_date": start_date, "end_date": end_date, **genre_params}

    # ----- メトリック列 -----
    metric_expr = {
        "viewsIncrease":      "SUM(play_inc)",
        "over100kViews":      "SUM(play_inc >= 100000)",
        "postCount":          "COUNT(DISTINCT video_id)"
    }[metric]

    # ===============================
    # メインの SQL ―― これ 1 本だけ
    # ===============================
    sql = f"""
    WITH base AS (
        SELECT
            fd.product,
            pm.product_category,
            pch.collection_date,
            fd.video_id,
            SUM(pch.play_count_increase)  AS play_inc
        FROM play_count_history pch
        JOIN frontend_data fd  ON fd.video_id = pch.video_id
        LEFT JOIN product_master pm ON pm.product_name = fd.product
        WHERE pch.collection_date BETWEEN :start_date AND :end_date
          AND fd.product IS NOT NULL
          {genre_filter_sql}
        GROUP BY 
        fd.video_id,
        fd.product,
        pm.product_category,
        pch.collection_date
    ),
    product_tot AS (                               -- ★期間トータル
        SELECT
            product,
            {metric_expr} AS metric_value
        FROM base
        GROUP BY product
        ORDER BY metric_value DESC
        LIMIT 10
    )
    SELECT
        b.collection_date           AS date,
        b.product,
        MAX(b.product_category)     AS product_category,
        SUM(b.play_inc)             AS viewsIncrease,
        SUM(b.play_inc >= 100000)   AS over100kViews,
        COUNT(DISTINCT b.video_id)  AS postCount
    FROM base b
    JOIN product_tot pt ON pt.product = b.product  -- ★TOP10 だけに限定
    GROUP BY b.collection_date, b.product
    ORDER BY b.collection_date;
    """
    conn = get_db_connection()
    try:
        result = conn.execute(text(sql), params)
        rows = result.mappings().all()

        # ---------- 整形 ----------
        trend_data = []
        for r in rows:
            trend_data.append({
                "date": r["date"].strftime("%Y-%m-%d"),
                "product": r["product"],
                "product_category": r["product_category"],
                "metrics": {
                    "viewsIncrease": int(r["viewsIncrease"]),
                    "over100kViews": int(r["over100kViews"]),
                    "postCount":     int(r["postCount"])
                }
            })

        resp = {
            "data": trend_data,
            "products": list({r["product"] for r in rows}),   # ユニーク
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        return JSONResponse(content=jsonable_encoder(resp))
    finally:
        conn.close()