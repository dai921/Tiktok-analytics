from fastapi import APIRouter, HTTPException
from typing import Optional
from src.db.database import get_db_connection
from src.utils.logger_config import setup_logger
from sqlalchemy import text
from datetime import datetime, timedelta
import traceback

router = APIRouter()
logger = setup_logger()

def get_sort_column(metric: str) -> str:
    """指標に基づいてソートするカラム名を返す"""
    sort_mapping = {
        "viewsIncrease": "total_play_count_increase",
        "over100kViews": "videos_over_100k", 
        "postCount": "total_posts"
    }
    return sort_mapping.get(metric, "total_play_count_increase")

@router.get("/api/corporate-genres")
async def get_corporate_genres():
    """企業アカウントのジャンル別統計を取得するエンドポイント（デフォルト期間付き）"""
    
    # デフォルト期間を設定（fetch_dateベース）
    conn = None
    try:
        conn = get_db_connection()
        
        # 実際のデータ収集日を確認
        query = text("""
        SELECT DISTINCT fetch_date
        FROM corporate_daily_top100_videos
        WHERE fetch_date IS NOT NULL
        ORDER BY fetch_date DESC
        LIMIT 7
        """)
        
        result = conn.execute(query)
        dates = result.fetchall()
        
        if dates:
            end_date = dates[0][0].strftime('%Y-%m-%d')
            start_date = dates[-1][0].strftime('%Y-%m-%d')
        else:
            # フォールバック
            today = datetime.now()
            end_date = today.strftime('%Y-%m-%d')
            start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
        
        logger.info(f"企業ジャンル統計取得開始: デフォルト期間={start_date}〜{end_date}")
        
        # corporate_daily_top100_videosテーブルを使ってシンプルに集計
        genres_sql = text("""
        SELECT 
            account_type,
            COUNT(CASE WHEN second_account_type = '採用' THEN 1 END) AS recruitment_count,
            COUNT(CASE WHEN second_account_type = '集客' THEN 1 END) AS marketing_count,
            COUNT(*) AS total_count
        FROM corporate_daily_top100_videos
        WHERE account_type IS NOT NULL 
          AND account_type != ''
          AND account_type != 'None'
        GROUP BY account_type
        HAVING total_count > 0
        ORDER BY 
            CASE WHEN account_type = 'その他' THEN 1 ELSE 0 END,
            total_count DESC
        """)
        
        result = conn.execute(genres_sql)
        genres_results = result.mappings().all()
        
        # 結果を整形
        genres_data = []
        for row in genres_results:
            account_type = row["account_type"]
            # 追加のカンマ除去処理（念のため）
            if account_type:
                account_type = account_type.rstrip(',').strip()
            
            genres_data.append({
                "account_type": account_type,
                "recruitment_count": int(row["recruitment_count"] or 0),
                "marketing_count": int(row["marketing_count"] or 0),
                "total_count": int(row["total_count"] or 0)
            })
        
        logger.info(f"企業ジャンル統計取得完了: {len(genres_data)}件のジャンル")
        
        return {
            "success": True,
            "data": genres_data,
            "dateRange": {
                "startDate": start_date,
                "endDate": end_date
            }
        }

    except Exception as e:
        logger.error(f"企業ジャンル統計取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"企業ジャンル統計情報の取得に失敗しました: {str(e)}"
        )
    finally:
        if conn:
            conn.close()

@router.get("/api/corporate-videos-by-genre")
async def get_corporate_videos_by_genre(
    account_type: str,
    purpose: str,  # '採用' または '集客'
    start_date: Optional[str] = None,  # 追加
    end_date: Optional[str] = None,    # 追加
    limit: Optional[int] = 20  # 9 から 20 に変更
):
    """ジャンル・目的別の企業動画を取得するエンドポイント"""
    
    # 期間を計算
    if start_date and end_date:
        # フロントエンドから指定された期間を使用
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d')
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
    else:
        # デフォルト期間（fetch_dateベース）
        conn_temp = get_db_connection()
        try:
            # 実際のデータ収集日を確認
            query = text("""
            SELECT DISTINCT fetch_date
            FROM corporate_daily_top100_videos
            WHERE fetch_date IS NOT NULL
            ORDER BY fetch_date DESC
            LIMIT 7
            """)
            
            result = conn_temp.execute(query)
            dates = result.fetchall()
            
            if dates:
                end_date = dates[0][0].strftime('%Y-%m-%d')
                start_date = dates[-1][0].strftime('%Y-%m-%d')
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d')
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
            else:
                # フォールバック
                today = datetime.now()
                end_date_obj = today
                start_date_obj = today - timedelta(days=30)
                start_date = start_date_obj.strftime('%Y-%m-%d')
                end_date = end_date_obj.strftime('%Y-%m-%d')
        finally:
            conn_temp.close()
    
    logger.info(f"企業動画取得開始: account_type={account_type}, purpose={purpose}, period={start_date}〜{end_date}")
    
    conn = None
    try:
        conn = get_db_connection()
        
        # corporate_daily_top100_videosから期間合計を取得（frontend_corporate_dataとJOIN）
        videos_sql = text("""
            SELECT 
                fcd.url,
                fcd.thumbnail_url,
                fcd.play_count,
                SUM(ct.plays_increase) as play_count_increase,
                SUM(ct.likes_increase) as likes_count_increase,
                MAX(ct.post_time) as created_at,
                fcd.account_name,
                fcd.display_name,
                ct.account_type,
                ct.second_account_type
            FROM corporate_daily_top100_videos ct
            LEFT JOIN frontend_corporate_data fcd ON ct.video_id COLLATE utf8mb4_unicode_ci = fcd.video_id COLLATE utf8mb4_unicode_ci
            WHERE ct.fetch_date BETWEEN :start_date AND :end_date
            AND TRIM(TRAILING ',' FROM 
                CASE 
                    WHEN ct.account_type LIKE '%採用%' THEN TRIM(REPLACE(ct.account_type, '採用', ''))
                    WHEN ct.account_type LIKE '%集客%' THEN TRIM(REPLACE(ct.account_type, '集客', ''))
                    ELSE ct.account_type
                END
            ) LIKE :account_type_pattern
            AND ct.second_account_type = :purpose
            GROUP BY ct.video_id, fcd.url, fcd.thumbnail_url, fcd.play_count, fcd.account_name, fcd.display_name, ct.account_type, ct.second_account_type
            ORDER BY SUM(ct.plays_increase) DESC
            LIMIT :limit
            """)
        
        params = {
            "start_date": start_date,
            "end_date": end_date,
            "account_type_pattern": f"%{account_type}%",
            "purpose": purpose,
            "limit": limit
        }
        
        result = conn.execute(videos_sql, params)
        videos_results = result.mappings().all()
        
        # 結果を整形
        videos_data = []
        for row in videos_results:
            videos_data.append({
                "url": row["url"] or "",
                "thumbnail_url": convert_gs_to_https(row["thumbnail_url"]) or "",  # ここを修正
                "play_count": int(row["play_count"] or 0),
                "play_count_increase": int(row["play_count_increase"] or 0),
                "likes_count_increase": int(row["likes_count_increase"] or 0),
                "created_at": row["created_at"].strftime('%Y-%m-%d') if row["created_at"] else "",
                "account_name": row["account_name"] or "",
                "display_name": row["display_name"] or "",
                "account_type": row["account_type"] or "",
                "second_account_type": row["second_account_type"] or purpose
            })
        
        logger.info(f"企業動画取得完了: {len(videos_data)}件の動画")
        
        return {
            "success": True,
            "data": videos_data,
            "dateRange": {
                "startDate": start_date,
                "endDate": end_date
            }
        }

    except Exception as e:
        logger.error(f"企業動画取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"企業動画の取得に失敗しました: {str(e)}"
        )
    finally:
        if conn:
            conn.close() 

# convert_gs_to_https関数を追加（他のAPIファイルと同じように）
def convert_gs_to_https(url: Optional[str]) -> Optional[str]:
    if url and url.startswith('gs://'):
        parts = url.split('/')
        bucket = parts[2]
        object_path = '/'.join(parts[3:])
        return f"https://storage.googleapis.com/{bucket}/{object_path}"
    return url 