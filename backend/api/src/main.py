from fastapi import FastAPI, HTTPException, Request, Depends
from typing import Optional, Dict, List
from src.db.database import execute_query, fetch_one, execute_update, format_video
from src.utils.logger_config import setup_logger
from src.auth.router import router as auth_router
from src.display_settings.router import router as display_settings_router
from src.product_stats import router as product_stats_router
from src.genre_stats import router as genre_stats_router
from src.watchlist import router as watchlist_router
from contextlib import closing
from fastapi import FastAPI
from src.timing_middleware import timing_middleware
import traceback
import uvicorn
import sys
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
import pathlib
import json
import re
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from src.auth.utils import update_session_activity
from sqlalchemy import text

from src.auth.tiktok import router as auth_tiktok_router
from src.tiktok.routes import router as tiktok_router
from src.transcription import router as transcription_router

# アプリケーション起動時に実行されるコード
print("main.py is being loaded")
logger = setup_logger()

# デバッグモードを有効化し、例外の詳細を表示
app = FastAPI(
    debug=True,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    title="TikTok Analytics API",
    description="TikTokアカウント分析のためのバックエンドAPI",
    version="0.1.0"
)
app.middleware("http")(timing_middleware)
# 環境変数からオリジンを取得してログ出力
origins_env = os.getenv("ALLOWED_ORIGINS", "")
logger.info(f"ALLOWED_ORIGINS環境変数の値: '{origins_env}'")
print(f"ALLOWED_ORIGINS環境変数の値: '{origins_env}'")

# 分割して空の要素を除去
origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]
logger.info(f"設定されたCORSオリジン: {origins}")
print(f"設定されたCORSオリジン: {origins}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 認証ルーターの追加
app.include_router(auth_router)
# 表示設定ルーターの追加
app.include_router(display_settings_router)
# 商品統計ルーターの追加
app.include_router(product_stats_router)
# ジャンル統計ルーターの追加
app.include_router(genre_stats_router)
# ウォッチリストルーターの追加
app.include_router(watchlist_router)

# ルーターの登録
app.include_router(auth_tiktok_router)
app.include_router(tiktok_router)
app.include_router(transcription_router)

# カスタム例外ハンドラ
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = {
        "detail": str(exc),
        "traceback": traceback.format_exc(),
        "type": type(exc).__name__
    }
    print(f"Error occurred: {error_detail}")  # サーバーログに出力
    return JSONResponse(
        status_code=500,
        content=jsonable_encoder(error_detail)
    )

@app.get("/api/videos")
async def get_videos(
    request: Request,
    page: int = 1,
    limit: int = 50,
    account_name: Optional[str] = None,
    category: Optional[str] = None,
    hashtags: Optional[str] = None,
    hashtag: Optional[str] = None,  # 後方互換性のために残す
    music_info: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_play_count: Optional[int] = None,
    min_likes_count: Optional[int] = None,
    is_viral: Optional[bool] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    sort_by_secondary: Optional[str] = "play_count",  # デフォルトで再生数を二次ソートに設定
    sort_order_secondary: Optional[str] = "desc",  # 降順
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
    product: Optional[str] = None,  # 商品フィルターを追加
    product_type: Optional[str] = None,  # 商品フィルターの比較演算子
    account_type: Optional[str] = None,  # アカウントタイプフィルターを追加
    account_type_count: Optional[int] = None,  # 複数アカウントタイプ対応
    created_at: Optional[str] = None,  # 作成日フィルターを追加
    created_at_type: Optional[str] = None,  # 作成日の比較演算子
):
    print(f"Received request with params: {request.query_params}")  # デバッグログ追加

    try:
        # デバッグ情報
        print(f"Request params: page={page}, limit={limit}, account_name={account_name}, category={category}, ...")

        # 基本クエリ
        query = """
            SELECT 
                url, thumbnail_url, created_at, play_count, play_count_increase, 
                ten_days_increase, account_name, display_name, content_type, 
                likes_count, comment_count, likes_count_increase, ten_days_likes_increase,
                comment_count_increase, ten_days_comment_increase, account_type,
                hashtags, music_info, caption, category, product, save_count, 
                save_count_increase, ten_days_save_increase
            FROM frontend_data
        """
        params = {}
        where_clauses = []

        # フィルター処理
        if account_name:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_name LIKE :account_name")
            params["account_name"] = f"%{escaped_account_name}%"
        
        # カテゴリフィルターのOR条件処理
        category_filters = []
        
        # category_countパラメータがある場合は複数カテゴリ
        category_count = request.query_params.get('category_count')
        if category_count and category_count.isdigit():
            count = int(category_count)
            for i in range(count):
                cat_param = request.query_params.get(f'category_{i}')
                if cat_param:
                    escaped_cat = cat_param.replace("_", r"\_").replace("%", r"\%")
                    category_filters.append(f"category LIKE :category_{i}")
                    params[f"category_{i}"] = f"%{escaped_cat}%"
        
        # 1つ以上のカテゴリフィルターがある場合は、OR条件で結合
        if category_filters:
            where_clauses.append(f"({' OR '.join(category_filters)})")
        # 従来の単一カテゴリ処理
        elif category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE :category")
            params["category"] = f"%{escaped_category}%"
        
        if hashtags:
            # exact_hashtags タイプが指定されている場合は完全一致検索
            exact_hashtags = request.query_params.get('exact_hashtags')
            if exact_hashtags == 'true':
                # 完全一致検索の実装（カンマ区切りのハッシュタグに対応）
                where_clauses.append("(hashtags = :hashtags OR hashtags LIKE :hashtags_start OR hashtags LIKE :hashtags_middle OR hashtags LIKE :hashtags_end)")
                hashtags_exact = hashtags
                params["hashtags"] = hashtags_exact
                params["hashtags_start"] = f"{hashtags_exact},%"
                params["hashtags_middle"] = f"%,{hashtags_exact},%"
                params["hashtags_end"] = f"%,{hashtags_exact}"
                print(f"ハッシュタグ完全一致検索を適用: {hashtags_exact}")
            else:
                # 従来の部分一致検索
                # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
                escaped_hashtags = hashtags.replace("_", r"\_").replace("%", r"\%")
                where_clauses.append("hashtags LIKE :hashtags")
                params["hashtags"] = f"%{escaped_hashtags}%"
                print(f"ハッシュタグ部分一致検索を適用: {escaped_hashtags}")
            
        if music_info:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("music_info LIKE :music_info")
            params["music_info"] = f"%{escaped_music_info}%"
            
        if min_play_count:
            where_clauses.append("play_count >= :min_play_count")
            params["min_play_count"] = min_play_count
            
        if min_likes_count:
            where_clauses.append("likes_count >= :min_likes_count")
            params["min_likes_count"] = min_likes_count
            
        if is_viral is not None:
            # is_viral の定義に基づいて条件を追加
            # 例: is_viral = True の場合、play_count > 10000 など
            where_clauses.append("play_count > :viral_threshold")
            params["viral_threshold"] = 10000  # viral動画の定義に合わせて調整

        if play_count is not None:
            if play_count_type == "greater":
                where_clauses.append("play_count >= :play_count")
            elif play_count_type == "less":
                where_clauses.append("play_count <= :play_count")
            else:
                where_clauses.append("play_count = :play_count")
            params["play_count"] = play_count

        # 作成日のフィルタリング
        if created_at:
            if created_at_type == "after" or created_at_type == "greater":
                where_clauses.append("created_at >= :created_at")
            elif created_at_type == "before" or created_at_type == "less":
                where_clauses.append("created_at <= :created_at")
            else:  # exact date
                # 日付が "YYYY-MM-DD" 形式の場合、その日の範囲を指定
                where_clauses.append("DATE(created_at) = DATE(:created_at)")
            params["created_at"] = created_at

        # いいね数のフィルタリング
        if likes_count is not None:
            if likes_count_type == "greater":
                where_clauses.append("likes_count >= :likes_count")
            elif likes_count_type == "less":
                where_clauses.append("likes_count <= :likes_count")
            else:
                where_clauses.append("likes_count = :likes_count")
            params["likes_count"] = likes_count

        # コメント数のフィルタリング
        if comment_count is not None:
            if comment_count_type == "greater":
                where_clauses.append("comment_count >= :comment_count")
            elif comment_count_type == "less":
                where_clauses.append("comment_count <= :comment_count")
            else:
                where_clauses.append("comment_count = :comment_count")
            params["comment_count"] = comment_count

        # 再生数増加のフィルタリング
        if play_count_increase is not None and play_count_increase_type:
            if play_count_increase_type == "greater":
                where_clauses.append("play_count_increase >= :play_count_increase")
            elif play_count_increase_type == "less":
                where_clauses.append("play_count_increase <= :play_count_increase")
            else:  # equal
                where_clauses.append("play_count_increase = :play_count_increase")
            params["play_count_increase"] = play_count_increase

        # 10日間増加率のフィルタリング
        if ten_days_increase is not None:
            if ten_days_increase_type == "greater":
                where_clauses.append("ten_days_increase >= :ten_days_increase")
            elif ten_days_increase_type == "less":
                where_clauses.append("ten_days_increase <= :ten_days_increase")
            else:
                where_clauses.append("ten_days_increase = :ten_days_increase")
            params["ten_days_increase"] = ten_days_increase

        # いいね数増加のフィルタリング
        if likes_count_increase is not None:
            if likes_count_increase_type == "greater":
                where_clauses.append("likes_count_increase >= :likes_count_increase")
            elif likes_count_increase_type == "less":
                where_clauses.append("likes_count_increase <= :likes_count_increase")
            else:
                where_clauses.append("likes_count_increase = :likes_count_increase")
            params["likes_count_increase"] = likes_count_increase

        # 10日間いいね増加率のフィルタリング
        if ten_days_likes_increase is not None:
            if ten_days_likes_increase_type == "greater":
                where_clauses.append("ten_days_likes_increase >= :ten_days_likes_increase")
            elif ten_days_likes_increase_type == "less":
                where_clauses.append("ten_days_likes_increase <= :ten_days_likes_increase")
            else:
                where_clauses.append("ten_days_likes_increase = :ten_days_likes_increase")
            params["ten_days_likes_increase"] = ten_days_likes_increase

        # コメント数増加のフィルタリング
        if comment_count_increase is not None:
            if comment_count_increase_type == "greater":
                where_clauses.append("comment_count_increase >= :comment_count_increase")
            elif comment_count_increase_type == "less":
                where_clauses.append("comment_count_increase <= :comment_count_increase")
            else:
                where_clauses.append("comment_count_increase = :comment_count_increase")
            params["comment_count_increase"] = comment_count_increase

        # 10日間コメント増加率のフィルタリング
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
            # カンマ区切りの場合は複数条件のORで処理
            if ',' in content_type:
                content_types = content_type.split(',')
                content_type_clauses = []
                for i, ct in enumerate(content_types):
                    content_type_clauses.append(f"content_type = :content_type_{i}")
                    params[f"content_type_{i}"] = ct.strip()
                where_clauses.append(f"({' OR '.join(content_type_clauses)})")
                print(f"複数コンテンツタイプフィルター適用: {content_types}")
            else:
                where_clauses.append("content_type = :content_type")
                params["content_type"] = content_type
                print(f"単一コンテンツタイプフィルター適用: {content_type}")

        # 商品フィルターの処理
        if product:
            # 商品名でフィルタリング
            escaped_product = product.replace("_", r"\_").replace("%", r"\%")
            # 商品名に対する部分一致検索
            where_clauses.append("product LIKE :product")
            params["product"] = f"%{escaped_product}%"
        
        # アカウントタイプフィルターの処理（OR条件）
        account_type_filters = []

        # account_type_countパラメータがある場合は複数アカウントタイプ
        if account_type_count and account_type_count.isdigit():
            count = int(account_type_count)
            for i in range(count):
                account_param = request.query_params.get(f'account_type_{i}')
                if account_param:
                    escaped_account = account_param.replace("_", r"\_").replace("%", r"\%")
                    account_type_filters.append(f"account_type LIKE :account_type_{i}")
                    params[f"account_type_{i}"] = f"%{escaped_account}%"
        
        # 1つ以上のアカウントタイプフィルターがある場合は、OR条件で結合
        if account_type_filters:
            where_clauses.append(f"({' OR '.join(account_type_filters)})")
        # 単一アカウントタイプ処理
        elif account_type:
            escaped_account_type = account_type.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_type LIKE :account_type")
            params["account_type"] = f"%{escaped_account_type}%"

        # フィルター条件のデバッグログ
        if play_count is not None:
            print(f"Applying play_count filter: {play_count} ({play_count_type})")
        if save_count is not None:
            print(f"Applying save_count filter: {save_count} ({save_count_type})")

        # WHERE句の追加
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理
        # フロントエンドのカラム名とデータベースのカラム名をマッピング
        column_mapping = {
            "audioTitle": "music_info",  # フロントエンドのaudioTitleはデータベースではmusic_info
            "saveCount": "save_count",   # 保存数のマッピングを追加
            "saveCountIncrease": "save_count_increase",
            "tenDaysSaveIncrease": "ten_days_save_increase"
        }
        
        # ソートカラムのマッピングを適用
        actual_sort_by = column_mapping.get(sort_by, sort_by)
        
        # ソートの適用
        sort_clause = f" ORDER BY {actual_sort_by} {sort_order}"
        
        # 二次ソートがある場合は追加
        if sort_by_secondary:
            actual_sort_by_secondary = column_mapping.get(sort_by_secondary, sort_by_secondary)
            sort_clause += f", {actual_sort_by_secondary} {sort_order_secondary}"
            print(f"Applied secondary sort: {actual_sort_by_secondary} {sort_order_secondary}")
        
        query += sort_clause
        
        print(f"Sort clause: {sort_clause}")

        # フィルタパラメータを保持
        filter_params = params.copy()

        # ページネーション用にLIMIT/OFFSETを追加
        offset = (page - 1) * limit
        
        # メインクエリからLIMIT/OFFSETを除いたベースクエリを作成
        base_query = query

        # limit=-1の場合は全件取得（ページングなし）
        if limit == -1:
            print("全件取得モードが指定されました - ページングを無効化")
        else:
            query += " LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset

        # デバッグ用にクエリとパラメータを出力
        print(f"Executing query: {query}")
        print(f"With parameters: {params}")

        # メインクエリ実行
        rows = execute_query(query, params)

        # 総件数取得（フィルタパラメータを使用）
        count_query = f"SELECT COUNT(*) as total FROM ({base_query}) as count_query"
        total_result = fetch_one(count_query, filter_params)
        total = total_result["total"] if total_result else 0

        # 全体の最新投稿日を取得（フィルターに関係なく）
        latest_date_result = fetch_one("SELECT MAX(created_at) as max_date FROM frontend_data")
        global_latest_date = latest_date_result["max_date"] if latest_date_result else None
        global_last_updated = format_last_updated(global_latest_date) if global_latest_date else None

        # フィルター適用後の最新投稿日を取得（base_queryを使用）
        filtered_latest_query = f"SELECT MAX(created_at) as max_date FROM ({base_query}) as latest_query"
        filtered_latest_result = fetch_one(filtered_latest_query, filter_params)
        filtered_latest_date = filtered_latest_result["max_date"] if filtered_latest_result else None
        filtered_last_updated = format_last_updated(filtered_latest_date) if filtered_latest_date else None

        return {
            "data": [format_video(row) for row in rows],
            "total": total,
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit if limit > 0 else 1,
            "success": True,
            "lastUpdated": {
                "date": filtered_last_updated,
                "isFiltered": bool(where_clauses),
                "globalLastUpdated": global_last_updated
            }
        }

    except Exception as e:
        print(f"Error in get_videos: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": str(e)
            }
        )

@app.get("/health")
async def health_check():
    try:
        print("Health check endpoint called")  # この行が表示されるか確認
        
        # データベースモジュールのインポートを試行
        try:
            from src.db.database import execute_query
            print("Database module imported successfully")
        except ImportError as e:
            print(f"Failed to import database module: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Database module import failed: {str(e)}"
            )
        
        # 環境変数の確認
        db_params = {
            "host": os.getenv('MYSQL_HOST'),
            "user": os.getenv('MYSQL_USER'),
            "database": os.getenv('MYSQL_DATABASE'),
            "port": os.getenv('MYSQL_PORT')
        }
        print(f"Database parameters: {db_params}")
        
        # データベース接続を試行
        try:
            # SQLAlchemyを使用してテスト
            result = fetch_one("SELECT 1 as test")
            print(f"Test query result: {result}")
            
            return {
                "status": "healthy",
                "database": "connected",
                "test_query": result,
                "connection_params": db_params
            }
        except Exception as e:
            print(f"Database connection failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Database connection failed: {str(e)}"
            )
                
    except Exception as e:
        print(f"Unexpected error in health check: {e}")
        print(traceback.format_exc())
        raise

@app.get("/test")
async def test():
    print("Test endpoint called")  # デバッグ用ログ
    return {"status": "ok"}

@app.get("/debug/row/{row_id}")
async def debug_row(row_id: str):
    """特定の行の生データとJSONパース結果を確認するためのデバッグエンドポイント"""
    try:
        # テーブル内の特定の行を検索
        query = "SELECT * FROM frontend_data WHERE id = :row_id"
        results = execute_query(query, {"row_id": row_id})
        
        if not results:
            return {"error": "Row not found"}
            
        # 結果の最初の行を取得
        row = results[0]
        
        # データ構造を構築
        raw_data = {
            "row_data": {key: str(value) for key, value in row.items()},
            "columns": list(row.keys())
        }
        
        # format_videoを試す（エラーをキャッチする）
        formatted = None
        try:
            formatted = format_video(row)
        except Exception as e:
            formatted = {"error": str(e)}
            
        return {
            "raw_data": raw_data,
            "formatted": formatted
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/categories")
async def get_categories():
    """カテゴリ一覧を取得するエンドポイント"""

    try:
        # SQLAlchemyを使用してテーブル一覧を取得
        tables_result = execute_query("SHOW TABLES")
        tables = [list(row.values())[0] for row in tables_result]
        logger.info(f"データベース内のテーブル: {tables}")

        # frontend_dataテーブルの構造確認
        columns_result = execute_query("DESCRIBE frontend_data")
        columns = [row['Field'] for row in columns_result]
        logger.info(f"frontend_dataテーブルのカラム: {columns}")

        # カテゴリ情報があるか確認
        if "category" in columns:
            categories_rows = execute_query(
                """
                SELECT DISTINCT category
                FROM frontend_data
                WHERE category IS NOT NULL AND category != ''
                """
            )
            logger.info(f"取得したカテゴリデータ行数: {len(categories_rows)}")

            categories = [row['category'] for row in categories_rows if row['category']]
            result = {
                "success": True,
                "categories": categories,
                "products": [],
                "category_products": {}
            }
        else:
            result = {
                "success": False,
                "error": "カテゴリ情報が見つかりません",
                "categories": []
            }

        return result

    except Exception as e:
        logger.error(f"カテゴリ取得エラー: {e}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "categories": []
        }

@app.get("/api/accounts")
async def get_accounts():
    """アカウント一覧を取得するエンドポイント"""
    try:
        with closing(get_db_connection()) as conn, closing(conn.cursor()) as cursor:
        
            # アカウント一覧の取得
            cursor.execute(
                "SELECT DISTINCT account_name FROM frontend_data WHERE account_name IS NOT NULL AND account_name != ''"
            )
            accounts = [row[0] for row in cursor.fetchall()]
        
        return {
            "success": True,
            "data": accounts
        }
    except Exception as e:
        logger.error(f"アカウント取得エラー: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/hashtags")
async def get_hashtags(limit: int = None):
    """ハッシュタグ一覧を取得するエンドポイント"""
    try:
        with closing(get_db_connection()) as conn, closing(conn.cursor()) as cursor:
        
            # ハッシュタグ一覧の取得
            if limit:
                cursor.execute(
                    "SELECT DISTINCT hashtags FROM frontend_data WHERE hashtags IS NOT NULL AND hashtags != '' LIMIT %s",
                    (limit,)
                )
            else:
                cursor.execute(
                    "SELECT DISTINCT hashtags FROM frontend_data WHERE hashtags IS NOT NULL AND hashtags != ''"
                )
            hashtags_rows = cursor.fetchall()
            
            # ハッシュタグはJSONとして保存されている可能性があるため、パースして個別のハッシュタグを抽出
            all_hashtags = []
            for row in hashtags_rows:
                try:
                    # JSON文字列をパースして配列として扱う
                    hashtags_list = json.loads(row[0])
                    if isinstance(hashtags_list, list):
                        all_hashtags.extend(hashtags_list)
                    else:
                        # 単一の値の場合
                        all_hashtags.append(row[0])
                except json.JSONDecodeError:
                    # JSON形式でない場合は単一の値として扱う
                    all_hashtags.append(row[0])
            
            # 重複を除去
            unique_hashtags = list(set(all_hashtags))
            # ハッシュタグをオブジェクト形式に変換
            hashtags = [{"hashtags": tag} for tag in unique_hashtags if tag]

        return {
            "success": True,
            "data": hashtags
        }
    except Exception as e:
        logger.error(f"ハッシュタグ取得エラー: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/music")
async def get_music(limit: int = 100):
    """BGM(音声タイトル)一覧を取得するエンドポイント"""
    try:
        with closing(get_db_connection()) as conn, closing(conn.cursor()) as cursor:
        
            # テーブルの構造確認
            cursor.execute("DESCRIBE frontend_data")
            columns = [row[0] for row in cursor.fetchall()]
            logger.info(f"frontend_dataテーブルのカラム: {columns}")
            
            music_titles = []
            # audio_titleカラムがあるか確認
            if 'audio_title' in columns:
                # BGM一覧の取得
                cursor.execute(
                    "SELECT DISTINCT audio_title FROM frontend_data WHERE audio_title IS NOT NULL AND audio_title != '' LIMIT %s",
                    (limit,)
                )
                music_rows = cursor.fetchall()
                logger.info(f"audio_titleから取得したBGM行数: {len(music_rows)}")
                
                # データ抽出
                music_titles = [row[0] for row in music_rows if row[0]]
                if music_titles:
                    logger.info(f"BGMサンプル: {music_titles[:5]}")
            
            # music_infoカラムがあるか確認
            elif 'music_info' in columns:
                # 代替として music_info カラムを使用
                cursor.execute(
                    "SELECT DISTINCT music_info FROM frontend_data WHERE music_info IS NOT NULL AND music_info != '' LIMIT %s",
                    (limit,)
                )
                music_rows = cursor.fetchall()
                logger.info(f"music_infoから取得したBGM行数: {len(music_rows)}")
                
                # データ処理
                for row in music_rows:
                    if row[0]:
                        try:
                            # JSON文字列の場合はパース
                            if isinstance(row[0], str) and (row[0].startswith('{') or row[0].startswith('[')):
                                music_info = json.loads(row[0])
                                if isinstance(music_info, dict) and 'title' in music_info:
                                    music_titles.append(music_info['title'])
                                else:
                                    music_titles.append(str(music_info))
                            else:
                                music_titles.append(str(row[0]))
                        except json.JSONDecodeError:
                            music_titles.append(str(row[0]))
                
                if music_titles:
                    logger.info(f"パース後のBGMサンプル: {music_titles[:5]}")
            
            # 音楽情報がない場合
            if not music_titles:
                logger.warning("BGM情報を取得できませんでした")
        
        return {
            "success": True,
            "data": music_titles
        }
    except Exception as e:
        logger.error(f"BGM一覧取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "data": []
        }

@app.get("/api/filter-options")
async def get_filter_options(
    request: Request,
    filter_type: str = "all",
    account_name: Optional[str] = None,
    category: Optional[str] = None,
    hashtags: Optional[str] = None,
    music_info: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_play_count: Optional[int] = None,
    min_likes_count: Optional[int] = None,
    created_at: Optional[str] = None,
    created_at_type: Optional[str] = None,
):
    """
    フィルター条件に基づいて選択肢データのみを返すAPIエンドポイント
    filter_type: 取得する選択肢のタイプ (categories, accounts, hashtags, music, all)
    その他のパラメータ: 通常のフィルター条件
    """
    try:
        # フィルター条件を構築
        params = {}
        where_clauses = []
        
        # 以下、通常のフィルター条件構築処理と同じ
        if account_name:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_name LIKE :account_name")
            params["account_name"] = f"%{escaped_account_name}%"
        
        # カテゴリフィルターのOR条件処理
        category_filters = []

        # category_countパラメータがある場合は複数カテゴリ
        category_count = request.query_params.get('category_count')
        if category_count and category_count.isdigit():
            count = int(category_count)
            for i in range(count):
                cat_param = request.query_params.get(f'category_{i}')
                if cat_param:
                    escaped_cat = cat_param.replace("_", r"\_").replace("%", r"\%")
                    category_filters.append(f"category LIKE :category_{i}")
                    params[f"category_{i}"] = f"%{escaped_cat}%"
        
        # 1つ以上のカテゴリフィルターがある場合は、OR条件で結合
        if category_filters:
            where_clauses.append(f"({' OR '.join(category_filters)})")
        # 従来の単一カテゴリ処理
        elif category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE :category")
            params["category"] = f"%{escaped_category}%"
        
        if hashtags:
            # exact_hashtags タイプが指定されている場合は完全一致検索
            exact_hashtags = request.query_params.get('exact_hashtags')
            if exact_hashtags == 'true':
                # 完全一致検索の実装（カンマ区切りのハッシュタグに対応）
                where_clauses.append("(hashtags = :hashtags OR hashtags LIKE :hashtags_start OR hashtags LIKE :hashtags_middle OR hashtags LIKE :hashtags_end)")
                hashtags_exact = hashtags
                params["hashtags"] = hashtags_exact
                params["hashtags_start"] = f"{hashtags_exact},%"
                params["hashtags_middle"] = f"%,{hashtags_exact},%"
                params["hashtags_end"] = f"%,{hashtags_exact}"
                print(f"ハッシュタグ完全一致検索を適用: {hashtags_exact}")
            else:
                # 従来の部分一致検索
                # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
                escaped_hashtags = hashtags.replace("_", r"\_").replace("%", r"\%")
                where_clauses.append("hashtags LIKE :hashtags")
                params["hashtags"] = f"%{escaped_hashtags}%"
                print(f"ハッシュタグ部分一致検索を適用: {escaped_hashtags}")
            
        if music_info:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("music_info LIKE :music_info")
            params["music_info"] = f"%{escaped_music_info}%"
        
        if min_play_count:
            where_clauses.append("play_count >= :min_play_count")
            params["min_play_count"] = min_play_count
            
        if min_likes_count:
            where_clauses.append("likes_count >= :min_likes_count")
            params["min_likes_count"] = min_likes_count
            
        if start_date and end_date:
            where_clauses.append("created_at BETWEEN :start_date AND :end_date")
            params["start_date"] = start_date
            params["end_date"] = end_date
        elif start_date:
            where_clauses.append("created_at >= :start_date")
            params["start_date"] = start_date
        elif end_date:
            where_clauses.append("created_at <= :end_date")
            params["end_date"] = end_date
            
        if created_at:
            if created_at_type == "after" or created_at_type == "greater":
                where_clauses.append("created_at >= :created_at")
            elif created_at_type == "before" or created_at_type == "less":
                where_clauses.append("created_at <= :created_at")
            else:  # exact date
                # 日付が "YYYY-MM-DD" 形式の場合、その日の範囲を指定
                where_clauses.append("DATE(created_at) = DATE(:created_at)")
            params["created_at"] = created_at
        
        # ベースとなるWHERE句を構築
        base_where = ""
        if where_clauses:
            base_where = " WHERE " + " AND ".join(where_clauses)
            
        # 結果を格納する辞書
        result = {
            "success": True,
            "filter_type": filter_type
        }
        
        # filter_typeに基づいて必要なデータのみを取得
        if filter_type in ["categories", "all"]:
            # カテゴリ一覧を取得
            query = f"SELECT DISTINCT category FROM frontend_data{base_where}"
            categories_rows = execute_query(query, params)
            categories = [row['category'] for row in categories_rows if row['category']]
            
            # カテゴリを分割して処理
            processed_categories = []
            for category in categories:
                if "、" in category or "," in category:
                    parts = category.replace("、", ",").split(",")
                    processed_categories.extend([part.strip() for part in parts if part.strip()])
                else:
                    processed_categories.append(category)
            
            # 重複を削除
            unique_categories = list(set(processed_categories))
            result["categories"] = sorted(unique_categories)
            
        if filter_type in ["accounts", "all"]:
            # アカウント一覧を取得
            query = f"SELECT DISTINCT account_name FROM frontend_data{base_where}"
            accounts_rows = execute_query(query, params)
            accounts = [row['account_name'] for row in accounts_rows if row['account_name']]
            result["accounts"] = sorted(accounts)
            
        if filter_type in ["hashtags", "all"]:
            # ハッシュタグ一覧を取得
            query = f"SELECT DISTINCT hashtags FROM frontend_data{base_where}"
            hashtags_rows = execute_query(query, params)
            
            # ハッシュタグを処理
            all_hashtags = []
            for row in hashtags_rows:
                if row['hashtags']:
                    try:
                        # JSON形式の場合はパース
                        hashtags_json = json.loads(row['hashtags'])
                        if isinstance(hashtags_json, list):
                            all_hashtags.extend(hashtags_json)
                        else:
                            hashtags = row['hashtags']
                            # ハッシュタグを分割して処理
                            tags = []
                            if " " in hashtags or "、" in hashtags or "," in hashtags:
                                # スペース、「、」、「,」で区切られたハッシュタグの場合
                                tags = [tag.strip() for tag in re.split(r'[\s、,]', hashtags) if tag.strip()]
                            else:
                                tags = [hashtags.strip()]
                            
                            all_hashtags.extend(tags)
                    except json.JSONDecodeError:
                        # JSON形式でない場合
                        hashtags = row['hashtags']
                        # ハッシュタグを分割して処理
                        tags = []
                        if " " in hashtags or "、" in hashtags or "," in hashtags:
                            # スペース、「、」、「,」で区切られたハッシュタグの場合
                            tags = [tag.strip() for tag in re.split(r'[\s、,]', hashtags) if tag.strip()]
                        else:
                            tags = [hashtags.strip()]
                        
                        all_hashtags.extend(tags)
            
            # 重複を削除
            unique_hashtags = list(set(all_hashtags))
            result["hashtags"] = sorted(unique_hashtags)
            
        if filter_type in ["music", "all"]:
            # 音声タイトル一覧を取得
            query = f"SELECT DISTINCT music_info FROM frontend_data{base_where}"
            music_rows = execute_query(query, params)
            music_titles = [row['music_info'] for row in music_rows if row['music_info']]
            result["music"] = sorted(music_titles)
            
        return result
        
    except Exception as e:
        print(f"Error in get_filter_options: {str(e)}")
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/trends/timeline")
async def get_trends_timeline(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    genres: List[str] = None,
    metrics: Optional[str] = "view_increase,total_posts,videos_100k_plus"
):
    try:
        # デフォルトは過去30日間
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            
        # パラメータ処理 - List[str]型なのでsplit不要
        genre_list = genres or []
        metric_list = metrics.split(',') if metrics else ["view_increase", "total_posts", "videos_100k_plus"]
        
        # 使用可能な指標リスト（テーブルのカラム名に対応）
        valid_metrics = [
            "view_increase", "videos_10k_plus", "videos_100k_plus", 
            "total_posts", "ratio_10k_plus", "ratio_100k_plus"
        ]
        
        # 無効な指標をフィルタリング
        metric_list = [m for m in metric_list if m in valid_metrics]
        
        # クエリ最適化：必要なカラムのみ取得
        needed_columns = ["collection_date", "genre"] + metric_list
        query = f"SELECT {', '.join(needed_columns)} FROM trend_analysis WHERE collection_date BETWEEN :start_date AND :end_date"
        
        # パラメータ辞書を初期化
        params = {"start_date": start_date, "end_date": end_date}
        
        # ジャンルフィルタの追加
        if genre_list:
            placeholders = []
            for i, genre in enumerate(genre_list):
                param_name = f"genre_{i}"
                placeholders.append(f":{ param_name}")
                params[param_name] = genre
            
            query += f" AND genre IN ({', '.join(placeholders)})"
            
        # 日付でソートしてからジャンルでソート（インデックスを活用）
        query += " ORDER BY collection_date ASC, genre ASC"
        
        # パフォーマンスのためにLIMITを追加（必要に応じて調整）
        max_results = 1000  # 適切な上限を設定
        query += f" LIMIT {max_results}"
        
        # デバッグ出力
        print(f"ジャンルリスト: {genre_list}")
        print(f"実行するクエリ: {query}")
        print(f"パラメータ: {params}")
        
        # クエリ実行
        rows = execute_query(query, params)
        
        # 結果整形 - 日付ごとにジャンル別データを整理
        timeline_data = {}
        
        for row in rows:
            date_str = row["collection_date"].isoformat()
            genre = row["genre"]
            
            if date_str not in timeline_data:
                timeline_data[date_str] = {}
                
            genre_data = {}
            for metric in metric_list:
                genre_data[metric] = row[metric]
                
            timeline_data[date_str][genre] = genre_data
            
        return {
            "success": True,
            "data": timeline_data,
            "metrics": metric_list,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
    except Exception as e:
        logger.error(f"トレンドタイムラインデータ取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

@app.get("/api/trends/summary")
async def get_trends_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    genres: Optional[str] = None  # カンマ区切りのジャンル、省略時は全ジャンル
):
    """期間内のジャンル別集計データを取得するAPI"""
    try:
        # デフォルトは過去30日間
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            
        # パラメータ処理
        genre_list = genres.split(',') if genres else []
        
        # クエリ構築 - 期間内の各ジャンルの集計値を計算
        query = """
        SELECT 
            genre,
            SUM(view_increase) as total_view_increase,
            SUM(videos_10k_plus) as total_videos_10k_plus,
            SUM(videos_100k_plus) as total_videos_100k_plus,
            SUM(total_posts) as total_posts
        FROM 
            trend_analysis 
        WHERE 
            collection_date BETWEEN :start_date AND :end_date
        """
        params = {"start_date": start_date, "end_date": end_date}
        
        if genre_list:
            placeholders = []
            for i, genre in enumerate(genre_list):
                param_name = f"genre_{i}"
                placeholders.append(f":{ param_name}")
                params[param_name] = genre
                
            query += f" AND genre IN ({', '.join(placeholders)})"
            
        query += " GROUP BY genre ORDER BY total_view_increase DESC"
        
        # デバッグ情報
        print(f"実行するクエリ: {query}")
        print(f"パラメータ: {params}")
        
        # クエリ実行
        rows = execute_query(query, params)
        
        # 結果整形
        summary_data = []
        for row in rows:
            genre = row["genre"]
            total_view_increase = int(row["total_view_increase"]) if row["total_view_increase"] else 0
            total_videos_10k_plus = int(row["total_videos_10k_plus"]) if row["total_videos_10k_plus"] else 0
            total_videos_100k_plus = int(row["total_videos_100k_plus"]) if row["total_videos_100k_plus"] else 0
            total_posts = int(row["total_posts"]) if row["total_posts"] else 0
            
            # 投稿数が0の場合は割合を0とする
            ratio_10k_plus = total_videos_10k_plus / total_posts if total_posts > 0 else 0
            ratio_100k_plus = total_videos_100k_plus / total_posts if total_posts > 0 else 0
            
            summary_data.append({
                "genre": genre,
                "total_view_increase": total_view_increase,
                "total_videos_100k_plus": total_videos_100k_plus,
                "total_posts": total_posts,
                "ratio_10k_plus": ratio_10k_plus,
                "ratio_100k_plus": ratio_100k_plus
            })
            
        return {
            "success": True,
            "data": summary_data,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            }
        }
        
    except Exception as e:
        logger.error(f"ジャンル別集計データ取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

@app.get("/api/trends/genres")
async def get_trend_genres():
    """トレンド分析で利用可能なジャンル一覧を取得するAPI"""
    try:
        # ユニークなジャンル一覧を取得
        query = "SELECT category_name FROM category_master ORDER BY category_name"
        rows = execute_query(query)
        
        genres = [row["category_name"] for row in rows]
        
        return {
            "success": True,
            "data": genres
        }
        
    except Exception as e:
        logger.error(f"トレンドジャンル一覧取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

@app.get("/api/trends/dates")
async def get_trend_dates():
    """トレンド分析の利用可能な集計日一覧を取得するAPI"""
    try:
        # 集計日の一覧を取得（最新順）
        query = "SELECT DISTINCT collection_date FROM trend_analysis ORDER BY collection_date DESC"
        rows = execute_query(query)
        
        # ISO形式の日付文字列に変換
        dates = [row["collection_date"].isoformat() for row in rows]
        
        return {
            "success": True,
            "data": dates
        }
        
    except Exception as e:
        logger.error(f"トレンド集計日一覧取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

@app.middleware("http")
async def update_session_middleware(request: Request, call_next):
    """リクエスト処理時にセッションアクティビティを更新するミドルウェア"""
    response = await call_next(request)
    
    # セッショントークンをクッキーまたはヘッダーから取得
    session_token = request.cookies.get("session_token") or request.headers.get("X-Session-Token")
    
    if session_token:
        # 非同期でセッション最終利用日時を更新
        try:
            current_time = datetime.utcnow()
            execute_update(
                "UPDATE sessions SET last_used_at = :current_time WHERE session_token = :session_token",
                {"current_time": current_time, "session_token": session_token}
            )
        except Exception as e:
            logger.error(f"セッション更新エラー: {e}")
    
    return response

@app.get("/api/video/play-count-history/{video_id}")
async def get_video_play_count_history(
    video_id: str,
    days: Optional[int] = 30
):
    logger.info(f"再生数履歴取得リクエスト受信: video_id={video_id}, days={days}")
    try:
        # テーブル存在確認
        tables_result = execute_query("SHOW TABLES")
        tables_list = [list(row.values())[0] for row in tables_result]
        logger.info(f"利用可能なテーブル: {tables_list}")
        
        if 'play_count_history' not in tables_list:
            logger.error("play_count_historyテーブルが存在しません")
            return {
                "success": False,
                "error": "必要なテーブルが存在しません",
                "video_id": video_id,
                "history": []
            }

        # video_idの形式チェック
        if not video_id.isdigit():
            logger.warning(f"無効な動画ID形式: {video_id}")
            return {
                "success": False,
                "error": "無効な動画ID形式です",
                "video_id": video_id,
                "history": []
            }

        query = """
        SELECT 
            collection_date,
            play_count_increase
        FROM play_count_history
        WHERE 
            video_id = :video_id
            AND collection_date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        ORDER BY collection_date ASC
        """
        
        # クエリ実行前のデバッグログ
        logger.info(f"実行するクエリ: {query}")
        logger.info(f"パラメータ: video_id={video_id}, days={days}")
        
        results = execute_query(query, {"video_id": video_id, "days": days})
        
        # 結果のデバッグログ
        logger.info(f"取得した結果: {results}")

        # 結果を整形
        history = []
        for result in results:
            history.append({
                "collection_date": result["collection_date"].strftime("%Y-%m-%d"),
                "play_count_increase": result["play_count_increase"] if result["play_count_increase"] is not None else 0
            })

        return {
            "success": True,
            "video_id": video_id,
            "history": history
        }

    except Exception as e:
        logger.error(f"再生数履歴取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "video_id": video_id,
            "history": []
        }

@app.get("/api/video/save-count-history/{video_id}")
async def get_video_save_count_history(
    video_id: str,
    days: Optional[int] = 30
):
    logger.info(f"保存数履歴取得リクエスト受信: video_id={video_id}, days={days}")
    try:
        # テーブル存在確認
        tables_result = execute_query("SHOW TABLES")
        tables_list = [list(row.values())[0] for row in tables_result]
        logger.info(f"利用可能なテーブル: {tables_list}")
        
        if 'play_count_history' not in tables_list:
            logger.error("play_count_historyテーブルが存在しません")
            return {
                "success": False,
                "error": "必要なテーブルが存在しません",
                "video_id": video_id,
                "history": []
            }

        # video_idの形式チェック
        if not video_id.isdigit():
            logger.warning(f"無効な動画ID形式: {video_id}")
            return {
                "success": False,
                "error": "無効な動画ID形式です",
                "video_id": video_id,
                "history": []
            }

        query = """
        SELECT 
            collection_date,
            save_count_increase
        FROM play_count_history
        WHERE 
            video_id = :video_id
            AND collection_date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        ORDER BY collection_date ASC
        """
        
        # クエリ実行前のデバッグログ
        logger.info(f"実行するクエリ: {query}")
        logger.info(f"パラメータ: video_id={video_id}, days={days}")
        
        results = execute_query(query, {"video_id": video_id, "days": days})
        
        # 結果のデバッグログ
        logger.info(f"取得した結果: {results}")

        # 結果を整形
        history = []
        for result in results:
            history.append({
                "collection_date": result["collection_date"].strftime("%Y-%m-%d"),
                "save_count_increase": result["save_count_increase"] if result["save_count_increase"] is not None else 0
            })

        return {
            "success": True,
            "video_id": video_id,
            "history": history
        }

    except Exception as e:
        logger.error(f"保存数履歴取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "video_id": video_id,
            "history": []
        }

@app.get("/api/products")
async def get_products():
    """商品マスターから商品情報とカテゴリを取得するエンドポイント"""
    try:
        # product_masterテーブルから商品情報を取得
        rows = execute_query("""
            SELECT 
                product_name,
                product_category
            FROM 
                product_master
            WHERE 
                product_name IS NOT NULL 
                AND product_name != ''
            ORDER BY 
                product_category,
                product_name
        """)
        
        # 結果を構造化
        products = []
        categories = {}  # カテゴリごとに商品をグループ化
        
        for row in rows:
            product_name = row['product_name']
            product_category = row['product_category'] or "その他"  # カテゴリがない場合は「その他」とする
            
            products.append({
                "name": product_name,
                "category": product_category
            })
            
            # カテゴリごとの商品リストを作成
            if product_category not in categories:
                categories[product_category] = []
            
            categories[product_category].append(product_name)
        
        return {
            "success": True,
            "data": products,
            "categories": categories  # カテゴリ別商品リスト
        }
    except Exception as e:
        logger.error(f"商品取得エラー: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/account-types")
async def get_account_types():
    """アカウントタイプ一覧を取得するエンドポイント"""
    try:
        # 空でないアカウントタイプのみを取得
        rows = execute_query(
            "SELECT DISTINCT account_type FROM frontend_data WHERE account_type IS NOT NULL AND account_type != '' ORDER BY account_type"
        )
        account_types_raw = [row['account_type'] for row in rows]
        
        # アカウントタイプを分割して処理
        processed_account_types = []
        for account_type in account_types_raw:
            if "、" in account_type or "," in account_type:
                parts = account_type.replace("、", ",").split(",")
                processed_account_types.extend([part.strip() for part in parts if part.strip()])
            else:
                processed_account_types.append(account_type)
        
        # 重複を削除
        unique_account_types = list(set(processed_account_types))
        # ソートして返す
        sorted_account_types = sorted(unique_account_types)
    
        return {
            "success": True,
            "data": sorted_account_types
        }
    except Exception as e:
        logger.error(f"アカウントタイプ取得エラー: {str(e)}")
        return {"success": False, "error": str(e)}

# uvicornでの直接起動用（Option 2の場合は不要）
if __name__ == "__main__":
    print("Starting application via __main__")
    uvicorn.run(
        app,  # 文字列として渡す
        host="0.0.0.0",
        port=8080,
        log_level="debug",
        access_log=True,
        proxy_headers=True,  # プロキシヘッダーを信頼
        forwarded_allow_ips="*"  # すべてのIPからのフォワードを許可
        )

# 最終更新日のフォーマット関数を追加
def format_last_updated(date):
    if not date:
        return None
    
    # 日付を2日後に設定
    update_date = date + timedelta(days=2)
    
    # YY/MM/DD形式でフォーマット
    return update_date.strftime("%y/%m/%d")