from dotenv import load_dotenv
from config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
# アカウント情報関連
from sync_spreadsheet import scheduled_job as sync_spreadsheet_job
from crawl_processor import process_pubsub as crawl_processor_pubsub
from url_collector import process_pubsub as url_collector_pubsub

# データ同期関連
from category_analytics_aggregator import process_category_statistics as category_analytics_function
from frontend_data_update import scheduled_job as frontend_update_job

# 動画情報関連
from video_collector import collect_videos as video_collector_function
from video_url_data_updater import update_video_url_data as video_url_updater_function
from sync_video_urls import sync_video_urls_job as sync_video_urls_job
from process_video_data import process_pubsub as process_video_data_pubsub

# カテゴリー関連
from sync_category_spreadsheet import scheduled_job as sync_category_job
from update_all_categories import update_all_categories as update_all_categories_function

# スケジューラー関連
from batch_scheduler import manage_frontend_update_schedule as batch_scheduler_function

# インポート部分に追加
from video_history_sync import sync_video_history

# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数
def scheduled_job(request):
    return sync_spreadsheet_job(request)

def frontend_update(request):
    return frontend_update_job(request)

def sync_category_spreadsheet(request):
    return sync_category_job(request)

def sync_video_urls(request):
    return sync_video_urls_job(request)

def update_all_categories(request):
    return update_all_categories_function(request)

# Pub/Sub (CloudEvent) エントリーポイント関数
def process_pubsub(event,context):
    return crawl_processor_pubsub(event,context)

def process_video_data(event,context):
    return process_video_data_pubsub(event,context)

def url_collector(event,context):
    return url_collector_pubsub(event,context)

def collect_videos(event,context):
    return video_collector_function(event,context)

def video_url_data_updater(event,context):
    return video_url_updater_function(event,context)

# batch_scheduler用のエントリーポイント関数を追加
def manage_frontend_update_schedule(event,context):
    return batch_scheduler_function(event,context)

# カテゴリー統計集計用のエントリーポイント関数
def category_analytics_aggregator(event, context):
    return category_analytics_function(event, context)

# Pub/Sub エントリーポイント関数に追加
def video_history_sync_function(event, context):
    return sync_video_history(event, context)

