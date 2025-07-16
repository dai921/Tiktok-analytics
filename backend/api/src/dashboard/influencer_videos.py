from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from src.db.database import execute_query, fetch_one, format_video
from src.utils.logger_config import setup_logger
import traceback
from src.utils.video_utils import (
    build_video_query, apply_filters, apply_sorting, 
    format_last_updated
)

router = APIRouter()
logger = setup_logger()

@router.get("/api/influencer-videos")
async def get_influencer_videos(
    request: Request,
    page: int = 1,
    limit: int = 50,
    account_name: Optional[str] = None,
    category: Optional[str] = None,
    hashtags: Optional[str] = None,
    music_info: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_play_count: Optional[int] = None,
    min_likes_count: Optional[int] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    sort_by_secondary: Optional[str] = "play_count",
    sort_order_secondary: Optional[str] = "desc",
    play_count: Optional[int] = None,
    play_count_type: Optional[str] = None,
    likes_count: Optional[int] = None,
    likes_count_type: Optional[str] = None,
    comment_count: Optional[int] = None,
    comment_count_type: Optional[str] = None,
    play_count_increase: Optional[int] = None,
    play_count_increase_type: Optional[str] = None,
    content_type: Optional[str] = None,
    ten_days_increase: Optional[int] = None,
    ten_days_increase_type: Optional[str] = None,
    likes_count_increase: Optional[int] = None,
    likes_count_increase_type: Optional[str] = None,
    ten_days_likes_increase: Optional[int] = None,
    ten_days_likes_increase_type: Optional[str] = None,
    comment_count_increase: Optional[int] = None,
    comment_count_increase_type: Optional[str] = None,
    ten_days_comment_increase: Optional[int] = None,
    ten_days_comment_increase_type: Optional[str] = None,
    exact_hashtags: Optional[str] = None,
    save_count: Optional[int] = None,
    save_count_type: Optional[str] = None,
    save_count_increase: Optional[int] = None,
    save_count_increase_type: Optional[str] = None,
    ten_days_save_increase: Optional[int] = None,
    ten_days_save_increase_type: Optional[str] = None,
    product: Optional[str] = None,
    account_type: Optional[str] = None,
    account_type_count: Optional[int] = None,
    created_at: Optional[str] = None,
    created_at_type: Optional[str] = None,
):
    
    print(f"インフルエンサー動画リクエスト受信: {request.query_params}")
    logger.info(f"インフルエンサー動画データ取得リクエスト: page={page}, limit={limit}")

    try:
        # 基本クエリ構築 - frontend_dataテーブルを使用
        query = build_video_query("frontend_data")
        params = {}
        where_clauses = []

        # インフルエンサー系動画のフィルタリング条件を追加
        # is_pr = 0 (非PR動画) かつ個人アカウントやエンターテイメント系
        where_clauses.append("(is_pr = 0 OR is_pr IS NULL)")
        where_clauses.append("(account_type IS NOT NULL AND account_type != '' AND (account_type LIKE '%個人%' OR account_type LIKE '%エンタメ%' OR account_type LIKE '%インフルエンサー%' OR account_type LIKE '%クリエイター%'))")

        # フィルター適用
        query, params = apply_filters(query, params, where_clauses, request, "frontend_data")

        # ソート適用
        query = apply_sorting(query, sort_by, sort_order, sort_by_secondary, sort_order_secondary)

        # ページネーション処理
        offset = (page - 1) * limit
        base_query = query

        if limit == -1:
            print("インフルエンサー動画: 全件取得モードが指定されました")
        else:
            query += " LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset

        # デバッグ用にクエリとパラメータを出力
        print(f"インフルエンサー動画クエリ実行: {query}")
        print(f"インフルエンサー動画パラメータ: {params}")

        # メインクエリ実行
        rows = execute_query(query, params)

        # 総件数取得
        count_query = f"SELECT COUNT(*) as total FROM ({base_query}) as count_query"
        total_result = fetch_one(count_query, params)
        total = total_result["total"] if total_result else 0

        # 最新投稿日を取得 - frontend_dataテーブルを使用
        latest_date_result = fetch_one("SELECT MAX(created_at) as max_date FROM frontend_data WHERE (is_pr = 0 OR is_pr IS NULL) AND (account_type IS NOT NULL AND account_type != '' AND (account_type LIKE '%個人%' OR account_type LIKE '%エンタメ%' OR account_type LIKE '%インフルエンサー%' OR account_type LIKE '%クリエイター%'))")
        global_latest_date = latest_date_result["max_date"] if latest_date_result else None
        
        filtered_latest_query = f"SELECT MAX(created_at) as max_date FROM ({base_query}) as latest_query"
        filtered_latest_result = fetch_one(filtered_latest_query, params)
        filtered_latest_date = filtered_latest_result["max_date"] if filtered_latest_result else None

        logger.info(f"インフルエンサー動画データ取得完了: total={total}, page={page}")

        return {
            "data": [format_video(row) for row in rows],
            "total": total,
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit if limit > 0 else 1,
            "success": True,
            "lastUpdated": {
                "date": filtered_latest_date.strftime("%y/%m/%d") if filtered_latest_date else None,
                "isFiltered": bool(where_clauses),
                "globalLastUpdated": global_latest_date.strftime("%y/%m/%d") if global_latest_date else None
            }
        }

    except Exception as e:
        print(f"インフルエンサー動画取得エラー: {str(e)}")
        print(traceback.format_exc())
        logger.error(f"インフルエンサー動画取得エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": str(e)
            }
        )
