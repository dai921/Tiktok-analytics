from dotenv import load_dotenv
from config import initialize_config

# 各モジュールからエントリーポイント関数をインポート
from sync_spreadsheet import scheduled_job as sync_spreadsheet_job
from frontend_data_update import scheduled_job as frontend_update_job
from sync_category_spreadsheet import scheduled_job as sync_category_job
from crawl_processor import process_pubsub as crawl_processor_pubsub
from process_video_data import process_pubsub as process_video_data_pubsub
from url_collector import process_pubsub as url_collector_pubsub
from video_collector import collect_videos as video_collector_function
from video_url_data_updater import update_video_url_data as video_url_updater_function
from batch_scheduler import manage_frontend_update_schedule as batch_scheduler_function

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

# Pub/Sub (CloudEvent) エントリーポイント関数
def process_pubsub(cloud_event):
    return crawl_processor_pubsub(cloud_event)

def process_video_data(cloud_event):
    return process_video_data_pubsub(cloud_event)

def url_collector(cloud_event):
    return url_collector_pubsub(cloud_event)

def collect_videos(cloud_event):
    return video_collector_function(cloud_event)

def video_url_data_updater(cloud_event):
    return video_url_updater_function(cloud_event)

# batch_scheduler用のエントリーポイント関数を追加
def manage_frontend_update_schedule(cloud_event):
    return batch_scheduler_function(cloud_event)

