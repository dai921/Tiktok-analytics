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

class GenreStats(BaseModel):
    genre: str
    genre_category: Optional[str]
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[VideoStats]

class GenreTrendData(BaseModel):
    date: str
    value: int
    genre: str
    genre_category: Optional[str]

class GenreTrendResponse(BaseModel):
    data: List[GenreTrendData]
    genres: List[str]
    date_range: Optional[dict]

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url

@router.get("/api/genre-stats")
async def get_genre_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
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
        
        print("Executing genre stats query")
        
        query = """
        WITH video_stats AS (
            SELECT
                fd.video_id,
                fd.category,
                SUM(pch.play_count_increase) as total_video_increase
                
            FROM play_count_history pch
            JOIN frontend_data fd ON pch.video_id = fd.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
            GROUP BY fd.video_id, fd.category
        ),
        category_stats AS (
            SELECT 
                vs.category,
                SUM(vs.total_video_increase) as total_play_count_increase,
                COUNT(CASE WHEN vs.total_video_increase >= 100000 THEN 1 END) as videos_over_100k,
                COUNT(DISTINCT vs.video_id) as total_posts
            FROM video_stats vs
            GROUP BY vs.category
        ),
        top_videos AS (
            SELECT 
                fd.category,
                fd.url,
                fd.thumbnail_url,
                SUM(pch.play_count_increase) AS play_count_increase,
                SUM(pch.likes_count_increase) AS likes_count_increase,
                fd.created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                ROW_NUMBER() OVER (PARTITION BY fd.category ORDER BY SUM(pch.play_count_increase) DESC) as rank_col
            FROM frontend_data fd
            JOIN play_count_history pch ON fd.video_id = pch.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        """
            
            
        query += """
            GROUP BY fd.category, fd.url, fd.thumbnail_url, fd.created_at, fd.play_count, fd.ten_days_increase, fd.account_name, fd.display_name, fd.video_id
        )
        SELECT 
            cs.category,
            cs.total_play_count_increase,
            cs.videos_over_100k,
            cs.total_posts,
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
            FROM category_stats cs
        LEFT JOIN top_videos tv ON cs.category = tv.category AND tv.rank_col <= 10
        GROUP BY cs.category, cs.total_play_count_increase, cs.videos_over_100k, cs.total_posts
        ORDER BY cs.total_play_count_increase DESC;
        """

        # パラメータに日付を追加（top_videosクエリ用）
        params = [start_date, end_date, start_date, end_date]
        
        cursor.execute(query, tuple(params))
        results = cursor.fetchall()
        
        # 結果を整形
        formatted_results = []
        for row in results:
            # top_videosはJSON文字列なのでパース
            top_videos = json.loads(row["top_videos"]) if row["top_videos"] else []
            for video in top_videos:
                video["thumbnail_url"] = convert_gs_to_https(video.get("thumbnail_url"))
            formatted_results.append({
                "genre": row["category"],
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
        logger.error(f"Error fetching category stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
        print("Database connection closed") 

@router.get("/api/genre-trends")
async def get_genre_trends(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metric: str = "viewsIncrease",
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
        top_categories_query = """
        SELECT  
            fd.category,
            SUM(pch.play_count_increase) as total_play_count_increase
        FROM play_count_history pch
        JOIN frontend_data fd ON pch.video_id = fd.video_id
        WHERE pch.collection_date BETWEEN %s AND %s
        AND fd.category IS NOT NULL
        AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        """
        
        
        top_categories_query += """
        GROUP BY fd.category
        ORDER BY total_play_count_increase DESC
        LIMIT 10
        """
        
        cursor.execute(top_categories_query, (start_date, end_date))
        top_categories_data = cursor.fetchall()
        top_categories = [row['category'] for row in top_categories_data]
        
        # 時系列データを取得
        trend_data = []
        
        # 日付ごとの各商品の再生増加数を取得
        if top_categories_data:
            trends_query = """
            SELECT 
                pch.collection_date as date,
                fd.category,
                SUM(pch.play_count_increase) as value
            FROM play_count_history pch
            JOIN frontend_data fd ON pch.video_id = fd.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND fd.category IN ({})
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
            GROUP BY pch.collection_date, fd.category
            ORDER BY pch.collection_date, SUM(pch.play_count_increase) DESC
            """.format(','.join(['%s'] * len(top_categories_data)))
            
            # パラメータリストの作成
            params = [start_date, end_date] + top_categories
            
            cursor.execute(trends_query, params)
            trends_results = cursor.fetchall()
            
            # 結果を整形
            for row in trends_results:
                trend_data.append({
                    "date": row["date"].strftime('%Y-%m-%d'),
                    "value": row["value"],
                    "genre": row["category"]
                })
        
        response = {
            "data": trend_data,
            "genres": top_categories,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
        return JSONResponse(content=jsonable_encoder(response))
    
    except Exception as e:
        logger.error(f"Error in genre trends API: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

