from fastapi import FastAPI, HTTPException, Request, Depends
from typing import Optional, Dict, List
from src.db.database import get_db_connection, format_video
from src.utils.logger_config import setup_logger
from src.auth.router import router as auth_router
from src.display_settings.router import router as display_settings_router
from src.product_stats import router as product_stats_router
from src.genre_stats import router as genre_stats_router
from src.watchlist import router as watchlist_router
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
from datetime import datetime, timedelta
from src.auth.utils import update_session_activity



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
    description="TikTok Analytics API Service",
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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
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
    hashtag: Optional[str] = None,
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
):
    print(f"Received request with params: {request.query_params}")  # デバッグログ追加
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # デバッグ情報
        print(f"Request params: page={page}, limit={limit}, account_name={account_name}, category={category}, ...")

        # 基本クエリ
        query = """
            SELECT 
                url, thumbnail_url, created_at, play_count, play_count_increase, 
                ten_days_increase, account_name, display_name, content_type, 
                likes_count, comment_count, likes_count_increase, ten_days_likes_increase,
                comment_count_increase, ten_days_comment_increase, account_type,
                hashtags, music_info, caption, category, product
            FROM frontend_data
        """
        params = []
        where_clauses = []

        # フィルター処理
        if account_name:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_name LIKE %s")
            params.append(f"%{escaped_account_name}%")
        
        # カテゴリフィルターのOR条件処理
        category_filters = []
        category_params = []

        # category_countパラメータがある場合は複数カテゴリ
        category_count = request.query_params.get('category_count')
        if category_count and category_count.isdigit():
            count = int(category_count)
            for i in range(count):
                cat_param = request.query_params.get(f'category_{i}')
                if cat_param:
                    escaped_cat = cat_param.replace("_", r"\_").replace("%", r"\%")
                    category_filters.append("category LIKE %s")
                    category_params.append(f"%{escaped_cat}%")
        
        # 1つ以上のカテゴリフィルターがある場合は、OR条件で結合
        if category_filters:
            where_clauses.append(f"({' OR '.join(category_filters)})")
            params.extend(category_params)
        # 従来の単一カテゴリ処理
        elif category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE %s")
            params.append(f"%{escaped_category}%")
        
        if hashtag:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_hashtag = hashtag.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("hashtags LIKE %s")
            params.append(f"%{escaped_hashtag}%")
            
        if music_info:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("music_info LIKE %s")
            params.append(f"%{escaped_music_info}%")
            
        if min_play_count:
            where_clauses.append("play_count >= %s")
            params.append(min_play_count)
            
        if min_likes_count:
            where_clauses.append("likes_count >= %s")
            params.append(min_likes_count)
            
        if is_viral is not None:
            # is_viral の定義に基づいて条件を追加
            # 例: is_viral = True の場合、play_count > 10000 など
            where_clauses.append("play_count > %s")
            params.append(10000)  # viral動画の定義に合わせて調整

        if play_count is not None:
            if play_count_type == "greater":
                where_clauses.append("play_count >= %s")
                params.append(play_count)
            elif play_count_type == "less":
                where_clauses.append("play_count <= %s")
                params.append(play_count)
            else:
                where_clauses.append("play_count = %s")
                params.append(play_count)

        if likes_count is not None:
            if likes_count_type == "greater":
                where_clauses.append("likes_count >= %s")
                params.append(likes_count)
            elif likes_count_type == "less":
                where_clauses.append("likes_count <= %s")
                params.append(likes_count)
            else:
                where_clauses.append("likes_count = %s")
                params.append(likes_count)

        if comment_count is not None:
            if comment_count_type == "greater":
                where_clauses.append("comment_count >= %s")
                params.append(comment_count)
            elif comment_count_type == "less":
                where_clauses.append("comment_count <= %s")
                params.append(comment_count)
            else:
                where_clauses.append("comment_count = %s")
                params.append(comment_count)

        if play_count_increase is not None and play_count_increase_type:
            if play_count_increase_type == "greater":
                where_clauses.append("play_count_increase >= %s")
                params.append(play_count_increase)
            elif play_count_increase_type == "less":
                where_clauses.append("play_count_increase <= %s")
                params.append(play_count_increase)
            else:  # equal
                where_clauses.append("play_count_increase = %s")
                params.append(play_count_increase)

        # 新しいフィルター条件の追加
        if ten_days_increase is not None:
            if ten_days_increase_type == "greater":
                where_clauses.append("ten_days_increase >= %s")
                params.append(ten_days_increase)
            elif ten_days_increase_type == "less":
                where_clauses.append("ten_days_increase <= %s")
                params.append(ten_days_increase)
            else:
                where_clauses.append("ten_days_increase = %s")
                params.append(ten_days_increase)

        if likes_count_increase is not None:
            if likes_count_increase_type == "greater":
                where_clauses.append("likes_count_increase >= %s")
                params.append(likes_count_increase)
            elif likes_count_increase_type == "less":
                where_clauses.append("likes_count_increase <= %s")
                params.append(likes_count_increase)
            else:
                where_clauses.append("likes_count_increase = %s")
                params.append(likes_count_increase)

        if ten_days_likes_increase is not None:
            if ten_days_likes_increase_type == "greater":
                where_clauses.append("ten_days_likes_increase >= %s")
                params.append(ten_days_likes_increase)
            elif ten_days_likes_increase_type == "less":
                where_clauses.append("ten_days_likes_increase <= %s")
                params.append(ten_days_likes_increase)
            else:
                where_clauses.append("ten_days_likes_increase = %s")
                params.append(ten_days_likes_increase)

        if comment_count_increase is not None:
            if comment_count_increase_type == "greater":
                where_clauses.append("comment_count_increase >= %s")
                params.append(comment_count_increase)
            elif comment_count_increase_type == "less":
                where_clauses.append("comment_count_increase <= %s")
                params.append(comment_count_increase)
            else:
                where_clauses.append("comment_count_increase = %s")
                params.append(comment_count_increase)

        if ten_days_comment_increase is not None:
            if ten_days_comment_increase_type == "greater":
                where_clauses.append("ten_days_comment_increase >= %s")
                params.append(ten_days_comment_increase)
            elif ten_days_comment_increase_type == "less":
                where_clauses.append("ten_days_comment_increase <= %s")
                params.append(ten_days_comment_increase)
            else:
                where_clauses.append("ten_days_comment_increase = %s")
                params.append(ten_days_comment_increase)

        # コンテンツタイプのフィルタリング
        if content_type:
            # カンマ区切りの場合は複数条件のORで処理
            if ',' in content_type:
                content_types = content_type.split(',')
                content_type_clauses = []
                for ct in content_types:
                    content_type_clauses.append("content_type = %s")
                    params.append(ct.strip())
                where_clauses.append(f"({' OR '.join(content_type_clauses)})")
                print(f"複数コンテンツタイプフィルター適用: {content_types}")
            else:
                where_clauses.append("content_type = %s")
                params.append(content_type)
                print(f"単一コンテンツタイプフィルター適用: {content_type}")

        # フィルター条件のデバッグログ
        if play_count is not None:
            print(f"Applying play_count filter: {play_count} ({play_count_type})")

        # WHERE句の追加
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理
        # フロントエンドのカラム名とデータベースのカラム名をマッピング
        column_mapping = {
            "audioTitle": "music_info"  # フロントエンドのaudioTitleはデータベースではmusic_info
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
            query += " LIMIT %s OFFSET %s"
            params.extend([limit, offset])

        # デバッグ用にクエリとパラメータを出力
        print(f"Executing query: {query}")
        print(f"With parameters: {params}")

        # メインクエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # 総件数取得（フィルタパラメータを使用）
        count_query = f"SELECT COUNT(*) FROM ({base_query}) as count_query"
        cursor.execute(count_query, filter_params)
        total = cursor.fetchone()[0]

        # 全体の最新投稿日を取得（フィルターに関係なく）
        cursor.execute("SELECT MAX(created_at) FROM frontend_data")
        global_latest_date = cursor.fetchone()[0]
        global_last_updated = format_last_updated(global_latest_date) if global_latest_date else None

        # フィルター適用後の最新投稿日を取得（base_queryを使用）
        filtered_latest_query = f"SELECT MAX(created_at) FROM ({base_query}) as latest_query"
        cursor.execute(filtered_latest_query, filter_params)
        filtered_latest_date = cursor.fetchone()[0]
        filtered_last_updated = format_last_updated(filtered_latest_date) if filtered_latest_date else None

        return {
            "data": [format_video(row) for row in rows],
            "total": total,
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit,
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
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.get("/videos")
async def get_videos_alt(
    request: Request,
    page: int = 1,
    limit: int = 50,
    account_name: Optional[str] = None,
    category: Optional[str] = None,
    hashtag: Optional[str] = None,
    music_info: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_play_count: Optional[int] = None,
    min_likes_count: Optional[int] = None,
    is_viral: Optional[bool] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    sort_by_secondary: Optional[str] = None,
    sort_order_secondary: Optional[str] = "desc",
    play_count: Optional[int] = None,
    play_count_type: Optional[str] = None,
    likes_count: Optional[int] = None,
    likes_count_type: Optional[str] = None,
    comment_count: Optional[int] = None,
    comment_count_type: Optional[str] = None,
    created_at: Optional[str] = None,
    created_at_type: Optional[str] = None,
    play_count_increase: Optional[int] = None,
    play_count_increase_type: Optional[str] = None,
    content_type: Optional[str] = None,
    likes_count_increase: Optional[int] = None,
    likes_count_increase_type: Optional[str] = None,
    ten_days_increase: Optional[int] = None,
    ten_days_increase_type: Optional[str] = None,
    ten_days_likes_increase: Optional[int] = None,
    ten_days_likes_increase_type: Optional[str] = None,
    comment_count_increase: Optional[int] = None,
    comment_count_increase_type: Optional[str] = None,
    ten_days_comment_increase: Optional[int] = None,
    ten_days_comment_increase_type: Optional[str] = None
):
    print(f"Received request with params: {request.query_params}")
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 基本クエリ
        query = """
            SELECT 
                url, thumbnail_url, created_at, play_count, play_count_increase, 
                ten_days_increase, account_name, display_name, content_type, 
                likes_count, comment_count, likes_count_increase, ten_days_likes_increase,
                comment_count_increase, ten_days_comment_increase, account_type,
                hashtags, music_info, caption, category, product
            FROM frontend_data
        """
        params = []
        where_clauses = []

        # 新しいフィルター条件を追加
        if likes_count_increase is not None:
            if likes_count_increase_type == "greater":
                where_clauses.append("likes_count_increase >= %s")
                params.append(likes_count_increase)
            elif likes_count_increase_type == "less":
                where_clauses.append("likes_count_increase <= %s")
                params.append(likes_count_increase)
            else:
                where_clauses.append("likes_count_increase = %s")
                params.append(likes_count_increase)

        if ten_days_increase is not None:
            if ten_days_increase_type == "greater":
                where_clauses.append("ten_days_increase >= %s")
                params.append(ten_days_increase)
            elif ten_days_increase_type == "less":
                where_clauses.append("ten_days_increase <= %s")
                params.append(ten_days_increase)
            else:
                where_clauses.append("ten_days_increase = %s")
                params.append(ten_days_increase)

        if ten_days_likes_increase is not None:
            if ten_days_likes_increase_type == "greater":
                where_clauses.append("ten_days_likes_increase >= %s")
                params.append(ten_days_likes_increase)
            elif ten_days_likes_increase_type == "less":
                where_clauses.append("ten_days_likes_increase <= %s")
                params.append(ten_days_likes_increase)
            else:
                where_clauses.append("ten_days_likes_increase = %s")
                params.append(ten_days_likes_increase)

        if comment_count_increase is not None:
            if comment_count_increase_type == "greater":
                where_clauses.append("comment_count_increase >= %s")
                params.append(comment_count_increase)
            elif comment_count_increase_type == "less":
                where_clauses.append("comment_count_increase <= %s")
                params.append(comment_count_increase)
            else:
                where_clauses.append("comment_count_increase = %s")
                params.append(comment_count_increase)

        if ten_days_comment_increase is not None:
            if ten_days_comment_increase_type == "greater":
                where_clauses.append("ten_days_comment_increase >= %s")
                params.append(ten_days_comment_increase)
            elif ten_days_comment_increase_type == "less":
                where_clauses.append("ten_days_comment_increase <= %s")
                params.append(ten_days_comment_increase)
            else:
                where_clauses.append("ten_days_comment_increase = %s")
                params.append(ten_days_comment_increase)

        # コンテンツタイプのフィルタリング
        if content_type:
            if ',' in content_type:
                content_types = content_type.split(',')
                content_type_clauses = []
                for ct in content_types:
                    content_type_clauses.append("content_type = %s")
                    params.append(ct.strip())
                where_clauses.append(f"({' OR '.join(content_type_clauses)})")
            else:
                where_clauses.append("content_type = %s")
                params.append(content_type)

        # WHERE句の追加
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理
        valid_sort_fields = {
            'created_at', 'play_count', 'likes_count', 'comment_count',
            'play_count_increase', 'likes_count_increase', 'comment_count_increase',
            'ten_days_increase', 'ten_days_likes_increase', 'ten_days_comment_increase'
        }
        
        valid_sort_orders = {'asc', 'desc'}

        if sort_by in valid_sort_fields:
            # sort_orderのサニタイズ
            clean_sort_order = sort_order.lower().split()[0] if sort_order else 'desc'
            clean_sort_order = clean_sort_order if clean_sort_order in valid_sort_orders else 'desc'
            
            query += f" ORDER BY {sort_by} {clean_sort_order}"
            
            if sort_by_secondary in valid_sort_fields:
                # secondary_sort_orderのサニタイズ
                clean_secondary_order = sort_order_secondary.lower().split()[0] if sort_order_secondary else 'desc'
                clean_secondary_order = clean_secondary_order if clean_secondary_order in valid_sort_orders else 'desc'
                
                query += f", {sort_by_secondary} {clean_secondary_order}"
        else:
            query += " ORDER BY created_at DESC"

        # ページネーション
        if limit != -1:
            query += " LIMIT %s OFFSET %s"
            offset = (page - 1) * limit
            params.extend([limit, offset])

        print(f"Executing query: {query}")
        print(f"With parameters: {params}")

        # クエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # 総件数取得
        count_query = """
            SELECT COUNT(*) FROM frontend_data
        """
        if where_clauses:
            count_query += " WHERE " + " AND ".join(where_clauses)
        
        cursor.execute(count_query, params[:-2] if limit != -1 else params)
        total = cursor.fetchone()[0]

        return {
            "success": True,
            "data": [format_video(row) for row in rows],
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit if limit != -1 else 1,
            "total": total
        }

    except Exception as e:
        print(f"Error in get_videos_alt: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": str(e)
            }
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.get("/health")
async def health_check():
    try:
        print("Health check endpoint called")  # この行が表示されるか確認
        
        # データベースモジュールのインポートを試行
        try:
            from src.db.database import get_db_connection
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
            conn = get_db_connection()
            print("Database connection established")
            
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
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
        finally:
            if 'conn' in locals() and conn:
                conn.close()
                print("Database connection closed")
                
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
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM frontend_data WHERE id = %s", (row_id,))
        row = cursor.fetchone()
        
        if not row:
            return {"error": "Row not found"}
            
        # 生データを表示
        raw_data = {
            "row_data": [str(item) for item in row],
            "columns": [desc[0] for desc in cursor.description]
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
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.get("/api/categories")
async def get_categories():
    """カテゴリ一覧を取得するエンドポイント"""
    try:
        # データベースに接続
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # データベース構造を確認
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        logger.info(f"データベース内のテーブル: {tables}")
        
        # frontend_dataテーブルの構造確認
        cursor.execute("DESCRIBE frontend_data")
        columns = [row[0] for row in cursor.fetchall()]
        logger.info(f"frontend_dataテーブルのカラム: {columns}")
        
        # カテゴリ情報があるか確認
        if 'category' in columns:
            # カテゴリ一覧の取得
            cursor.execute(
                "SELECT DISTINCT category FROM frontend_data WHERE category IS NOT NULL AND category != ''"
            )
            categories_rows = cursor.fetchall()
            
            # デバッグ情報の出力
            logger.info(f"取得したカテゴリデータ行数: {len(categories_rows)}")
            if categories_rows:
                logger.info(f"カテゴリデータサンプル: {categories_rows[:5]}")
            
            # カテゴリリストの作成
            categories = [row[0] for row in categories_rows if row[0]]
            
            # レスポンス作成
            result = {
                "success": True,
                "categories": categories,
                "products": [],  # 簡略化のため空リストで返す
                "category_products": {}  # 簡略化のため空辞書で返す
            }
        else:
            # カテゴリカラムがない場合
            result = {
                "success": False,
                "error": "カテゴリ情報が見つかりません",
                "categories": []
            }
        
        connection.close()
        return result
        
    except Exception as e:
        logger.error(f"カテゴリ取得エラー: {str(e)}")
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
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # アカウント一覧の取得
        cursor.execute(
            "SELECT DISTINCT account_name FROM frontend_data WHERE account_name IS NOT NULL AND account_name != ''"
        )
        accounts = [row[0] for row in cursor.fetchall()]
        
        connection.close()
        
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
        connection = get_db_connection()
        cursor = connection.cursor()
        
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
        hashtags = [{"hashtag": tag} for tag in unique_hashtags if tag]
        
        connection.close()
        
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
        # データベースに接続
        connection = get_db_connection()
        cursor = connection.cursor()
        
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
        
        connection.close()
        
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
    hashtag: Optional[str] = None,
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
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # フィルター条件を構築
        params = []
        where_clauses = []
        
        # 以下、通常のフィルター条件構築処理と同じ
        if account_name:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_account_name = account_name.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("account_name LIKE %s")
            params.append(f"%{escaped_account_name}%")
        
        # カテゴリフィルターのOR条件処理
        category_filters = []
        category_params = []

        # category_countパラメータがある場合は複数カテゴリ
        category_count = request.query_params.get('category_count')
        if category_count and category_count.isdigit():
            count = int(category_count)
            for i in range(count):
                cat_param = request.query_params.get(f'category_{i}')
                if cat_param:
                    escaped_cat = cat_param.replace("_", r"\_").replace("%", r"\%")
                    category_filters.append("category LIKE %s")
                    category_params.append(f"%{escaped_cat}%")
        
        # 1つ以上のカテゴリフィルターがある場合は、OR条件で結合
        if category_filters:
            where_clauses.append(f"({' OR '.join(category_filters)})")
            params.extend(category_params)
        # 従来の単一カテゴリ処理
        elif category:
            escaped_category = category.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("category LIKE %s")
            params.append(f"%{escaped_category}%")
        
        if hashtag:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_hashtag = hashtag.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("hashtags LIKE %s")
            params.append(f"%{escaped_hashtag}%")
            
        if music_info:
            # SQLのLIKE句で使用される特殊文字（_ と %）をエスケープ
            escaped_music_info = music_info.replace("_", r"\_").replace("%", r"\%")
            where_clauses.append("music_info LIKE %s")
            params.append(f"%{escaped_music_info}%")
        
        if min_play_count:
            where_clauses.append("play_count >= %s")
            params.append(min_play_count)
            
        if min_likes_count:
            where_clauses.append("likes_count >= %s")
            params.append(min_likes_count)
            
        if start_date and end_date:
            where_clauses.append("created_at BETWEEN %s AND %s")
            params.append(start_date)
            params.append(end_date)
        elif start_date:
            where_clauses.append("created_at >= %s")
            params.append(start_date)
        elif end_date:
            where_clauses.append("created_at <= %s")
            params.append(end_date)
            
        if created_at:
            if created_at_type == "after" or created_at_type == "greater":
                where_clauses.append("created_at >= %s")
                params.append(created_at)
            elif created_at_type == "before" or created_at_type == "less":
                where_clauses.append("created_at <= %s")
                params.append(created_at)
            else:  # exact date
                # 日付が "YYYY-MM-DD" 形式の場合、その日の範囲を指定
                where_clauses.append("DATE(created_at) = DATE(%s)")
                params.append(created_at)
        
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
            cursor.execute(query, params)
            categories = [row[0] for row in cursor.fetchall() if row[0]]
            
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
            cursor.execute(query, params)
            accounts = [row[0] for row in cursor.fetchall() if row[0]]
            result["accounts"] = sorted(accounts)
            
        if filter_type in ["hashtags", "all"]:
            # ハッシュタグ一覧を取得
            query = f"SELECT DISTINCT hashtags FROM frontend_data{base_where}"
            cursor.execute(query, params)
            
            # ハッシュタグを処理
            all_hashtags = []
            for row in cursor.fetchall():
                if row[0]:
                    try:
                        # JSON形式の場合はパース
                        hashtags_json = json.loads(row[0])
                        if isinstance(hashtags_json, list):
                            all_hashtags.extend(hashtags_json)
                        else:
                            hashtags = row[0]
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
                        hashtags = row[0]
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
            cursor.execute(query, params)
            music_titles = [row[0] for row in cursor.fetchall() if row[0]]
            result["music"] = sorted(music_titles)
            
        return result
        
    except Exception as e:
        print(f"Error in get_filter_options: {str(e)}")
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

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
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
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
        query = f"SELECT {', '.join(needed_columns)} FROM trend_analysis WHERE collection_date BETWEEN %s AND %s"
        
        # ここで params 変数を初期化
        params = [start_date, end_date]
        
        # インデックスを活用するクエリ順序に変更
        if genre_list:
            query += " AND genre IN (" + ", ".join(["%s"] * len(genre_list)) + ")"
            params.extend(genre_list)
            
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
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # 結果整形 - 日付ごとにジャンル別データを整理
        timeline_data = {}
        
        for row in rows:
            date_str = row[0].isoformat()
            genre = row[1]
            
            if date_str not in timeline_data:
                timeline_data[date_str] = {}
                
            genre_data = {}
            for i, metric in enumerate(metric_list):
                genre_data[metric] = row[i+2]
                
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
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

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
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
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
            collection_date BETWEEN %s AND %s
        """
        params = [start_date, end_date]
        
        if genre_list:
            query += " AND genre IN (" + ", ".join(["%s"] * len(genre_list)) + ")"
            params.extend(genre_list)
            
        query += " GROUP BY genre ORDER BY total_view_increase DESC"
        
        # デバッグ情報
        print(f"実行するクエリ: {query}")
        print(f"パラメータ: {params}")
        
        # クエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # 結果整形
        summary_data = []
        for row in rows:
            genre = row[0]
            total_view_increase = int(row[1]) if row[1] else 0
            total_videos_10k_plus = int(row[2]) if row[2] else 0
            total_videos_100k_plus = int(row[3]) if row[3] else 0
            total_posts = int(row[4]) if row[4] else 0
            
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
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.get("/api/trends/genres")
async def get_trend_genres():
    """トレンド分析で利用可能なジャンル一覧を取得するAPI"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # ユニークなジャンル一覧を取得
        query = "SELECT DISTINCT genre FROM trend_analysis ORDER BY genre"
        cursor.execute(query)
        rows = cursor.fetchall()
        
        genres = [row[0] for row in rows]
        
        return {
            "success": True,
            "data": genres
        }
        
    except Exception as e:
        logger.error(f"トレンドジャンル一覧取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.get("/api/trends/dates")
async def get_trend_dates():
    """トレンド分析の利用可能な集計日一覧を取得するAPI"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 集計日の一覧を取得（最新順）
        query = "SELECT DISTINCT collection_date FROM trend_analysis ORDER BY collection_date DESC"
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # ISO形式の日付文字列に変換
        dates = [row[0].isoformat() for row in rows]
        
        return {
            "success": True,
            "data": dates
        }
        
    except Exception as e:
        logger.error(f"トレンド集計日一覧取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.middleware("http")
async def update_session_middleware(request: Request, call_next):
    """リクエスト処理時にセッションアクティビティを更新するミドルウェア"""
    response = await call_next(request)
    
    # セッショントークンをクッキーまたはヘッダーから取得
    session_token = request.cookies.get("session_token") or request.headers.get("X-Session-Token")
    
    if session_token:
        # 非同期でセッション最終利用日時を更新
        # 実際の実装では、データベースに接続して更新処理を行う
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            current_time = datetime.utcnow()
            cursor.execute(
                "UPDATE sessions SET last_used_at = %s WHERE session_token = %s",
                (current_time, session_token)
            )
            conn.commit()
        except Exception as e:
            logger.error(f"セッション更新エラー: {e}")
        finally:
            cursor.close()
            conn.close()
    
    return response

@app.get("/api/video/play-count-history/{video_id}")
async def get_video_play_count_history(
    video_id: str,
    days: Optional[int] = 30
):
    logger.info(f"再生数履歴取得リクエスト受信: video_id={video_id}, days={days}")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # テーブル存在確認
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        tables_list = [t[0] for t in tables]
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

        # 通常のカーソルを使用
        cursor = conn.cursor()

        query = """
        SELECT 
            collection_date,
            play_count_increase
        FROM play_count_history
        WHERE 
            video_id = %s
            AND collection_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
        ORDER BY collection_date ASC
        """
        
        # クエリ実行前のデバッグログ
        logger.info(f"実行するクエリ: {query}")
        logger.info(f"パラメータ: video_id={video_id}, days={days}")
        
        cursor.execute(query, (video_id, days))
        results = cursor.fetchall()
        
        # 結果のデバッグログ
        logger.info(f"取得した結果: {results}")

        # 結果を整形
        history = []
        for result in results:
            history.append({
                "collection_date": result[0].strftime("%Y-%m-%d"),
                "play_count_increase": result[1] if result[1] is not None else 0
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
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# uvicornでの直接起動用（Option 2の場合は不要）
if __name__ == "__main__":
    print("Starting application via __main__")
    uvicorn.run(
        "main:app",  # 文字列として渡す
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