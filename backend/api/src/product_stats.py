from fastapi import APIRouter, HTTPException
import logging
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from src.db.database import get_db_connection
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

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
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[VideoStats]

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
                vm.product,
                SUM(pch.play_count_increase) as total_play_count_increase,
                COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as videos_over_100k,
                COUNT(DISTINCT pch.video_id) as total_posts
            FROM play_count_history pch
            JOIN video_master vm ON pch.video_id = vm.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND vm.product IS NOT NULL
            GROUP BY vm.product
        ),
        top_videos AS (
            SELECT 
                vm.product,
                fd.url,
                fd.thumbnail_url,
                fd.play_count_increase,
                fd.account_name,
                fd.display_name,
                ROW_NUMBER() OVER (PARTITION BY vm.product ORDER BY fd.play_count_increase DESC) as rank_col
            FROM frontend_data fd
            JOIN video_master vm ON fd.url = vm.url
            WHERE fd.created_at BETWEEN %s AND %s
            AND vm.product IS NOT NULL
        )
        SELECT 
            ps.product,
            ps.total_play_count_increase,
            ps.videos_over_100k,
            ps.total_posts,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'url', tv.url,
                    'thumbnail_url', tv.thumbnail_url,
                    'play_count_increase', tv.play_count_increase,
                    'account_name', tv.account_name,
                    'display_name', tv.display_name
                )
            ) as top_videos
        FROM product_stats ps
        LEFT JOIN top_videos tv ON ps.product = tv.product AND tv.rank_col <= 10
        GROUP BY ps.product, ps.total_play_count_increase, ps.videos_over_100k, ps.total_posts
        ORDER BY ps.total_play_count_increase DESC;
        """

        cursor.execute(query, (start_date, end_date, start_date, end_date))
        results = cursor.fetchall()
        
        print(f"Retrieved {len(results)} product stats records")
        
        # 結果を整形
        formatted_results = []
        for row in results:
            if row["top_videos"] is None:
                print(f"No top videos found for product: {row['product']}")
                
            formatted_results.append({
                "product": row["product"],
                "total_play_count_increase": row["total_play_count_increase"],
                "videos_over_100k": row["videos_over_100k"],
                "total_posts": row["total_posts"],
                "top_videos": row["top_videos"] if row["top_videos"] else []
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