from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from typing import Optional, Dict
from src.db.database import get_db_connection, format_video
from src.utils.logger_config import setup_logger
from src.auth.router import router as auth_router
import traceback
import uvicorn
import sys
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import pathlib

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

# 環境変数からオリジンを取得
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# 認証ルーターの追加
app.include_router(auth_router)

# 絶対パスを使用してテンプレートディレクトリを指定
base_dir = pathlib.Path(__file__).parent.resolve()
templates_directory = str(base_dir / "templates")
print(f"テンプレートディレクトリ: {templates_directory}")  # デバッグ用
templates = Jinja2Templates(directory=templates_directory)

# 静的ファイルのディレクトリも同様に絶対パスで指定
static_directory = str(base_dir / "static")
print(f"静的ファイルディレクトリ: {static_directory}")  # デバッグ用
app.mount("/static", StaticFiles(directory=static_directory), name="static")

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
    play_count: Optional[int] = None,
    play_count_type: Optional[str] = None
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
        query = "SELECT * FROM frontend_data"
        params = []
        where_clauses = []

        # フィルター処理
        if account_name:
            where_clauses.append("account_name LIKE %s")
            params.append(f"%{account_name}%")
        
        if category:
            where_clauses.append("category LIKE %s")
            params.append(f"%{category}%")
            
        if hashtag:
            where_clauses.append("hashtags LIKE %s")
            params.append(f"%{hashtag}%")
            
        if music_info:
            where_clauses.append("music_info LIKE %s")
            params.append(f"%{music_info}%")
            
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
                where_clauses.append("play_count > %s")
                params.append(play_count)
            elif play_count_type == "less":
                where_clauses.append("play_count < %s")
                params.append(play_count)
            else:
                where_clauses.append("play_count = %s")
                params.append(play_count)

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
        query += f" ORDER BY {actual_sort_by} {sort_order}"

        # 総件数取得
        count_cursor = conn.cursor()
        count_cursor.execute(f"SELECT COUNT(*) FROM ({query}) as count_query", params)
        total = count_cursor.fetchone()[0]

        # ページネーション
        query += " LIMIT %s OFFSET %s"
        params.extend([limit, (page - 1) * limit])

        # デバッグ用にクエリとパラメータを出力
        print(f"Executing query: {query}")
        print(f"With parameters: {params}")

        # メインクエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()

        return {
            "data": [format_video(row) for row in rows],
            "total": total,
            "currentPage": page,
            "totalPages": (total + limit - 1) // limit,
            "success": True
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
    play_count: Optional[int] = None,
    play_count_type: Optional[str] = None
):
    """代替の/videosエンドポイント - 既存の/api/videosと同じ処理を行う"""
    return await get_videos(
        request=request,
        page=page,
        limit=limit,
        account_name=account_name,
        category=category,
        hashtag=hashtag,
        music_info=music_info,
        start_date=start_date,
        end_date=end_date,
        min_play_count=min_play_count,
        min_likes_count=min_likes_count,
        is_viral=is_viral,
        sort_by=sort_by,
        sort_order=sort_order,
        play_count=play_count,
        play_count_type=play_count_type
    )

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

# APIテスト用のUIを追加
@app.get("/test-ui", response_class=HTMLResponse)
async def test_ui(request: Request):
    """APIテスト用のブラウザインターフェース"""
    print("test-uiエンドポイントにアクセスがありました")  # デバッグ用
    return templates.TemplateResponse("test.html", {"request": request})

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