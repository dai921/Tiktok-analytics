from typing import Dict, List, Optional
from fastapi import Request
from src.db.database import execute_query, fetch_one, format_video
from datetime import datetime, timedelta

def build_video_query(table_name: str = "frontend_data") -> str:
    """動画クエリの基本部分を構築"""
    return f"""
        SELECT 
            url, thumbnail_url, created_at, play_count, play_count_increase, 
            ten_days_increase, account_name, display_name, content_type, 
            likes_count, comment_count, likes_count_increase, ten_days_likes_increase,
            comment_count_increase, ten_days_comment_increase, account_type,
            hashtags, music_info, caption, category, product, save_count, 
            save_count_increase, ten_days_save_increase
        FROM {table_name}
    """

def apply_filters(query: str, params: Dict, where_clauses: List[str], request: Request, table_name: str = "frontend_data") -> tuple:
    """フィルター条件を適用"""
    # アカウント名フィルター
    account_name = request.query_params.get('account_name')
    if account_name:
        escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
        where_clauses.append("account_name LIKE :account_name")
        params["account_name"] = f"%{escaped_account_name}%"
    
    # カテゴリフィルター
    apply_category_filters(request, params, where_clauses)
    
    # ハッシュタグフィルター
    apply_hashtag_filters(request, params, where_clauses)
    
    # その他のフィルター処理
    apply_other_filters(request, params, where_clauses)
    
    # WHERE句の追加
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
    
    return query, params

def apply_category_filters(request: Request, params: Dict, where_clauses: List[str]):
    """カテゴリフィルターを適用"""
    category_filters = []
    
    # 複数カテゴリ処理
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
    else:
        # 単一カテゴリ処理
        category = request.query_params.get('category')
        if category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE :category")
            params["category"] = f"%{escaped_category}%"

def apply_hashtag_filters(request: Request, params: Dict, where_clauses: List[str]):
    """ハッシュタグフィルターを適用"""
    hashtags = request.query_params.get('hashtags')
    if hashtags:
        exact_hashtags = request.query_params.get('exact_hashtags')
        if exact_hashtags == 'true':
            where_clauses.append("(hashtags = :hashtags OR hashtags LIKE :hashtags_start OR hashtags LIKE :hashtags_middle OR hashtags LIKE :hashtags_end)")
            params["hashtags"] = hashtags
            params["hashtags_start"] = f"{hashtags},%"
            params["hashtags_middle"] = f"%,{hashtags},%"
            params["hashtags_end"] = f"%,{hashtags}"
        else:
            escaped_hashtags = hashtags.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("hashtags LIKE :hashtags")
            params["hashtags"] = f"%{escaped_hashtags}%"

def apply_other_filters(request: Request, params: Dict, where_clauses: List[str]):
    """その他のフィルターを適用"""
    # 数値フィルター
    apply_numeric_filters(request, params, where_clauses)
    
    # 日付フィルター
    apply_date_filters(request, params, where_clauses)
    
    # コンテンツタイプフィルター
    apply_content_type_filters(request, params, where_clauses)
    
    # 商品フィルター
    apply_product_filters(request, params, where_clauses)
    
    # アカウントタイプフィルター
    apply_account_type_filters(request, params, where_clauses)
    
    # 音楽情報フィルター
    apply_music_filters(request, params, where_clauses)

def apply_numeric_filters(request: Request, params: Dict, where_clauses: List[str]):
    """数値フィルターを適用"""
    # 再生数フィルター
    play_count = request.query_params.get('play_count')
    play_count_type = request.query_params.get('play_count_type')
    if play_count is not None:
        if play_count_type == "greater":
            where_clauses.append("play_count >= :play_count")
        elif play_count_type == "less":
            where_clauses.append("play_count <= :play_count")
        else:
            where_clauses.append("play_count = :play_count")
        params["play_count"] = int(play_count)
    
    # いいね数フィルター
    likes_count = request.query_params.get('likes_count')
    likes_count_type = request.query_params.get('likes_count_type')
    if likes_count is not None:
        if likes_count_type == "greater":
            where_clauses.append("likes_count >= :likes_count")
        elif likes_count_type == "less":
            where_clauses.append("likes_count <= :likes_count")
        else:
            where_clauses.append("likes_count = :likes_count")
        params["likes_count"] = int(likes_count)
    
    # コメント数フィルター
    comment_count = request.query_params.get('comment_count')
    comment_count_type = request.query_params.get('comment_count_type')
    if comment_count is not None:
        if comment_count_type == "greater":
            where_clauses.append("comment_count >= :comment_count")
        elif comment_count_type == "less":
            where_clauses.append("comment_count <= :comment_count")
        else:
            where_clauses.append("comment_count = :comment_count")
        params["comment_count"] = int(comment_count)
    
    # 再生数増加フィルター
    play_count_increase = request.query_params.get('play_count_increase')
    play_count_increase_type = request.query_params.get('play_count_increase_type')
    if play_count_increase is not None and play_count_increase_type:
        if play_count_increase_type == "greater":
            where_clauses.append("play_count_increase >= :play_count_increase")
        elif play_count_increase_type == "less":
            where_clauses.append("play_count_increase <= :play_count_increase")
        else:
            where_clauses.append("play_count_increase = :play_count_increase")
        params["play_count_increase"] = int(play_count_increase)
    
    # 10日間増加フィルター
    ten_days_increase = request.query_params.get('ten_days_increase')
    ten_days_increase_type = request.query_params.get('ten_days_increase_type')
    if ten_days_increase is not None:
        if ten_days_increase_type == "greater":
            where_clauses.append("ten_days_increase >= :ten_days_increase")
        elif ten_days_increase_type == "less":
            where_clauses.append("ten_days_increase <= :ten_days_increase")
        else:
            where_clauses.append("ten_days_increase = :ten_days_increase")
        params["ten_days_increase"] = int(ten_days_increase)
    
    # いいね数増加フィルター
    likes_count_increase = request.query_params.get('likes_count_increase')
    likes_count_increase_type = request.query_params.get('likes_count_increase_type')
    if likes_count_increase is not None:
        if likes_count_increase_type == "greater":
            where_clauses.append("likes_count_increase >= :likes_count_increase")
        elif likes_count_increase_type == "less":
            where_clauses.append("likes_count_increase <= :likes_count_increase")
        else:
            where_clauses.append("likes_count_increase = :likes_count_increase")
        params["likes_count_increase"] = int(likes_count_increase)
    
    # 10日間いいね増加フィルター
    ten_days_likes_increase = request.query_params.get('ten_days_likes_increase')
    ten_days_likes_increase_type = request.query_params.get('ten_days_likes_increase_type')
    if ten_days_likes_increase is not None:
        if ten_days_likes_increase_type == "greater":
            where_clauses.append("ten_days_likes_increase >= :ten_days_likes_increase")
        elif ten_days_likes_increase_type == "less":
            where_clauses.append("ten_days_likes_increase <= :ten_days_likes_increase")
        else:
            where_clauses.append("ten_days_likes_increase = :ten_days_likes_increase")
        params["ten_days_likes_increase"] = int(ten_days_likes_increase)
    
    # コメント数増加フィルター
    comment_count_increase = request.query_params.get('comment_count_increase')
    comment_count_increase_type = request.query_params.get('comment_count_increase_type')
    if comment_count_increase is not None:
        if comment_count_increase_type == "greater":
            where_clauses.append("comment_count_increase >= :comment_count_increase")
        elif comment_count_increase_type == "less":
            where_clauses.append("comment_count_increase <= :comment_count_increase")
        else:
            where_clauses.append("comment_count_increase = :comment_count_increase")
        params["comment_count_increase"] = int(comment_count_increase)
    
    # 10日間コメント増加フィルター
    ten_days_comment_increase = request.query_params.get('ten_days_comment_increase')
    ten_days_comment_increase_type = request.query_params.get('ten_days_comment_increase_type')
    if ten_days_comment_increase is not None:
        if ten_days_comment_increase_type == "greater":
            where_clauses.append("ten_days_comment_increase >= :ten_days_comment_increase")
        elif ten_days_comment_increase_type == "less":
            where_clauses.append("ten_days_comment_increase <= :ten_days_comment_increase")
        else:
            where_clauses.append("ten_days_comment_increase = :ten_days_comment_increase")
        params["ten_days_comment_increase"] = int(ten_days_comment_increase)
    
    # 保存数フィルター
    save_count = request.query_params.get('save_count')
    save_count_type = request.query_params.get('save_count_type')
    if save_count is not None:
        if save_count_type == "greater":
            where_clauses.append("save_count >= :save_count")
        elif save_count_type == "less":
            where_clauses.append("save_count <= :save_count")
        else:
            where_clauses.append("save_count = :save_count")
        params["save_count"] = int(save_count)
    
    # 保存数増加フィルター
    save_count_increase = request.query_params.get('save_count_increase')
    save_count_increase_type = request.query_params.get('save_count_increase_type')
    if save_count_increase is not None:
        if save_count_increase_type == "greater":
            where_clauses.append("save_count_increase >= :save_count_increase")
        elif save_count_increase_type == "less":
            where_clauses.append("save_count_increase <= :save_count_increase")
        else:
            where_clauses.append("save_count_increase = :save_count_increase")
        params["save_count_increase"] = int(save_count_increase)
    
    # 10日間保存増加フィルター
    ten_days_save_increase = request.query_params.get('ten_days_save_increase')
    ten_days_save_increase_type = request.query_params.get('ten_days_save_increase_type')
    if ten_days_save_increase is not None:
        if ten_days_save_increase_type == "greater":
            where_clauses.append("ten_days_save_increase >= :ten_days_save_increase")
        elif ten_days_save_increase_type == "less":
            where_clauses.append("ten_days_save_increase <= :ten_days_save_increase")
        else:
            where_clauses.append("ten_days_save_increase = :ten_days_save_increase")
        params["ten_days_save_increase"] = int(ten_days_save_increase)

def apply_date_filters(request: Request, params: Dict, where_clauses: List[str]):
    """日付フィルターを適用"""
    created_at = request.query_params.get('created_at')
    created_at_type = request.query_params.get('created_at_type')
    if created_at:
        if created_at_type == "after" or created_at_type == "greater":
            where_clauses.append("created_at >= :created_at")
        elif created_at_type == "before" or created_at_type == "less":
            where_clauses.append("created_at <= :created_at")
        else:
            where_clauses.append("DATE(created_at) = DATE(:created_at)")
        params["created_at"] = created_at

def apply_content_type_filters(request: Request, params: Dict, where_clauses: List[str]):
    """コンテンツタイプフィルターを適用"""
    content_type = request.query_params.get('content_type')
    if content_type:
        if ',' in content_type:
            content_types = content_type.split(',')
            content_type_clauses = []
            for i, ct in enumerate(content_types):
                content_type_clauses.append(f"content_type = :content_type_{i}")
                params[f"content_type_{i}"] = ct.strip()
            where_clauses.append(f"({' OR '.join(content_type_clauses)})")
        else:
            where_clauses.append("content_type = :content_type")
            params["content_type"] = content_type

def apply_product_filters(request: Request, params: Dict, where_clauses: List[str]):
    """商品フィルターを適用"""
    product_filters = []
    
    # 複数商品処理
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
    else:
        # 単一商品処理
        product = request.query_params.get('product')
        if product:
            escaped_product = product.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("product LIKE :product")
            params["product"] = f"%{escaped_product}%"

def apply_account_type_filters(request: Request, params: Dict, where_clauses: List[str]):
    """アカウントタイプフィルターを適用"""
    account_type_filters = []
    
    # 複数アカウントタイプ処理
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
    else:
        # 単一アカウントタイプ処理
        account_type = request.query_params.get('account_type')
        if account_type:
            escaped_account_type = account_type.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_type LIKE :account_type")
            params["account_type"] = f"%{escaped_account_type}%"

def apply_music_filters(request: Request, params: Dict, where_clauses: List[str]):
    """音楽情報フィルターを適用"""
    music_info = request.query_params.get('music_info')
    if music_info:
        escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
        where_clauses.append("music_info LIKE :music_info")
        params["music_info"] = f"%{escaped_music_info}%"

def apply_sorting(query: str, sort_by: str, sort_order: str, sort_by_secondary: str, sort_order_secondary: str) -> str:
    """ソート処理を適用"""
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
    
    query += sort_clause
    return query

def format_last_updated(date):
    """最終更新日のフォーマット"""
    if not date:
        return None
    
    update_date = date + timedelta(days=2)
    return update_date.strftime("%y/%m/%d")
