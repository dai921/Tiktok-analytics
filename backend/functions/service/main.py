from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート

# データ同期関連
from services.data_sync.frontend_data_update.frontend_data_update import process_pubsub_message as frontend_update_job
from services.data_sync.update_needs_flags import update_needs_flags as update_needs_flags_function
from services.data_sync.summary_table_sync import update_product_daily_summary as summary_table_sync_function
from services.data_sync.top100_videos_sync import update_product_top100_videos as top100_videos_sync_function
from services.data_sync.frontend_data_update.frontend_affiliate_data_update import process_pubsub_message as frontend_affiliate_update_job
from services.data_sync.frontend_data_update.frontend_corporate_data_update import process_pubsub_message as frontend_corporate_update_job
from services.data_sync.frontend_data_update.frontend_influencer_data_update import process_pubsub_message as frontend_influencer_update_job
from services.data_sync.frontend_data_update.batch_scheduler_affiliate import manage_affiliate_update_schedule as frontend_affiliate_update_schedule
from services.data_sync.frontend_data_update.batch_scheduler_corporate import manage_corporate_update_schedule as frontend_corporate_update_schedule
from services.data_sync.frontend_data_update.batch_scheduler_influencer import manage_influencer_update_schedule as frontend_influencer_update_schedule

# カテゴリー関連
from services.category.sync_category_spreadsheet import scheduled_job as sync_category_job
from services.category.batch_category_scheduler import manage_category_update_schedule as batch_category_scheduler_function

# スケジューラー関連
from services.data_sync.frontend_data_update.batch_scheduler import manage_frontend_update_schedule as batch_scheduler_function
from services.data_sync.frontend_data_update.frontend_data_trigger import trigger_frontend_data_update  as frontend_update_trigger_function

# インポート部分に追加
from services.data_sync.video_history_sync import sync_video_history
from services.data_sync.video_master_sync import sync_video_master as sync_raw_data_to_video_master
from services.account_info.sync_account_list import sync_account_list as sync_account
from services.account_info.sync_crawler_accounts import sync_crawler_accounts as sync_crawler
from services.account_info.sync_corporate_accounts_sheet import sync_corporate_accounts_from_sheet as sync_corporate_accounts_sheet
# 手動実行タスク
from services.manual_tasks.manual_sync_master import sync_video_master as manual_sync_master_from_raw_data
from services.manual_tasks.update_all_categories import update_all_categories as update_all_categories_function
from services.manual_tasks.manual_sync_video_play_count import manual_sync_video_play_count as manual_sync_video_play_count_function
from services.manual_tasks.manual_summary_sync import backfill_product_daily_summary as manual_summary_sync_function
from services.manual_tasks.manual_top100_sync import collect_historical_top100_videos as manual_top100_sync_function
# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数

def frontend_update(event,context):
    return frontend_update_job(event,context)

def frontend_affiliate_update(event,context):
    return frontend_affiliate_update_job(event,context)

def frontend_corporate_update(event,context):
    return frontend_corporate_update_job(event,context)

def frontend_influencer_update(event,context):
    return frontend_influencer_update_job(event,context)

def frontend_update_trigger(request):
    return frontend_update_trigger_function(request)

def sync_category_spreadsheet(request):
    return sync_category_job(request)

def sync_account_list(request):
    return sync_account(request)

def sync_summary(event,context):
    return summary_table_sync_function(event,context)

def sync_top100(event,context):
    return top100_videos_sync_function(event,context)

def sync_crawler_accounts(request):    
    return sync_crawler(request)

# Pub/Sub エントリーポイント: account_list同期後に起動するcorporate_accounts同期
def sync_corporate_accounts(event, context):
    return sync_corporate_accounts_sheet(event)

def update_all_categories(request):
    return update_all_categories_function(request)


def video_master_sync_from_raw_data(event,context):
    return sync_raw_data_to_video_master(event,context)

# batch_scheduler用のエントリーポイント関数を追加
def manage_frontend_update_schedule(event,context):
    return batch_scheduler_function(event,context)

def manage_frontend_affiliate_update_schedule(event,context):
    return frontend_affiliate_update_schedule(event,context)

def manage_frontend_corporate_update_schedule(event,context):
    return frontend_corporate_update_schedule(event,context)

def manage_frontend_influencer_update_schedule(event,context):
    return frontend_influencer_update_schedule(event,context)

# Pub/Sub エントリーポイント関数に追加
def video_history_sync_function(event, context):
    return sync_video_history(event, context)

# Pub/Subエントリーポイント関数に追加
def manage_category_update_schedule(event,context):
    return batch_category_scheduler_function(event,context)
# 手動実行タスク
def manual_sync_master_raw_data(request):
    return manual_sync_master_from_raw_data(request)

def update_needs_flags_reset(event,context):
    return update_needs_flags_function(event,context)

def manual_sync_video_play_count(request):
    return manual_sync_video_play_count_function(request)

def manual_sync_summary(request):
    return manual_summary_sync_function(request)

def manual_top100_sync(request):
    return manual_top100_sync_function(request)

