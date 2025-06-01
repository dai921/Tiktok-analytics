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
    genres: Optional[str] = None,
    metric: Optional[str] = "viewsIncrease"
):
    # リクエストパラメータのログ出力
    logger.info(f"product-stats API called with params: start_date={start_date}, end_date={end_date}, genres={genres}, metric={metric}")
    print(f"product-stats API called with params: start_date={start_date}, end_date={end_date}, genres={genres}, metric={metric}")
    
    # genresパラメータがある場合、カンマ区切りの文字列をリストに変換
    genre_list = genres.split(',') if genres else []
    
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            
            # 収集日の一覧を取得（新しいテーブルから）
            query = text("""
            SELECT DISTINCT fetch_date
            FROM product_daily_summary
            WHERE fetch_date IS NOT NULL
            ORDER BY fetch_date DESC
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
            
            print(f"Calculated date range: start={start_date}, end={end_date}")
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
            print(f"Found collection dates: {[d[0] for d in dates]}")
    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    try:
        conn = get_db_connection()
        
        # ジャンルフィルタの条件を構築
        genre_filter = ""
        params = {"start_date": start_date, "end_date": end_date}
        if genre_list:
            genre_placeholders = []
            for i, genre in enumerate(genre_list):
                placeholder = f"genre_{i}"
                genre_placeholders.append(f":{placeholder}")
                params[placeholder] = genre
            genre_filter = f"AND product_category IN ({', '.join(genre_placeholders)})"
            
        # ソート列の定義 - エイリアス名を使用するように修正
        sort_column = {
            "viewsIncrease": "total_play_inc",  # plays_increaseではなく集計後のエイリアス名を使う
            "over100kViews": "over100k_cnt", 
            "postCount": "post_cnt"
        }.get(metric, "total_play_inc")
        
        logger.info(f"Executing product stats query with metric: {metric}, sort column: {sort_column}")
        
        # 1. 商品統計情報の取得（新テーブルから）
        summary_query = text(f"""
        SELECT 
            product,
            product_category,
            SUM(plays_increase) AS total_play_inc,
            SUM(over_100k) AS over100k_cnt,
            SUM(post_count) AS post_cnt
        FROM product_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        {genre_filter}
        GROUP BY product, product_category
        ORDER BY {sort_column} DESC  # 集計後のエイリアス名を使用
        """)
        
        summary_result = conn.execute(summary_query, params)
        summary_rows = summary_result.fetchall()
        
        # 商品統計の結果を格納
        stats = {}
        products = []
        for row in summary_rows:
            product = row.product
            products.append(product)
            stats[product] = {
                "product": product,
                "product_category": row.product_category,
                "total_play_count_increase": row.total_play_inc,
                "videos_over_100k": row.over100k_cnt,
                "total_posts": row.post_cnt,
                "top_videos": []
            }
        
        # 2. 各商品のトップ動画を取得（新テーブルから）- 期間の合計値で並べ替え
        if products:
            # プレースホルダとパラメータを準備
            product_placeholders = []
            for i, product in enumerate(products):
                placeholder = f"product_{i}"
                product_placeholders.append(f":{placeholder}")
                params[placeholder] = product
            
            videos_query = text(f"""
            SELECT 
                v.product,
                v.video_id,
                fd.url,
                v.thumbnail_url,
                SUM(v.plays_increase) AS total_play_inc, 
                SUM(v.likes_increase) AS total_like_inc,
                MAX(v.post_time) AS created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name
            FROM product_daily_top100_videos v
            JOIN frontend_data fd ON fd.video_id = v.video_id
            WHERE v.fetch_date BETWEEN :start_date AND :end_date
              AND v.product IN ({', '.join(product_placeholders)})
              {genre_filter}
            GROUP BY v.product, v.video_id, fd.url, v.thumbnail_url, fd.play_count, fd.ten_days_increase, fd.account_name, fd.display_name
            ORDER BY v.product, total_play_inc DESC  # 集計後のエイリアス名を使用
            """)
            
            videos_result = conn.execute(videos_query, params)
            videos_rows = videos_result.fetchall()
            
            # トップ動画を追加（各商品ごとに上位10件を選択）
            current_product = None
            video_count = 0
            
            for row in videos_rows:
                product = row.product
                
                # 商品が変わったらカウンタをリセット
                if current_product != product:
                    current_product = product
                    video_count = 0
                
                # 各商品の上位10件のみを追加
                if product in stats and video_count < 10:
                    stats[product]["top_videos"].append({
                        "url": row.url,
                        "thumbnail_url": convert_gs_to_https(row.thumbnail_url),
                        "play_count_increase": row.total_play_inc,
                        "likes_count_increase": row.total_like_inc,
                        "created_at": row.created_at,
                        "play_count": row.play_count,
                        "ten_days_increase": row.ten_days_increase,
                        "account_name": row.account_name,
                        "display_name": row.display_name
                    })
                    video_count += 1
        
        logger.info(f"Product stats query returned {len(stats)} products")
        
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()
        print("Database connection closed")

@router.get("/api/product-trends")
async def get_product_trends(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    genres: Optional[str] = None,
    metric: Optional[str] = "viewsIncrease"
):
    # リクエストパラメータのログ出力
    logger.info(f"product-trends API called with params: start_date={start_date}, end_date={end_date}, genres={genres}, metric={metric}")
    print(f"product-trends API called with params: start_date={start_date}, end_date={end_date}, genres={genres}, metric={metric}")
    
    # genres パラメータがある場合、カンマ区切りの文字列をリストに変換
    genre_list = genres.split(',') if genres else []
    
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            
            # 収集日の一覧を取得（新しいテーブルから取得）
            query = text("""
            SELECT DISTINCT fetch_date
            FROM product_daily_summary
            WHERE fetch_date IS NOT NULL
            ORDER BY fetch_date DESC
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
            
            print(f"Calculated date range: start={start_date}, end={end_date}")
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
            print(f"Found collection dates: {[d[0] for d in dates]}")
    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    try:
        conn = get_db_connection()

        # ジャンルフィルタの条件を構築
        genre_filter = ""
        params = {"start_date": start_date, "end_date": end_date}
        if genre_list:
            genre_placeholders = []
            for i, genre in enumerate(genre_list):
                placeholder = f"genre_{i}"
                genre_placeholders.append(f":{placeholder}")
                params[placeholder] = genre
            genre_filter = f"AND product_category IN ({', '.join(genre_placeholders)})"
        
        # 選択されたメトリックに基づいてランキングするカラム
        metric_column = {
            "viewsIncrease": "plays_increase",
            "over100kViews": "over_100k",
            "postCount": "post_count"
        }.get(metric, "plays_increase")
        
        # 返すメトリック値
        metric_alias = {
            "viewsIncrease": "plays_increase",
            "over100kViews": "over_100k",
            "postCount": "post_count"
        }.get(metric, "plays_increase")

        # 1. トップ10の商品を取得
        top_products_query = text(f"""
        SELECT 
            product,
            SUM({metric_column}) AS metric_total
        FROM product_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        {genre_filter}
        GROUP BY product
        ORDER BY metric_total DESC
        LIMIT 10
        """)
        
        top_result = conn.execute(top_products_query, params)
        top_rows = top_result.fetchall()
        top_products = [row.product for row in top_rows]
        
        # プレースホルダとパラメータを準備
        product_placeholders = []
        for i, product in enumerate(top_products):
            placeholder = f"product_{i}"
            product_placeholders.append(f":{placeholder}")
            params[placeholder] = product
        
        product_filter = ""
        if top_products:
            product_filter = f"AND product IN ({', '.join(product_placeholders)})"
        
        # 2. 選択された商品の日次データを取得
        trends_query = text(f"""
        SELECT 
            fetch_date AS date,
            product,
            product_category,
            plays_increase,
            over_100k,
            post_count
        FROM product_daily_summary
        WHERE fetch_date BETWEEN :start_date AND :end_date
        {product_filter}
        {genre_filter}
        ORDER BY date, product
        """)
        
        trends_result = conn.execute(trends_query, params)
        trends_rows = trends_result.mappings().all()
        
        # トレンドデータを整形
        trend_data = []
        for row in trends_rows:
            trend_data.append({
                "date": row["date"].strftime("%Y-%m-%d"),
                "product": row["product"],
                "product_category": row["product_category"],
                "value": int(row[metric_alias]),  # 選択されたメトリックの値
                "metrics": {  # 互換性のために全メトリックを残す
                    "viewsIncrease": int(row["plays_increase"]),
                    "over100kViews": int(row["over_100k"]),
                    "postCount": int(row["post_count"])
                }
            })
        
        # レスポンスの作成
        resp = {
            "data": trend_data,
            "products": top_products,
            "date_range": {"start_date": start_date, "end_date": end_date}
        }
        
        logger.info(f"Returning {len(trend_data)} data points for {len(top_products)} products")
        return JSONResponse(content=jsonable_encoder(resp))
        
    except Exception as e:
        logger.error(f"Error in product-trends API: {str(e)}", exc_info=True)
        print(f"Error in product-trends API: {str(e)}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()
        logger.info("product-trends database connection closed")
        print("product-trends database connection closed")