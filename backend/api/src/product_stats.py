from fastapi import APIRouter, HTTPException
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import json
import random

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
    end_date: Optional[str] = None
):
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
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
                end_date = dates[0]["collection_date"].strftime('%Y-%m-%d')
                start_date = dates[-1]["collection_date"].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=18)).strftime('%Y-%m-%d')
            
            cursor.close()
            conn.close()
            
            # start_dateとend_dateの値をログに出力
            print(f"Calculated date range: start={start_date}, end={end_date}")
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
            
            # datesの内容をログに出力
            print(f"Found collection dates: {[d['collection_date'] for d in dates]}")
    except ValueError as e:
        logger.error(f"Invalid date format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        print("Executing product stats query")
        
        query = """
        WITH product_stats AS (
            SELECT 
                fd.product,
                MAX(pm.product_category) AS product_category,
                SUM(pch.play_count_increase) as total_play_count_increase,
                COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as videos_over_100k,
                COUNT(DISTINCT pch.video_id) as total_posts
            FROM play_count_history pch
            JOIN frontend_data fd ON pch.video_id = fd.video_id
            LEFT JOIN product_master pm ON fd.product = pm.product_name
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.product IS NOT NULL
            GROUP BY fd.product
        ),
        top_videos AS (
            SELECT 
                fd.product,
                fd.url,
                fd.thumbnail_url,
                SUM(pch.play_count_increase) AS play_count_increase,
                SUM(pch.likes_count_increase) AS likes_count_increase,
                fd.created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                ROW_NUMBER() OVER (PARTITION BY fd.product ORDER BY SUM(pch.play_count_increase) DESC) as rank_col
            FROM frontend_data fd
            JOIN play_count_history pch ON fd.video_id = pch.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.product IS NOT NULL
            GROUP BY fd.product, fd.url, fd.thumbnail_url, fd.created_at, fd.play_count, fd.ten_days_increase, fd.account_name, fd.display_name, fd.video_id
        )
        SELECT 
            ps.product,
            ps.product_category,
            ps.total_play_count_increase,
            ps.videos_over_100k,
            ps.total_posts,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'url', tv.url,
                    'thumbnail_url', tv.thumbnail_url,
                    'play_count_increase', tv.play_count_increase,
                    'likes_count_increase', tv.likes_count_increase,
                    'created_at', tv.created_at,
                    'play_count', tv.play_count,
                    'ten_days_increase', tv.ten_days_increase,
                    'account_name', tv.account_name,
                    'display_name', tv.display_name
                )
            ) as top_videos
        FROM product_stats ps
        LEFT JOIN top_videos tv ON ps.product = tv.product AND tv.rank_col <= 10
        GROUP BY ps.product, ps.product_category, ps.total_play_count_increase, ps.videos_over_100k, ps.total_posts
        ORDER BY ps.total_play_count_increase DESC;
        """

        cursor.execute(query, (start_date, end_date, start_date, end_date))
        results = cursor.fetchall()
        
        # 結果を整形
        formatted_results = []
        for row in results:
            # top_videosはJSON文字列なのでパース
            top_videos = json.loads(row["top_videos"]) if row["top_videos"] else []
            for video in top_videos:
                video["thumbnail_url"] = convert_gs_to_https(video.get("thumbnail_url"))
            formatted_results.append({
                "product": row["product"],
                "product_category": row["product_category"],
                "total_play_count_increase": row["total_play_count_increase"],
                "videos_over_100k": row["videos_over_100k"],
                "total_posts": row["total_posts"],
                "top_videos": top_videos
            })

        formatted_response = {
            "data": formatted_results,
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
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
        print("Database connection closed") 

@router.get("/api/product-trends")
async def get_product_trends(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metric: str = "viewsIncrease"
):
    try:
        # 日付パラメータが指定されていない場合、自動的に計算
        if start_date is None or end_date is None:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
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
                # 最新7日間のデータ期間を設定
                end_date = dates[0]["collection_date"].strftime('%Y-%m-%d')
                start_date = dates[-1]["collection_date"].strftime('%Y-%m-%d')
            else:
                # データがない場合はデフォルト値
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            
            cursor.close()
            conn.close()
            
            logger.info(f"Calculated date range: start={start_date}, end={end_date}")
        
        # 日付の検証
        try:
            start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
            end_datetime = datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            logger.error(f"Invalid date format: {start_date} or {end_date}")
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        # 日付の範囲確認
        if start_datetime > end_datetime:
            logger.error(f"Start date {start_date} is after end date {end_date}")
            raise HTTPException(status_code=400, detail="Start date cannot be after end date")
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 再生増加数トップ10の商品を取得（カテゴリがブランクのものを除く）
        top_products_query = """
        SELECT 
            fd.product,
            MAX(pm.product_category) AS product_category,
            SUM(pch.play_count_increase) as total_play_count_increase
        FROM play_count_history pch
        JOIN frontend_data fd ON pch.video_id = fd.video_id
        LEFT JOIN product_master pm ON fd.product = pm.product_name
        WHERE pch.collection_date BETWEEN %s AND %s
        AND fd.product IS NOT NULL
        AND pm.product_category IS NOT NULL
        AND pm.product_category != ''
        GROUP BY fd.product
        ORDER BY total_play_count_increase DESC
        LIMIT 10
        """
        
        cursor.execute(top_products_query, (start_date, end_date))
        top_products_data = cursor.fetchall()
        
        # 商品リストとカテゴリマッピングを作成
        top_products = [row['product'] for row in top_products_data]
        product_categories = {row['product']: row['product_category'] for row in top_products_data}
        
        # 時系列データを取得
        trend_data = []
        
        # 日付ごとの各商品の再生増加数を取得
        if top_products:
            trends_query = """
            SELECT 
                pch.collection_date as date,
                fd.product,
                MAX(pm.product_category) AS product_category,
                SUM(pch.play_count_increase) as value
            FROM play_count_history pch
            JOIN frontend_data fd ON pch.video_id = fd.video_id
            LEFT JOIN product_master pm ON fd.product = pm.product_name
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.product IN ({})
            GROUP BY pch.collection_date, fd.product
            ORDER BY pch.collection_date, SUM(pch.play_count_increase) DESC
            """.format(','.join(['%s'] * len(top_products)))
            
            # パラメータリストの作成
            params = [start_date, end_date] + top_products
            
            cursor.execute(trends_query, params)
            trends_results = cursor.fetchall()
            
            # 結果を整形
            for row in trends_results:
                trend_data.append({
                    "date": row["date"].strftime('%Y-%m-%d'),
                    "value": row["value"],
                    "product": row["product"],
                    "product_category": row["product_category"]
                })
        
        response = {
            "data": trend_data,
            "products": top_products,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
        return JSONResponse(content=jsonable_encoder(response))
    
    except Exception as e:
        logger.error(f"Error in product trends API: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

