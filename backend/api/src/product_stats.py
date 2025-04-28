from fastapi import APIRouter, HTTPException
import logging
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import json

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

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url

@router.get("/api/product-stats")
async def get_product_stats(
    start_date: str,
    end_date: str
):
    print(f"Received request for product stats from {start_date} to {end_date}")
    
    try:
        # 日付のバリデーション
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
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
        
        print(f"Raw DB results: {results}")
        logger.info(f"Raw DB results: {results}")
        
        print(f"Retrieved {len(results)} product stats records")
        
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

        return JSONResponse(content=jsonable_encoder(formatted_results))

    except Exception as e:
        logger.error(f"Error fetching product stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
        print("Database connection closed") 