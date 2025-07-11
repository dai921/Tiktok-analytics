from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from src.db.database import execute_query, fetch_one, format_video
from src.utils.logger_config import setup_logger
import traceback

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
    """インフルエンサー動画データを取得するエンドポイント"""
    print(f"インフルエンサー動画リクエスト受信: {request.query_params}")
    logger.info(f"インフルエンサー動画データ取得リクエスト: page={page}, limit={limit}")

    try:
        # 基本クエリ（frontend_influencer_dataテーブルを使用）
        query = """
            SELECT 
                url, thumbnail_url, created_at, play_count, play_count_increase, 
                ten_days_increase, account_name, display_name, content_type, 
                likes_count, comment_count, likes_count_increase, ten_days_likes_increase,
                comment_count_increase, ten_days_comment_increase, account_type,
                hashtags, music_info, caption, category, product, save_count, 
                save_count_increase, ten_days_save_increase
            FROM frontend_influencer_data
        """
        params = {}
        where_clauses = []

        # フィルター処理（通常の動画APIと同じロジック）
        if account_name:
            escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_name LIKE :account_name")
            params["account_name"] = f"%{escaped_account_name}%"
        
        # カテゴリフィルターのOR条件処理
        category_filters = []
        category_count = request.query_params.get('category_count')
        if category_count and category_count.isdigit():
            count = int(category_count)
            for i in range(count):
                cat_param = request.query_params.get(f'category_{i}')
                if cat_param:
                    escaped_cat = cat_param.replace("_", r"\_").replace("%", r"\%")
                    category_filters.append(f"category LIKE :category_{i}")
                    params[f"category_{i}"] = f"%{escaped_cat}%"
        
        if category_filters:
            where_clauses.append(f"({' OR '.join(category_filters)})")
        elif category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE :category")
            params["category"] = f"%{escaped_category}%"
        
        if hashtags:
            exact_hashtags = request.query_params.get('exact_hashtags')
            if exact_hashtags == 'true':
                where_clauses.append("(hashtags = :hashtags OR hashtags LIKE :hashtags_start OR hashtags LIKE :hashtags_middle OR hashtags LIKE :hashtags_end)")
                hashtags_exact = hashtags
                params["hashtags"] = hashtags_exact
                params["hashtags_start"] = f"{hashtags_exact},%"
                params["hashtags_middle"] = f"%,{hashtags_exact},%"
                params["hashtags_end"] = f"%,{hashtags_exact}"
                print(f"インフルエンサー動画: ハッシュタグ完全一致検索を適用: {hashtags_exact}")
            else:
                escaped_hashtags = hashtags.replace("_", r"\_").replace("%", r"\%")
                where_clauses.append("hashtags LIKE :hashtags")
                params["hashtags"] = f"%{escaped_hashtags}%"
                print(f"インフルエンサー動画: ハッシュタグ部分一致検索を適用: {escaped_hashtags}")
            
        if music_info:
            escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("music_info LIKE :music_info")
            params["music_info"] = f"%{escaped_music_info}%"
            
        if min_play_count:
            where_clauses.append("play_count >= :min_play_count")
            params["min_play_count"] = min_play_count
            
        if min_likes_count:
            where_clauses.append("likes_count >= :min_likes_count")
            params["min_likes_count"] = min_likes_count

        # 数値フィルターの処理
        if play_count is not None:
            if play_count_type == "greater":
                where_clauses.append("play_count >= :play_count")
            elif play_count_type == "less":
                where_clauses.append("play_count <= :play_count")
            else:
                where_clauses.append("play_count = :play_count")
            params["play_count"] = play_count

        if created_at:
            if created_at_type == "after" or created_at_type == "greater":
                where_clauses.append("created_at >= :created_at")
            elif created_at_type == "before" or created_at_type == "less":
                where_clauses.append("created_at <= :created_at")
            else:
                where_clauses.append("DATE(created_at) = DATE(:created_at)")
            params["created_at"] = created_at

        if likes_count is not None:
            if likes_count_type == "greater":
                where_clauses.append("likes_count >= :likes_count")
            elif likes_count_type == "less":
                where_clauses.append("likes_count <= :likes_count")
            else:
                where_clauses.append("likes_count = :likes_count")
            params["likes_count"] = likes_count

        if comment_count is not None:
            if comment_count_type == "greater":
                where_clauses.append("comment_count >= :comment_count")
            elif comment_count_type == "less":
                where_clauses.append("comment_count <= :comment_count")
            else:
                where_clauses.append("comment_count = :comment_count")
            params["comment_count"] = comment_count

        if play_count_increase is not None and play_count_increase_type:
            if play_count_increase_type == "greater":
                where_clauses.append("play_count_increase >= :play_count_increase")
            elif play_count_increase_type == "less":
                where_clauses.append("play_count_increase <= :play_count_increase")
            else:
                where_clauses.append("play_count_increase = :play_count_increase")
            params["play_count_increase"] = play_count_increase

        if ten_days_increase is not None:
            if ten_days_increase_type == "greater":
                where_clauses.append("ten_days_increase >= :ten_days_increase")
            elif ten_days_increase_type == "less":
                where_clauses.append("ten_days_increase <= :ten_days_increase")
            else:
                where_clauses.append("ten_days_increase = :ten_days_increase")
            params["ten_days_increase"] = ten_days_increase

        if likes_count_increase is not None:
            if likes_count_increase_type == "greater":
                where_clauses.append("likes_count_increase >= :likes_count_increase")
            elif likes_count_increase_type == "less":
                where_clauses.append("likes_count_increase <= :likes_count_increase")
            else:
                where_clauses.append("likes_count_increase = :likes_count_increase")
            params["likes_count_increase"] = likes_count_increase

        if ten_days_likes_increase is not None:
            if ten_days_likes_increase_type == "greater":
                where_clauses.append("ten_days_likes_increase >= :ten_days_likes_increase")
            elif ten_days_likes_increase_type == "less":
                where_clauses.append("ten_days_likes_increase <= :ten_days_likes_increase")
            else:
                where_clauses.append("ten_days_likes_increase = :ten_days_likes_increase")
            params["ten_days_likes_increase"] = ten_days_likes_increase

        if comment_count_increase is not None:
            if comment_count_increase_type == "greater":
                where_clauses.append("comment_count_increase >= :comment_count_increase")
            elif comment_count_increase_type == "less":
                where_clauses.append("comment_count_increase <= :comment_count_increase")
            else:
                where_clauses.append("comment_count_increase = :comment_count_increase")
            params["comment_count_increase"] = comment_count_increase

        if ten_days_comment_increase is not None:
            if ten_days_comment_increase_type == "greater":
                where_clauses.append("ten_days_comment_increase >= :ten_days_comment_increase")
            elif ten_days_comment_increase_type == "less":
                where_clauses.append("ten_days_comment_increase <= :ten_days_comment_increase")
            else:
                where_clauses.append("ten_days_comment_increase = :ten_days_comment_increase")
            params["ten_days_comment_increase"] = ten_days_comment_increase

        # 保存数関連のフィルタリング
        if save_count is not None:
            if save_count_type == "greater":
                where_clauses.append("save_count >= :save_count")
            elif save_count_type == "less":
                where_clauses.append("save_count <= :save_count")
            else:
                where_clauses.append("save_count = :save_count")
            params["save_count"] = save_count

        if save_count_increase is not None:
            if save_count_increase_type == "greater":
                where_clauses.append("save_count_increase >= :save_count_increase")
            elif save_count_increase_type == "less":
                where_clauses.append("save_count_increase <= :save_count_increase")
            else:
                where_clauses.append("save_count_increase = :save_count_increase")
            params["save_count_increase"] = save_count_increase

        if ten_days_save_increase is not None:
            if ten_days_save_increase_type == "greater":
                where_clauses.append("ten_days_save_increase >= :ten_days_save_increase")
            elif ten_days_save_increase_type == "less":
                where_clauses.append("ten_days_save_increase <= :ten_days_save_increase")
            else:
                where_clauses.append("ten_days_save_increase = :ten_days_save_increase")
            params["ten_days_save_increase"] = ten_days_save_increase

        # コンテンツタイプのフィルタリング
        if content_type:
            if ',' in content_type:
                content_types = content_type.split(',')
                content_type_clauses = []
                for i, ct in enumerate(content_types):
                    content_type_clauses.append(f"content_type = :content_type_{i}")
                    params[f"content_type_{i}"] = ct.strip()
                where_clauses.append(f"({' OR '.join(content_type_clauses)})")
                print(f"インフルエンサー動画: 複数コンテンツタイプフィルター適用: {content_types}")
            else:
                where_clauses.append("content_type = :content_type")
                params["content_type"] = content_type
                print(f"インフルエンサー動画: 単一コンテンツタイプフィルター適用: {content_type}")

        # 商品フィルターの処理
        product_filters = []
        product_count = request.query_params.get('product_count')
        if product_count and product_count.isdigit():
            count = int(product_count)
            for i in range(count):
                product_param = request.query_params.get(f'product_{i}')
                if product_param:
                    escaped_product = product_param.replace("_", r"\_").replace("%", r"\%")
                    product_filters.append(f"product LIKE :product_{i}")
                    params[f"product_{i}"] = f"%{escaped_product}%"

        if product_filters:
            where_clauses.append(f"({' OR '.join(product_filters)})")
        elif product:
            escaped_product = product.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("product LIKE :product")
            params["product"] = f"%{escaped_product}%"
        
        # アカウントタイプフィルターの処理
        account_type_filters = []
        account_type_count = request.query_params.get('account_type_count')
        if account_type_count and account_type_count.isdigit():
            count = int(account_type_count)
            for i in range(count):
                account_param = request.query_params.get(f'account_type_{i}')
                if account_param:
                    escaped_account = account_param.replace("_", r"\_").replace("%", r"\%")
                    account_type_filters.append(f"account_type LIKE :account_type_{i}")
                    params[f"account_type_{i}"] = f"%{escaped_account}%"

        if account_type_filters:
            where_clauses.append(f"({' OR '.join(account_type_filters)})")
        elif account_type:
            escaped_account_type = account_type.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_type LIKE :account_type")
            params["account_type"] = f"%{escaped_account_type}%"

        # WHERE句の追加
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理
        column_mapping = {
            "audioTitle": "music_info",
            "saveCount": "save_count",
            "saveCountIncrease": "save_count_increase",
            "tenDaysSaveIncrease": "ten_days_save_increase"
        }
        
        actual_sort_by = column_mapping.get(sort_by, sort_by)
        sort_clause = f" ORDER BY {actual_sort_by} {sort_order}"
        
        if sort_by_secondary:
            actual_sort_by_secondary = column_mapping.get(sort_by_secondary, sort_by_secondary)
            sort_clause += f", {actual_sort_by_secondary} {sort_order_secondary}"
            print(f"インフルエンサー動画: 二次ソート適用: {actual_sort_by_secondary} {sort_order_secondary}")
        
        query += sort_clause
        print(f"インフルエンサー動画: ソート条件: {sort_clause}")

        # フィルタパラメータを保持
        filter_params = params.copy()

        # ページネーション用にLIMIT/OFFSETを追加
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
        total_result = fetch_one(count_query, filter_params)
        total = total_result["total"] if total_result else 0

        # 最新投稿日を取得
        latest_date_result = fetch_one("SELECT MAX(created_at) as max_date FROM frontend_influencer_data")
        global_latest_date = latest_date_result["max_date"] if latest_date_result else None
        
        filtered_latest_query = f"SELECT MAX(created_at) as max_date FROM ({base_query}) as latest_query"
        filtered_latest_result = fetch_one(filtered_latest_query, filter_params)
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
