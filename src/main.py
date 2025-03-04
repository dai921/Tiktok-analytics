from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
from src.db.database import get_db_connection, format_video
from src.utils.logger_config import setup_logger

app = FastAPI()

# 現在のファイルのディレクトリパスを取得
current_dir = os.path.dirname(os.path.abspath(__file__))

# 静的ファイルとテンプレートのディレクトリパスを設定
static_directory = os.path.join(current_dir, "static")
templates_directory = os.path.join(current_dir, "templates")

print(f"テンプレートディレクトリ: {templates_directory}")
print(f"静的ファイルディレクトリ: {static_directory}")

# テンプレートの設定
templates = Jinja2Templates(directory=templates_directory)

# 静的ファイルの設定
app.mount("/static", StaticFiles(directory=static_directory), name="static")

# ... existing code ... 