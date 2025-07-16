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

def manage_corporate_update_schedule(event, context):
    """
    Pub/Subからのメッセージを受け取り、frontend-corporate-update関数のスケジュールを管理する
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
            
            logger.info(f"企業アカウントステータス更新を受信: {status}")
            
            if status == "in_progress":
                # 企業アカウントバッチ処理進行中 - 10分間隔のスケジュールを有効にする
                enable_corporate_frequent_schedule()
                return {"status": "success", "action": "corporate_frequent_schedule_enabled"}
                
            elif status == "completed":
                # 企業アカウントバッチ処理完了 - 10分間隔のスケジュールを無効にする
                disable_corporate_frequent_schedule()
                return {"status": "success", "action": "corporate_frequent_schedule_disabled"}
        
        return {"status": "error", "message": "Invalid corporate message format"}
        
    except Exception as e:
        logger.error(f"企業アカウントスケジュール管理中にエラーが発生: {str(e)}")
        return {"status": "error", "error": str(e)}

def enable_corporate_frequent_schedule():
    """企業アカウント用10分間隔のスケジュールを有効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/frontend-corporate-update-frequent"
    
    try:
        # スケジュールが存在するか確認
        SCHEDULER_CLIENT.get_job(name=job_name)
        logger.info("企業アカウント10分間隔のスケジュールは既に存在します")
        
    except NotFound:
        # スケジュールが存在しない場合は作成
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        # PubSubターゲット
        job = {
            "name": job_name,
            "description": "Frontend corporate update frequent schedule (10min)",
            "schedule": "*/10 * * * *",
            "time_zone": "Asia/Tokyo",
            "pubsub_target": {
                "topic_name": f"projects/{PROJECT_ID}/topics/frontend-corporate-trigger",
                "data": base64.b64encode(json.dumps({
                    "status": "start",
                    "message": "frontend_corporate_data_updateの実行を開始します",
                    "timestamp": datetime.now().isoformat()
                }).encode()).decode()
            }
        }
        
        SCHEDULER_CLIENT.create_job(parent=parent, job=job)
        logger.info("企業アカウント10分間隔のスケジュールを作成しました")

def disable_corporate_frequent_schedule():
    """企業アカウント用10分間隔のスケジュールを無効にする"""
    job_name = f"projects/{PROJECT_ID}/locations/{LOCATION}/jobs/frontend-corporate-update-frequent"
    
    try:
        # スケジュールが存在するか確認してから削除
        SCHEDULER_CLIENT.get_job(name=job_name)
        SCHEDULER_CLIENT.delete_job(name=job_name)
        logger.info("企業アカウント10分間隔のスケジュールを削除しました")
        
    except NotFound:
        logger.info("企業アカウント10分間隔のスケジュールは既に削除されています")

if __name__ == "__main__":
    # ローカルテスト用
    test_event = {
        'data': base64.b64encode(json.dumps({
            "status": "in_progress",
            "message": "テストメッセージ",
            "timestamp": datetime.now().isoformat()
        }).encode()).decode()
    }
    
    result = manage_corporate_update_schedule(test_event, None)
    print("企業アカウントテスト結果:", result) 