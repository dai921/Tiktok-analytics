import os
import logging
from datetime import datetime
from backend.jobs.core.db_utils import execute_query, execute_write_query
from backend.jobs.core.config import initialize_config

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
        if time_diff.total_seconds() >= 30 * 3600:
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

def should_run() -> bool:
    """
    Cloud Run Jobのオーケストレータから呼ばれる想定のガード関数。
    実行間隔を満たす場合 True を返す。
    """
    return check_execution_time()
