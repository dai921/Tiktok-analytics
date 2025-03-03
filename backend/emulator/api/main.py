from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Optional, Dict
from database import get_db_connection, format_video
from logger_config import setup_logger
import traceback
import uvicorn
import sys
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder

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

# CORSミドルウェアの追加
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def get_videos(page: int = 1, limit: int = 50, filters: Optional[Dict] = None):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 基本クエリ
        query = "SELECT * FROM frontend_data"
        params = []

        # フィルター処理
        if filters:
            where_clauses = []
            for field, filter_data in filters.items():
                if filter_data["type"] == "sort":
                    continue
                if filter_data["type"] == "greater":
                    where_clauses.append(f"{field} >= %s")
                elif filter_data["type"] == "less":
                    where_clauses.append(f"{field} <= %s")
                elif filter_data["type"] == "equal":
                    where_clauses.append(f"{field} LIKE %s")
                params.append(filter_data["value"])

            if where_clauses:
                query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理
        if filters:
            for field, filter_data in filters.items():
                if filter_data["type"] == "sort":
                    query += f" ORDER BY {field} {filter_data['value']}"
                    break

        # 総件数取得
        count_cursor = conn.cursor()
        count_cursor.execute(f"SELECT COUNT(*) FROM ({query}) as count_query", params)
        total = count_cursor.fetchone()[0]

        # ページネーション
        query += " LIMIT %s OFFSET %s"
        params.extend([limit, (page - 1) * limit])

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
            from database import get_db_connection
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