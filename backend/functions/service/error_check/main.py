from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
from services.video_count_check import scheduled_job as video_count_check_function



# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数
def video_count_check(request):
    return video_count_check_function(request)





