import os
import logging
from datetime import datetime
import functions_framework
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message

# ログ設定は不要になるので削除または無効化できます
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def check_execution_time() -> bool:
    """
    前回の実行時刻をチェックし、36時間以上経過しているか確認する
    Returns:
        bool: 実行可能な場合はTrue、そうでない場合はFalse
    """
    try:
        query = """
            SELECT last_run 
            FROM scheduler_job_info 
            WHERE job_name = 'frontend_data_update'
        """
        result = execute_query(query)
        
        if not result:
            # 初回実行の場合、レコードを作成して実行可能とする
            insert_query = """
                INSERT INTO scheduler_job_info (job_name, last_run)
                VALUES ('frontend_data_update', NOW())
            """
            execute_write_query(insert_query)
            print("初回実行のため、実行を許可します")
            return True
        
        last_run = result[0]['last_run']
        current_time = datetime.now()
        time_diff = current_time - last_run
        
        # 36時間以上経過しているかチェック
        if time_diff.total_seconds() >= 36 * 3600:
            # last_runを更新
            update_query = """
                UPDATE scheduler_job_info 
                SET last_run = NOW()
                WHERE job_name = 'frontend_data_update'
            """
            execute_write_query(update_query)
            print(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間経過しているため、実行を許可します")
            return True
        else:
            print(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間しか経過していないため、実行をスキップします")
            return False
            
    except Exception as e:
        print(f"実行時間チェックでエラーが発生しました: {str(e)}")
        return False  # エラーの場合は安全のため実行を拒否

@functions_framework.http
def trigger_frontend_data_update(request):
    """
    36時間チェックを行い、条件を満たした場合にPub/Subでfrontend_data_updateを起動する
    """
    start_time = datetime.now()
    print(f"Frontend Data Update トリガー処理開始: {start_time}")

    try:
        # 実行可能かチェック
        if check_execution_time():
            # Pub/Subでfrontend_data_update実行のトリガーを送信
            publish_message("frontend-data-update-trigger", {
                "status": "start",
                "message": "frontend_data_updateの実行を開始します",
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "status": "triggered",
                "message": "Frontend Data Updateの実行をトリガーしました",
                "execution_time": datetime.now().isoformat()
            }, 200
        else:
            return {
                "status": "skipped",
                "message": "前回の実行から36時間経過していないため、処理をスキップします",
                "execution_time": datetime.now().isoformat()
            }, 200
            
    except Exception as e:
        error_message = f"トリガー処理中に予期せぬエラーが発生: {str(e)}"
        print(error_message)
        return {
            "status": "error",
            "message": error_message,
            "execution_time": datetime.now().isoformat()
        }, 500

if __name__ == "__main__":
    # ローカルテスト用
    try:
        if check_execution_time():
            print("条件を満たしたため、frontend_data_updateの実行をトリガーします")
        else:
            print("条件を満たさないため、frontend_data_updateの実行をスキップします")
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
