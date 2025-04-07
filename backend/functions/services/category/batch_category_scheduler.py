import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
from typing import List, Dict, Any, Optional
import base64
from core.db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from core.config import initialize_config, get_environment, get_db_config
from core.pubsub_utils import publish_message
from google.cloud import scheduler_v1
from google.api_core.exceptions import NotFound

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv('PROJECT_ID', 'tiktok-analytics-prod-451609')
LOCATION = 'asia-northeast1'
SCHEDULER_CLIENT = scheduler_v1.CloudSchedulerClient()

def manage_category_update_schedule(event, context):
    """
    Pub/Subからのメッセージを受け取り、update-all-categories関数のスケジュールを管理する
    """
    try:
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message_json = json.loads(message_data)
            status = message_json.get("status")
            
            logger.info(f"ステータス更新を受信: {status}")
            
            if status == "in_progress":
                # バッチ処理進行中 - 5分後のスケジュールを設定
                enable_delayed_schedule()
                return {"status": "success", "action": "delayed_schedule_enabled"}
                
            elif status == "completed":
                # 全ての処理が完了 - スケジュールを削除
                disable_delayed_schedule()
                return {"status": "success", "action": "schedule_disabled"}
        
        return {"status": "error", "message": "Invalid message format"}
        
    except Exception as e:
        logger.error(f"スケジュール管理中にエラーが発生: {str(e)}")
        return {"status": "error", "error": str(e)}

def enable_delayed_schedule():
    """5分後に実行するスケジュールを有効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/category-update-delayed"
    
    try:
        SCHEDULER_CLIENT.get_job(name=job_name)
        logger.info("5分後実行のスケジュールは既に存在します")
        
    except NotFound:
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        # 現在時刻から5分後を計算
        next_run = datetime.now() + timedelta(hours=9, minutes=5)
        
        job = {
            "name": job_name,
            "description": "Category update delayed schedule (5min)",
            "schedule": f"{next_run.minute} {next_run.hour} {next_run.day} {next_run.month} *",
            "time_zone": "Asia/Tokyo",
            "http_target": {
                "uri": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/update-all-categories",
                "http_method": scheduler_v1.HttpMethod.POST,
                "oidc_token": {
                    "service_account_email": f"cloudbuild@{PROJECT_ID}.iam.gserviceaccount.com",
                    "audience": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/update-all-categories"
                }
            },
            "attempt_deadline": "320s"
        }
        
        SCHEDULER_CLIENT.create_job(parent=parent, job=job)
        logger.info(f"5分後実行のスケジュールを作成しました: {next_run.isoformat()}")

def disable_delayed_schedule():
    """スケジュールを無効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/category-update-delayed"
    
    try:
        SCHEDULER_CLIENT.get_job(name=job_name)
        SCHEDULER_CLIENT.delete_job(name=job_name)
        logger.info("5分後実行のスケジュールを削除しました")
        
    except NotFound:
        logger.info("5分後実行のスケジュールは既に削除されています") 