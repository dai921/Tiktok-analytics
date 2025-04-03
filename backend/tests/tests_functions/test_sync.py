import sys
import os

# backendディレクトリへのパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.sync.frontend_data_update import FrontendDataUpdater
import functions_framework
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)

def main():
    try:
        updater = FrontendDataUpdater()
        result = updater.update_frontend_from_master()
        print(f"実行結果: {result}")
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")

if __name__ == "__main__":
    main()