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

@router.get("/api/corporate-account-stats")
async def get_corporate_account_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metric: str = "viewsIncrease"
):
    """企業アカウントタイプ別統計を取得するエンドポイント"""
    
    # デフォルトの日付範囲を設定（指定がない場合は直近30日）
    if not start_date or not end_date:
        today = datetime.now()
        end_date = today.strftime('%Y-%m-%d')
        start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
    
    # ソートカラムの決定
    sort_column = get_sort_column(metric)
    
    logger.info(f"企業アカウント統計取得開始: start_date={start_date}, end_date={end_date}, metric={metric}")
    print(f"企業アカウント統計取得開始: start_date={start_date}, end_date={end_date}, metric={metric}")

    params = {"start_date": start_date, "end_date": end_date}
    
    conn = None
    try:
        conn = get_db_connection()
        logger.info(f"企業アカウント統計クエリ実行: metric={metric}, sort_column={sort_column}")
        print(f"企業アカウント統計クエリ実行: metric={metric}, sort_column={sort_column}")

        # アカウントタイプ別統計を取得
        stats_sql = text("""
        SELECT
            fcd.account_type,
            SUM(fcd.play_count_increase) AS total_play_count_increase,
            COUNT(CASE WHEN fcd.play_count >= 100000 THEN 1 END) AS videos_over_100k,
            COUNT(*) AS total_posts
        FROM frontend_corporate_data fcd
        WHERE fcd.created_at BETWEEN :start_date AND :end_date
          AND fcd.account_type IS NOT NULL 
          AND fcd.account_type != ''
        GROUP BY fcd.account_type
        ORDER BY {} DESC
        LIMIT 50
        """.format(sort_column))
        
        result = conn.execute(stats_sql, params)
        summary_results = result.mappings().all()

        # 統計データを作成
        stats = {}
        account_types = []
        
        for r in summary_results:
            account_type = r["account_type"]
            account_types.append(account_type)
            stats[account_type] = {
                "account_type": account_type,
                "total_play_count_increase": r["total_play_count_increase"],
                "videos_over_100k": r["videos_over_100k"], 
                "total_posts": r["total_posts"],
                "top_videos": []
            }

        # 各アカウントタイプのトップ動画を取得
        if account_types:
            # IN句のプレースホルダーを作成
            account_type_placeholders = ",".join([f":account_type_{i}" for i in range(len(account_types))])
            
            # 各アカウントタイプのパラメータを追加
            for i, account_type in enumerate(account_types):
                params[f"account_type_{i}"] = account_type

            top_videos_sql = text(f"""
            SELECT 
                fcd.account_type,
                fcd.url,
                fcd.thumbnail_url,
                fcd.play_count,
                fcd.play_count_increase,
                fcd.likes_count,
                fcd.likes_count_increase,
                fcd.comment_count,
                fcd.account_name,
                fcd.display_name,
                fcd.created_at
            FROM frontend_corporate_data fcd
            WHERE fcd.created_at BETWEEN :start_date AND :end_date
              AND fcd.account_type IN ({account_type_placeholders})
              AND fcd.play_count_increase IS NOT NULL
            ORDER BY fcd.account_type, fcd.play_count_increase DESC
            """)
            
            videos_result = conn.execute(top_videos_sql, params)
            videos_data = videos_result.mappings().all()
            
            # アカウントタイプごとにトップ動画をグループ化
            for video in videos_data:
                account_type = video["account_type"]
                if account_type in stats and len(stats[account_type]["top_videos"]) < 10:
                    stats[account_type]["top_videos"].append({
                        "url": video["url"],
                        "thumbnail_url": video["thumbnail_url"],
                        "play_count": video["play_count"] or 0,
                        "play_count_increase": video["play_count_increase"] or 0,
                        "likes_count": video["likes_count"] or 0,
                        "likes_count_increase": video["likes_count_increase"] or 0,
                        "comments_count": video["comment_count"] or 0,
                        "account_name": video["account_name"] or "",
                        "display_name": video["display_name"] or "",
                        "created_at": video["created_at"].strftime('%Y-%m-%d') if video["created_at"] else "",
                        "ten_days_increase": 0,  # 企業データでは計算しない
                        "play_count_increase_2d": video["play_count_increase"] or 0
                    })
        
        # 結果をリスト形式に変換
        result_data = list(stats.values())
        
        logger.info(f"企業アカウント統計取得完了: {len(result_data)}件のアカウントタイプ")
        print(f"企業アカウント統計取得完了: {len(result_data)}件のアカウントタイプ")
        
        return {
            "data": result_data,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            }
        }

    except Exception as e:
        logger.error(f"企業アカウント統計取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        print(f"企業アカウント統計取得エラー: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"企業アカウント統計情報の取得に失敗しました: {str(e)}"
        )
    finally:
        if conn:
            conn.close()

@router.get("/api/corporate-genres")
async def get_corporate_genres():
    """企業アカウントのジャンル別統計を取得するエンドポイント（全期間）"""
    
    logger.info("企業ジャンル統計取得開始（全期間）")
    
    conn = None
    try:
        conn = get_db_connection()
        
        # 期間フィルターを削除し、全期間で集計
        genres_sql = text("""
        SELECT 
    account_type,
    recruitment_count,
    marketing_count,
    total_count
FROM (
    SELECT
        TRIM(TRAILING ',' FROM 
            CASE 
                WHEN fcd.account_type LIKE '%採用%' THEN TRIM(REPLACE(fcd.account_type, '採用', ''))
                WHEN fcd.account_type LIKE '%集客%' THEN TRIM(REPLACE(fcd.account_type, '集客', ''))
                ELSE fcd.account_type
            END
        ) as account_type,
        COUNT(CASE WHEN fcd.account_type LIKE '%採用%' THEN 1 END) AS recruitment_count,
        COUNT(CASE WHEN fcd.account_type LIKE '%集客%' THEN 1 END) AS marketing_count,
        COUNT(*) AS total_count
    FROM frontend_corporate_data fcd
    WHERE fcd.account_type IS NOT NULL 
      AND fcd.account_type != ''
    GROUP BY 
        TRIM(TRAILING ',' FROM 
            CASE 
                WHEN fcd.account_type LIKE '%採用%' THEN TRIM(REPLACE(fcd.account_type, '採用', ''))
                WHEN fcd.account_type LIKE '%集客%' THEN TRIM(REPLACE(fcd.account_type, '集客', ''))
                ELSE fcd.account_type
            END
        )
    HAVING total_count > 0
) AS grouped_data
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
                "startDate": "全期間",
                "endDate": "全期間"
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
    days: Optional[str] = "30",
    limit: Optional[int] = 9
):
    """ジャンル・目的別の企業動画を取得するエンドポイント"""
    
    # 期間を計算
    try:
        days_int = int(days)
    except ValueError:
        days_int = 30
    
    today = datetime.now()
    end_date = today.strftime('%Y-%m-%d')
    start_date = (today - timedelta(days=days_int)).strftime('%Y-%m-%d')
    
    logger.info(f"企業動画取得開始: account_type={account_type}, purpose={purpose}, days={days}")
    
    params = {
        "start_date": start_date, 
        "end_date": end_date,
        "account_type_pattern": f"%{account_type}%",  # '企業' → '%企業%'
        "purpose_pattern": f"%{purpose}%"             # '採用' → '%採用%'
    }
    
    conn = None
    try:
        conn = get_db_connection()
        
        # 指定されたジャンル・目的の動画を取得
        videos_sql = text("""
        SELECT
            fcd.url,
            fcd.thumbnail_url,
            fcd.play_count,
            fcd.play_count_increase,
            fcd.likes_count_increase,
            fcd.created_at,
            fcd.account_name,
            fcd.display_name,
            fcd.account_type,
            CASE 
                WHEN fcd.account_type LIKE '%採用%' THEN '採用'
                WHEN fcd.account_type LIKE '%集客%' THEN '集客'
                ELSE NULL
            END as second_account_type
        FROM frontend_corporate_data fcd
        WHERE fcd.created_at BETWEEN :start_date AND :end_date
          AND fcd.account_type LIKE :account_type_pattern
          AND fcd.account_type LIKE :purpose_pattern
          AND fcd.play_count_increase IS NOT NULL
        ORDER BY fcd.play_count_increase DESC
        LIMIT :limit
        """)
        
        params["limit"] = limit
        result = conn.execute(videos_sql, params)
        videos_results = result.mappings().all()
        
        # 結果を整形
        videos_data = []
        for row in videos_results:
            videos_data.append({
                "url": row["url"],
                "thumbnail_url": row["thumbnail_url"],
                "play_count": int(row["play_count"] or 0),
                "play_count_increase": int(row["play_count_increase"] or 0),
                "likes_count_increase": int(row["likes_count_increase"] or 0),
                "created_at": row["created_at"].strftime('%Y-%m-%d') if row["created_at"] else "",
                "account_name": row["account_name"] or "",
                "display_name": row["display_name"] or "",
                "account_type": row["account_type"],
                "second_account_type": row["second_account_type"]
            })
        
        logger.info(f"企業動画取得完了: {len(videos_data)}件の動画")
        
        return {
            "success": True,
            "data": videos_data
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