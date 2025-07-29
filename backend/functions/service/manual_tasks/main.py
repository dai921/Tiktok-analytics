from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
from services.manual_all_trends import sync_all_trends_manual as manual_all_trends_sync_function
from services.manual_hashtags_sync import manual_hashtags_sync as manual_hashtags_sync_function
from services.manual_summary_sync import backfill_product_daily_summary as manual_summary_sync_function
from services.manual_sync_master import sync_video_master as manual_sync_master_from_raw_data
from services.manual_sync_video_play_count import manual_sync_video_play_count as manual_sync_video_play_count_function
from services.manual_top100_sync import collect_historical_top100_videos as manual_top100_sync_function
from services.update_all_categories import update_all_categories as update_all_categories_function


# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数
def manual_all_trends(request):
    return manual_all_trends_sync_function(request)

def manual_hashtags_sync(request):
    return manual_hashtags_sync_function(request)

def manual_sync_summary(request):
    return manual_summary_sync_function(request)

def manual_sync_master(request):
    return manual_sync_master_from_raw_data(request)

def manual_sync_video_play_count(request):
    return manual_sync_video_play_count_function(request)

def manual_top100_sync(request):
    return manual_top100_sync_function(request)

def update_all_categories(request):
    return update_all_categories_function(request)




