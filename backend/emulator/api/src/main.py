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
import json

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
print(f"テンプレートディレクトリ: {templates_directory}")  # デバッグ用i
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
    play_count_type: Optional[str] = None,
    likes_count: Optional[int] = None,
    likes_count_type: Optional[str] = None,
    comment_count: Optional[int] = None,
    comment_count_type: Optional[str] = None
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

        # フィルタパラメータを保持
        filter_params = params.copy()

        # ページネーション用にLIMIT/OFFSETを追加
        query += " LIMIT %s OFFSET %s"
        offset = (page - 1) * limit
        params.extend([limit, offset])

        # デバッグ用にクエリとパラメータを出力
        print(f"Executing query: {query}")
        print(f"With parameters: {params}")

        # メインクエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # 総件数取得（フィルタパラメータを使用）
        count_query = f"SELECT COUNT(*) FROM ({query}) as count_query"
        cursor.execute(count_query, filter_params)
        total = cursor.fetchone()[0]

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
    play_count_type: Optional[str] = None,
    likes_count: Optional[int] = None,
    likes_count_type: Optional[str] = None,
    comment_count: Optional[int] = None,
    comment_count_type: Optional[str] = None,
    created_at: Optional[str] = None,
    created_at_type: Optional[str] = None,
):
    print(f"Received request with params: {request.query_params}")
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 基本クエリ
        query = "SELECT * FROM frontend_data"
        params = []
        where_clauses = []

        # 日付フィルターの処理
        if created_at:
            print(f"Applying date filter: created_at={created_at}, type={created_at_type}")
            
            if created_at_type == 'date':
                where_clauses.append("DATE(created_at) = DATE(%s)")
                params.append(created_at)
            elif created_at_type == 'after':
                where_clauses.append("DATE(created_at) >= DATE(%s)")
                params.append(created_at)
            elif created_at_type == 'before':
                where_clauses.append("DATE(created_at) <= DATE(%s)")
                params.append(created_at)

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

        # WHERE句の追加
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        # ソート処理の追加
        if sort_by:
            # フィールド名のマッピング
            field_mapping = {
                'play_count': 'play_count',
                'likes_count': 'likes_count',
                'comment_count': 'comment_count',
                'created_at': 'created_at',
                # 必要に応じて他のフィールドも追加
            }
            
            # マッピングされたフィールド名を使用
            db_field = field_mapping.get(sort_by, sort_by)
            query += f" ORDER BY {db_field} {sort_order.upper()}"

        # 基本クエリを保存（LIMIT/OFFSET なし）
        base_query = query

        # フィルタパラメータを保持
        filter_params = params.copy()

        # ページネーション用にLIMIT/OFFSETを追加
        query += " LIMIT %s OFFSET %s"
        offset = (page - 1) * limit
        params.extend([limit, offset])

        print(f"Executing query: {query}")
        print(f"With params: {params}")

        # メインクエリ実行
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # 総件数取得（フィルタパラメータを使用）
        count_query = f"SELECT COUNT(*) FROM ({base_query}) as count_query"
        cursor.execute(count_query, filter_params)
        total = cursor.fetchone()[0]

        # 総ページ数を計算
        total_pages = (total + limit - 1) // limit

        return {
            "success": True,
            "data": [format_video(row) for row in rows],
            "currentPage": page,
            "totalPages": total_pages,
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

# APIテスト用のUIを追加
@app.get("/test-ui", response_class=HTMLResponse)
async def test_ui(request: Request):
    """APIテスト用のブラウザインターフェース"""
    print("test-uiエンドポイントにアクセスがありました")  # デバッグ用
    return templates.TemplateResponse("test.html", {"request": request})

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
async def get_hashtags(limit: int = 100):
    """ハッシュタグ一覧を取得するエンドポイント"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # ハッシュタグ一覧の取得
        cursor.execute(
            "SELECT DISTINCT hashtags FROM frontend_data WHERE hashtags IS NOT NULL AND hashtags != '' LIMIT %s",
            (limit,)
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