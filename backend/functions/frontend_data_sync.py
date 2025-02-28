from db_sync.frontend_data_updater import FrontendDataUpdater
import functions_framework
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

@functions_framework.http
def update_frontend_data(request):
    """
    video_masterからfrontend_dataを更新するCloud Function
    Returns:
        tuple: (JSON response, HTTP status code)
    """
    start_time = datetime.now()
    logger.info(f"同期処理開始: {start_time}")

    try:
        updater = FrontendDataUpdater()
        result = updater.update_frontend_from_master()
        
        execution_time = (datetime.now() - start_time).total_seconds()
        result["execution_time_seconds"] = execution_time
        
        logger.info(f"同期処理完了: {result}")
        return json.dumps(result), 200 if result["status"] == "success" else 500
        
    except Exception as e:
        error_message = f"予期せぬエラーが発生: {str(e)}"
        logger.error(error_message)
        return json.dumps({
            "status": "error",
            "error": error_message,
            "execution_time": datetime.now().isoformat()
        }), 500