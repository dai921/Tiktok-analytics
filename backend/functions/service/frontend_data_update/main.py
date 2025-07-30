from dotenv import load_dotenv
from core.config import initialize_config

# 各モジュールからエントリーポイント関数をインポート

# データ同期関連
from services.frontend_data_update import process_pubsub_message as frontend_update_job
from services.frontend_affiliate_data_update import process_pubsub_message as frontend_affiliate_update_job
from services.frontend_corporate_data_update import process_pubsub_message as frontend_corporate_update_job
from services.frontend_influencer_data_update import process_pubsub_message as frontend_influencer_update_job



# スケジューラー関連
from services.batch_scheduler import manage_frontend_update_schedule as batch_scheduler_function
from services.batch_scheduler_affiliate import manage_affiliate_update_schedule as frontend_affiliate_update_schedule
from services.batch_scheduler_corporate import manage_corporate_update_schedule as frontend_corporate_update_schedule
from services.batch_scheduler_influencer import manage_influencer_update_schedule as frontend_influencer_update_schedule
from services.frontend_data_trigger import trigger_frontend_data_update  as frontend_update_trigger_function


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

# batch_scheduler用のエントリーポイント関数を追加
def manage_frontend_update_schedule(event,context):
    return batch_scheduler_function(event,context)

def manage_frontend_affiliate_update_schedule(event,context):
    return frontend_affiliate_update_schedule(event,context)

def manage_frontend_corporate_update_schedule(event,context):
    return frontend_corporate_update_schedule(event,context)

def manage_frontend_influencer_update_schedule(event,context):
    return frontend_influencer_update_schedule(event,context)