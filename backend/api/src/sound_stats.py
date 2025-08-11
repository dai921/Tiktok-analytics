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

class SoundVideoStats(BaseModel):
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

class SoundStats(BaseModel):
    sound_title: str
    sound_artist: Optional[str]
    sound_id: Optional[str]
    total_play_count_increase: int
    videos_over_100k: int
    total_posts: int
    top_videos: List[SoundVideoStats]

def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    """Google Storage URLをHTTPS URLに変換"""
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url

# ---------- /api/sound-stats ---------- #

@router.get("/api/sound-stats")
async def get_sound_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metric: str = "postCount",
    parent_account_type: Optional[str] = None  # video_type から変更
):
    """サウンド統計情報を取得するAPIエンドポイント"""
    logger.info(f"sound-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}, parent_account_type={parent_account_type}")
    print(f"sound-stats API called with params: start_date={start_date}, end_date={end_date}, metric={metric}, parent_account_type={parent_account_type}")
    
    # ----- 日付決定 ----- #
    if start_date is None or end_date is None:
        conn = get_db_connection()
        try:
            # サウンド日次サマリーテーブルから収集日を取得
            query = text("""
                SELECT DISTINCT fetch_date
                FROM sound_daily_summary_top150
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
    
    # parent_account_typeフィルターの追加（sound_daily_summary_top150用）
    summary_parent_account_type_filter = ""
    if parent_account_type:
        summary_parent_account_type_filter = "AND sds.parent_account_type = :parent_account_type"
        params["parent_account_type"] = parent_account_type
    
    conn = None
    try:
        conn = get_db_connection()
        logger.info(f"Executing sound-stats query with metric: {metric}, sort_column: {sort_column}")
        print(f"Executing sound-stats query with metric: {metric}, sort_column: {sort_column}")

        # サウンドサマリーテーブルから統計を取得
        stats_sql = text(f"""
        SELECT
            sds.sound_name,
            SUM(sds.plays_increase) AS total_plays_increase,
            SUM(sds.over_100k) AS total_over_100k,
            SUM(sds.post_count) AS total_post_count
        FROM sound_daily_summary_top150 sds
        WHERE sds.fetch_date BETWEEN :start_date AND :end_date
          AND sds.sound_name IS NOT NULL 
          AND sds.sound_name != ''
          {summary_parent_account_type_filter}
        GROUP BY sds.sound_name
        ORDER BY {sort_column} DESC
        LIMIT 51
        """)
        
        result = conn.execute(stats_sql, params)
        summary_results = result.mappings().all()

        # 辞書に変換してサウンド統計を作成
        stats = {}
        sound_names = []
        
        for r in summary_results:
            sound_name = r["sound_name"]
            sound_names.append(sound_name)
            stats[sound_name] = {
                "sound_title": sound_name,
                "sound_artist": None,  # サマリーテーブルにアーティスト情報がない場合
                "sound_id": None,
                "total_play_count_increase": r["total_plays_increase"],
                "videos_over_100k": r["total_over_100k"], 
                "total_posts": r["total_post_count"],
                "top_videos": []
            }

        # 各サウンドのトップ動画を取得
        if sound_names:
            # プレースホルダとパラメータを準備
            sound_placeholders = []
            for i, sound_name in enumerate(sound_names):
                placeholder = f"sound_{i}"
                sound_placeholders.append(f":{placeholder}")
                params[placeholder] = sound_name
            
            # parent_account_typeフィルターの追加（sound_daily_top100_videos用）
            videos_parent_account_type_filter = ""
            if parent_account_type:
                videos_parent_account_type_filter = "AND sdv.parent_account_type = :parent_account_type"
            
            # サウンド関連動画の詳細情報を取得（期間合計でソート）
            videos_sql = text(f"""
            SELECT 
                sdv.sound_name,
                sdv.video_id,
                fd.url,
                fd.thumbnail_url,
                SUM(sdv.plays_increase) AS total_play_inc,
                SUM(sdv.likes_increase) AS total_like_inc,
                MAX(sdv.post_time) AS created_at,
                fd.play_count,
                fd.ten_days_increase,
                fd.account_name,
                fd.display_name,
                fd.play_count_increase,
                fd.account_type
            FROM sound_daily_top100_videos sdv
            JOIN frontend_data fd ON fd.video_id = sdv.video_id
            WHERE sdv.fetch_date BETWEEN :start_date AND :end_date
              AND sdv.sound_name IN ({', '.join(sound_placeholders)})
              {videos_parent_account_type_filter}
            GROUP BY sdv.sound_name, sdv.video_id, fd.url, fd.thumbnail_url, 
                     fd.play_count, fd.ten_days_increase, fd.account_name, 
                     fd.display_name, fd.play_count_increase, fd.account_type
            ORDER BY sdv.sound_name, total_play_inc DESC
            """)
            
            videos_result = conn.execute(videos_sql, params)
            video_rows = videos_result.mappings().all()
            
            # 各サウンドごとに上位20件のトップ動画を追加
            sound_video_counts = {sound: 0 for sound in sound_names}
            
            for video in video_rows:
                sound_name = video["sound_name"]
                if sound_name in stats and sound_video_counts[sound_name] < 20:
                    # frontend_dataから音楽情報を抽出してアーティスト情報を取得
                    if stats[sound_name]["sound_artist"] is None:
                        music_info = fd.get("music_info") if 'fd' in locals() else None
                        if music_info:
                            try:
                                music_data = json.loads(music_info)
                                stats[sound_name]["sound_artist"] = music_data.get("artist")
                                stats[sound_name]["sound_id"] = music_data.get("id")
                            except:
                                pass
                    
                    stats[sound_name]["top_videos"].append({
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
                    sound_video_counts[sound_name] += 1

        logger.info(f"Sound stats query returned {len(stats)} sounds")
        print(f"Sound stats query returned {len(stats)} sounds")
        
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
        logger.error(f"Error fetching sound stats: {str(e)}", exc_info=True)
        print(f"Error fetching sound stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

