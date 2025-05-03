from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
# アカウント情報関連
# from services.account_info.sync_spreadsheet import scheduled_job as sync_spreadsheet_job
# from services.account_info.crawl_processor import process_pubsub as crawl_processor_pubsub
# from services.account_info.url_collector import process_pubsub as url_collector_pubsub

# データ同期関連
from services.data_sync.category_analytics_aggregator import process_category_statistics as category_analytics_function
from services.data_sync.frontend_data_update.frontend_data_update import scheduled_job as frontend_update_job
from services.data_sync.update_needs_flags import update_needs_flags as update_needs_flags_function

# 動画情報関連
from services.video_info.video_collector import collect_videos as video_collector_function
from services.video_info.video_url_data_updater import update_video_url_data as video_url_updater_function
from services.video_info.sync_video_urls import sync_video_urls_job
from services.video_info.process_video_data import process_pubsub as process_video_data_pubsub
from services.video_info.batch_sync_scheduler import manage_video_url_sync_schedule as batch_sync_scheduler_function
from services.video_info.batch_collector_scheduler import manage_video_collector_schedule as batch_collector_scheduler_function

# カテゴリー関連
from services.category.sync_category_spreadsheet import scheduled_job as sync_category_job
from services.category.batch_category_scheduler import manage_category_update_schedule as batch_category_scheduler_function

# スケジューラー関連
from services.data_sync.frontend_data_update.batch_scheduler import manage_frontend_update_schedule as batch_scheduler_function

# インポート部分に追加
from services.data_sync.video_history_sync import sync_video_history
from services.data_sync.video_master_sync import sync_video_master as sync_raw_data_to_video_master
from services.account_info.sync_account_list import sync_account_list as sync_account
from services.account_info.sync_crawler_accounts import sync_crawler_accounts as sync_crawler
# 手動実行タスク
from services.manual_tasks.manual_sync_master import sync_video_master as manual_sync_master_from_raw_data
from services.manual_tasks.update_all_categories import update_all_categories as update_all_categories_function
# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数
# def scheduled_job(request):
#     return sync_spreadsheet_job(request)

def frontend_update(request):
    return frontend_update_job(request)

def sync_category_spreadsheet(request):
    return sync_category_job(request)

def sync_video_urls(request):
    return sync_video_urls_job(request)

def sync_account_list(request):
    return sync_account(request)

def sync_crawler_accounts(request):    
    return sync_crawler(request)

def update_all_categories(request):
    return update_all_categories_function(request)

# Pub/Sub (CloudEvent) エントリーポイント関数
# def process_pubsub(event,context):
#     return crawl_processor_pubsub(event,context)

def process_video_data(event,context):
    return process_video_data_pubsub(event,context)

# def url_collector(event,context):
#     return url_collector_pubsub(event,context)

def collect_videos(event,context):
    return video_collector_function(event,context)

def video_url_data_updater(event,context):
    return video_url_updater_function(event,context)

def video_master_sync_from_raw_data(event,context):
    return sync_raw_data_to_video_master(event,context)

# batch_scheduler用のエントリーポイント関数を追加
def manage_frontend_update_schedule(event,context):
    return batch_scheduler_function(event,context)

def manage_video_url_sync_schedule(event,context):
    return batch_sync_scheduler_function(event,context)

def manage_video_collector_schedule(event,context):
    return batch_collector_scheduler_function(event,context)

# カテゴリー統計集計用のエントリーポイント関数
def category_analytics_aggregator(event, context):
    return category_analytics_function(event, context)

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