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

def manage_video_collector_schedule(event, context):
    """
    Pub/Subからのメッセージを受け取り、video-collector関数のスケジュールを管理する
    """
    try:
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message_json = json.loads(message_data)
            
            # アクションを取得
            action = message_json.get("action")
            processor_name = message_json.get("processor_name")
            
            logger.info(f"アクションを受信: {action}, プロセッサー: {processor_name}")
            
            # video_collectorプロセッサーのみ処理
            if processor_name != "video_collector":
                logger.info(f"video_collector以外のプロセッサー: {processor_name}は無視します")
                return {"status": "success", "message": f"無視されたプロセッサー: {processor_name}"}
            
            if action == "start_batch_controller":
                # バッチコントローラー起動 - 3分後のスケジュールを設定
                enable_delayed_schedule()
                return {"status": "success", "action": "delayed_schedule_enabled"}
                
            elif action == "stop_scheduler":
                # スケジューラー停止 - スケジュールを削除
                disable_delayed_schedule()
                return {"status": "success", "action": "schedule_disabled"}
            else:
                logger.warning(f"未知のアクション: {action}")
                return {"status": "error", "message": f"未知のアクション: {action}"}
        
        return {"status": "error", "message": "Invalid message format"}
        
    except Exception as e:
        logger.error(f"スケジュール管理中にエラーが発生: {str(e)}")
        return {"status": "error", "error": str(e)}

def enable_delayed_schedule():
    """3分後に実行するスケジュールを有効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/video-collector-delayed"
    
    try:
        SCHEDULER_CLIENT.get_job(name=job_name)
        logger.info("3分後実行のスケジュールは既に存在します")
        
    except NotFound:
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        # 現在時刻から3分後を計算
        next_run = datetime.now() + timedelta(minutes=3)
        
        job = {
            "name": job_name,
            "description": "Video collector delayed schedule (3min)",
            "schedule": f"{next_run.minute} {next_run.hour} {next_run.day} {next_run.month} *",
            "time_zone": "Asia/Tokyo",
            "http_target": {
                "uri": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/video-collector",
                "http_method": scheduler_v1.HttpMethod.POST,
                "oidc_token": {
                    "service_account_email": f"cloudbuild@{PROJECT_ID}.iam.gserviceaccount.com",
                    "audience": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/video-collector"
                }
            },
            "attempt_deadline": "320s"  # タイムアウト設定
        }
        
        SCHEDULER_CLIENT.create_job(parent=parent, job=job)
        logger.info(f"3分後実行のスケジュールを作成しました: {next_run.isoformat()}")

def disable_delayed_schedule():
    """スケジュールを無効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/video-collector-delayed"
    
    try:
        SCHEDULER_CLIENT.get_job(name=job_name)
        SCHEDULER_CLIENT.delete_job(name=job_name)
        logger.info("3分後実行のスケジュールを削除しました")
        
    except NotFound:
        logger.info("3分後実行のスケジュールは既に削除されています") 