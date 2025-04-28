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
        WITH video_genres AS (
            SELECT
                fd.video_id,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre
            FROM frontend_data fd
            CROSS JOIN (
                SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            ) n
            WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        ),
        video_stats AS (
            SELECT
                pch.video_id,
                vg.genre,
                SUM(pch.play_count_increase) as total_video_increase
            FROM play_count_history pch
            JOIN video_genres vg ON pch.video_id = vg.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND vg.genre IS NOT NULL AND vg.genre != ''
            GROUP BY pch.video_id, vg.genre
        ),
        category_stats AS (
            SELECT 
                vs.genre as category,
                SUM(vs.total_video_increase) as total_play_count_increase,
                COUNT(CASE WHEN vs.total_video_increase >= 100000 THEN 1 END) as videos_over_100k,
                COUNT(DISTINCT vs.video_id) as total_posts
            FROM video_stats vs
            GROUP BY vs.genre
        ),
        top_videos AS (
            SELECT 
                vg.genre as category,
                fd.url,
                fd.thumbnail_url,
                SUM(pch.play_count_increase) AS play_count_increase,
                SUM(pch.likes_count_increase) AS likes_count_increase,
                fd.created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                ROW_NUMBER() OVER (PARTITION BY vg.genre ORDER BY SUM(pch.play_count_increase) DESC) as rank_col
            FROM frontend_data fd
            JOIN play_count_history pch ON fd.video_id = pch.video_id
            JOIN video_genres vg ON fd.video_id = vg.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND vg.genre IS NOT NULL AND vg.genre != ''
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        """
            
            
        query += """
            GROUP BY vg.genre, fd.url, fd.thumbnail_url, fd.created_at, fd.play_count, fd.ten_days_increase, fd.account_name, fd.display_name, fd.video_id
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
        
        # 1. 再生増加数トップ10のジャンルを取得
        views_increase_query = """
        WITH video_genres AS (
            SELECT
                fd.video_id,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre
            FROM frontend_data fd
            CROSS JOIN (
                SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            ) n
            WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        )
        SELECT  
            vg.genre as category,
            SUM(pch.play_count_increase) as total_play_count_increase
        FROM play_count_history pch
        JOIN video_genres vg ON pch.video_id = vg.video_id
        WHERE pch.collection_date BETWEEN %s AND %s
        AND vg.genre IS NOT NULL AND vg.genre != ''
        GROUP BY vg.genre
        ORDER BY total_play_count_increase DESC
        LIMIT 10
        """
        
        cursor.execute(views_increase_query, (start_date, end_date))
        views_increase_data = cursor.fetchall()
        views_increase_genres = [row['category'] for row in views_increase_data]
        
        # 2. 10万再生以上個数トップ10のジャンルを取得
        over_100k_query = """
        WITH video_genres AS (
            SELECT
                fd.video_id,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre
            FROM frontend_data fd
            CROSS JOIN (
                SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            ) n
            WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        )
        SELECT  
            vg.genre as category,
            COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as videos_over_100k
        FROM play_count_history pch
        JOIN video_genres vg ON pch.video_id = vg.video_id
        WHERE pch.collection_date BETWEEN %s AND %s
        AND vg.genre IS NOT NULL AND vg.genre != ''
        GROUP BY vg.genre
        HAVING videos_over_100k > 0
        ORDER BY videos_over_100k DESC
        LIMIT 10
        """
        
        cursor.execute(over_100k_query, (start_date, end_date))
        over_100k_data = cursor.fetchall()
        over_100k_genres = [row['category'] for row in over_100k_data]
        
        # 3. 投稿数トップ10のジャンルを取得
        post_count_query = """
        WITH video_genres AS (
            SELECT
                fd.video_id,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre
            FROM frontend_data fd
            CROSS JOIN (
                SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            ) n
            WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
            AND fd.category IS NOT NULL
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        )
        SELECT  
            vg.genre as category,
            COUNT(DISTINCT pch.video_id) as post_count
        FROM play_count_history pch
        JOIN video_genres vg ON pch.video_id = vg.video_id
        WHERE pch.collection_date BETWEEN %s AND %s
        AND vg.genre IS NOT NULL AND vg.genre != ''
        GROUP BY vg.genre
        ORDER BY post_count DESC
        LIMIT 10
        """
        
        cursor.execute(post_count_query, (start_date, end_date))
        post_count_data = cursor.fetchall()
        post_count_genres = [row['category'] for row in post_count_data]
        
        # すべてのユニークなジャンルのリストを作成
        all_genres = list(set(views_increase_genres + over_100k_genres + post_count_genres))
        
        # 時系列データを取得
        trend_data = []
        
        # 日付ごとの各ジャンルのデータを取得
        if all_genres:
            trends_query = """
            WITH video_genres AS (
                SELECT
                    fd.video_id,
                    TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS genre
                FROM frontend_data fd
                CROSS JOIN (
                    SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
                ) n
                WHERE n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
                AND fd.category IS NOT NULL
                AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
            )
            SELECT 
                pch.collection_date as date,
                vg.genre as category,
                SUM(pch.play_count_increase) as views_increase,
                COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as over_100k_views,
                COUNT(DISTINCT pch.video_id) as post_count
            FROM play_count_history pch
            JOIN video_genres vg ON pch.video_id = vg.video_id
            WHERE pch.collection_date BETWEEN %s AND %s
            AND vg.genre IN ({})
            GROUP BY pch.collection_date, vg.genre
            ORDER BY pch.collection_date
            """.format(','.join(['%s'] * len(all_genres)))
            
            # パラメータリストの作成
            params = [start_date, end_date] + all_genres
            
            cursor.execute(trends_query, params)
            trends_results = cursor.fetchall()
            
            # 結果を整形
            for row in trends_results:
                trend_data.append({
                    "date": row["date"].strftime('%Y-%m-%d'),
                    "genre": row["category"],
                    "metrics": {
                        "viewsIncrease": row["views_increase"],
                        "over100kViews": row["over_100k_views"],
                        "postCount": row["post_count"]
                    }
                })
        
        # 各指標のトップジャンルリストを辞書に格納
        top_genres_by_metric = {
            "viewsIncrease": views_increase_genres,
            "over100kViews": over_100k_genres,
            "postCount": post_count_genres
        }
        
        response = {
            "data": trend_data,
            "genres": all_genres,
            "topGenresByMetric": top_genres_by_metric,
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

