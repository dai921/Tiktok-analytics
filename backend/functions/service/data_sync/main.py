from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
from services.summary_all_trends import update_all_trends_summary as sync_all_trends_manual_function
from services.summary_table_sync import update_product_daily_summary as summary_table_sync_function
from services.sync_category_spreadsheet import scheduled_job as sync_category_job
from services.top100_videos_sync import update_product_top100_videos as top100_videos_sync_function
from services.update_needs_flags import update_needs_flags as update_needs_flags_function
from services.video_hashtags_sync import sync_video_hashtags as sync_video_hashtags_manual_function
from services.video_history_sync import sync_video_history
from services.video_master_sync import sync_video_master as sync_raw_data_to_video_master

# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

def sync_all_trends_manual(request):
    return sync_all_trends_manual_function(request)

def sync_summary(event,context):
    return summary_table_sync_function(event,context)

def sync_category_spreadsheet(request):
    return sync_category_job(request)

def sync_top100(event,context):
    return top100_videos_sync_function(event,context)

def update_needs_flags_reset(event,context):
    return update_needs_flags_function(event,context)

def sync_video_hashtags_manual(request):
    return sync_video_hashtags_manual_function(request)

def video_history_sync_function(event, context):
    return sync_video_history(event, context)

def video_master_sync_from_raw_data(event,context):
    return sync_raw_data_to_video_master(event,context)


