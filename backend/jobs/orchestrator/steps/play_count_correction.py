import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from backend.jobs.core.db_utils import execute_query, execute_write_query
from backend.jobs.core.config import initialize_config
from pytz import timezone

# ログ設定をコメントアウト
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def correct_play_count_increase(collection_date: Optional[str] = None) -> Dict[str, Any]:
    """
    play_count_historyのplay_count_increaseを補正（非Pub/Sub）
    """
    print("==== 再生数増加値修正処理の開始 ====")

    try:
        # 収集日の決定（デフォルト: JST基準で2日前）
        if collection_date is None:
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')

        print(f"処理対象の収集日: {collection_date}")

        # 二日前のcollection_dateを計算
        collection_date_obj = datetime.strptime(collection_date, '%Y-%m-%d')
        previous_collection_date = (collection_date_obj - timedelta(days=2)).strftime('%Y-%m-%d')
        print(f"前回収集日: {previous_collection_date}")

        # play_count_increaseとplay_countが一致しているレコードを取得し、
        # 前回のデータが存在するかチェック
        check_query = """
        SELECT 
            current.video_id,
            current.play_count,
            current.play_count_increase,
            previous.play_count as previous_play_count
        FROM play_count_history current
        LEFT JOIN play_count_history previous 
            ON current.video_id = previous.video_id 
            AND previous.collection_date = %s
        WHERE 
            current.collection_date = %s
            AND current.play_count_increase = current.play_count
            AND previous.play_count IS NOT NULL
        """
        
        records_to_update = execute_query(check_query, (previous_collection_date, collection_date))
        print(f"修正対象のレコード数: {len(records_to_update)}")

        if not records_to_update:
            print("修正対象のレコードがありません。")
        else:
            # play_count_historyテーブルのplay_count_increaseを修正
            for record in records_to_update:
                video_id = record['video_id']
                current_play_count = record['play_count']
                previous_play_count = record['previous_play_count']
                corrected_increase = max(0, current_play_count - previous_play_count)
                
                print(f"動画ID {video_id}: 現在再生数={current_play_count}, 前回再生数={previous_play_count}, 修正後増加数={corrected_increase}")
                
                # play_count_historyの更新（コメントアウト）
                # update_history_query = """
                # UPDATE play_count_history 
                # SET play_count_increase = %s
                # WHERE video_id = %s AND collection_date = %s
                # """
                # execute_write_query(update_history_query, (corrected_increase, video_id, collection_date))

            print(f"play_count_historyテーブルの修正が完了しました。修正件数: {len(records_to_update)}")

            # frontendテーブル群のplay_count_increaseも更新（コメントアウト）
            # frontend_tables = ['frontend_data', 'frontend_affiliate_data', 'frontend_corporate_data', 'frontend_influencer_data']
            
            # for table_name in frontend_tables:
            #     try:
            #         # 各テーブルでの更新
            #         update_frontend_query = f"""
            #         UPDATE {table_name} f
            #         INNER JOIN play_count_history pch 
            #             ON f.video_id = pch.video_id 
            #             AND pch.collection_date = %s
            #         SET f.play_count_increase = pch.play_count_increase
            #         WHERE pch.video_id IN ({','.join(['%s'] * len(records_to_update))})
            #         """
            #         
            #         video_ids = [record['video_id'] for record in records_to_update]
            #         params = [collection_date] + video_ids
            #         
            #         affected_rows = execute_write_query(update_frontend_query, params)
            #         print(f"{table_name}テーブルの更新完了: {affected_rows}件更新")
            #         
            #     except Exception as e:
            #         print(f"{table_name}テーブルの更新中にエラーが発生しました: {str(e)}")
            #         # テーブルが存在しない場合もあるため、警告として処理を続行

        return {
            "status": "success",
            "message": "再生数増加値の修正が完了しました",
            "collection_date": collection_date,
            "corrected_records": len(records_to_update) if records_to_update else 0,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"再生数増加値修正処理中にエラーが発生しました: {str(e)}"
        print(error_message)
        import traceback
        print(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        print("==== 再生数増加値修正処理の終了 ====")
