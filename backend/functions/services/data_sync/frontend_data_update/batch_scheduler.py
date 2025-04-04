import os
import json
import logging
from datetime import datetime
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
LOCATION = 'asia-northeast1'    # リージョンを設定
SCHEDULER_CLIENT = scheduler_v1.CloudSchedulerClient()

def manage_frontend_update_schedule(event,context):
    """
    Pub/Subからのメッセージを受け取り、frontend-update関数のスケジュールを管理する
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    Returns:
        dict: 処理結果
    """
    try:
        # メッセージデータの取得
        message = None
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            message_json = json.loads(message_data)
            status = message_json.get("status")
            
            logger.info(f"ステータス更新を受信: {status}")
            
            if status == "in_progress":
                # バッチ処理進行中 - 10分間隔のスケジュールを有効にする
                enable_frequent_schedule()
                return {"status": "success", "action": "frequent_schedule_enabled"}
                
            elif status == "completed":
                # バッチ処理完了 - 10分間隔のスケジュールを無効にする
                disable_frequent_schedule()
                return {"status": "success", "action": "frequent_schedule_disabled"}
        
        return {"status": "error", "message": "Invalid message format"}
        
    except Exception as e:
        logger.error(f"スケジュール管理中にエラーが発生: {str(e)}")
        return {"status": "error", "error": str(e)}

def enable_frequent_schedule():
    """10分間隔のスケジュールを有効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/frontend-update-frequent"
    
    try:
        # スケジュールが存在するか確認
        SCHEDULER_CLIENT.get_job(name=job_name)
        logger.info("10分間隔のスケジュールは既に存在します")
        
    except NotFound:
        # スケジュールが存在しない場合は作成
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        job = {
            "name": job_name,
            "description": "Frontend update frequent schedule (10min)",
            "schedule": "*/10 * * * *",
            "time_zone": "Asia/Tokyo",
            "http_target": {
                "uri": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/frontend-update",
                "http_method": scheduler_v1.HttpMethod.POST,
                "oidc_token": {
                    "service_account_email": "cloudbuild@tiktok-analytics-prod-451609.iam.gserviceaccount.com",
                    "audience": f"https://{LOCATION}-{PROJECT_ID}.cloudfunctions.net/frontend-update"
                }
            },
        }
        
        SCHEDULER_CLIENT.create_job(parent=parent, job=job)
        logger.info("10分間隔のスケジュールを作成しました")

def disable_frequent_schedule():
    """10分間隔のスケジュールを無効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/frontend-update-frequent"
    
    try:
        # スケジュールが存在するか確認してから削除
        SCHEDULER_CLIENT.get_job(name=job_name)
        SCHEDULER_CLIENT.delete_job(name=job_name)
        logger.info("10分間隔のスケジュールを削除しました")
        
    except NotFound:
        logger.info("10分間隔のスケジュールは既に削除されています") 