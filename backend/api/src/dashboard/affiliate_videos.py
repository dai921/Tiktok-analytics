from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from src.db.database import execute_query, fetch_one, format_video
from src.utils.video_utils import (
    build_video_query, apply_filters, apply_sorting, 
    format_last_updated
)
import traceback

router = APIRouter()

@router.get("/api/affiliate-videos")
async def get_affiliate_videos(
    request: Request,
    page: int = 1,
    limit: int = 50,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    sort_by_secondary: Optional[str] = "play_count",
    sort_order_secondary: Optional[str] = "desc",
):
    print(f"Received affiliate request with params: {request.query_params}")

    try:
        # 基本クエリ構築 - frontend_dataテーブルを使用
        query = build_video_query("frontend_affiliate_data")
        params = {}
        where_clauses = []

        # アフィリエイト系動画のフィルタリング条件を追加

        # フィルター適用
        query, params = apply_filters(query, params, where_clauses, request, "frontend_affiliate_data")

        # ソート適用
        query = apply_sorting(query, sort_by, sort_order, sort_by_secondary, sort_order_secondary)

        # ページネーション処理
        offset = (page - 1) * limit
        base_query = query

        if limit != -1:
            query += " LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset

        # クエリ実行
        rows = execute_query(query, params)

        # 総件数取得
        count_query = f"SELECT COUNT(*) as total FROM ({base_query}) as count_query"
        total_result = fetch_one(count_query, params)
        total = total_result["total"] if total_result else 0

        return {
            "data": [format_video(row) for row in rows],
            "total": total,
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit if limit > 0 else 1,
            "success": True
        }

    except Exception as e:
        print(f"Error in get_affiliate_videos: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(e)}
        ) 