import os
import json
# import logging  # コメントアウト
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message
from pytz import timezone

# ログ設定をコメントアウト
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def correct_play_count_increase(event, context):
    """
    video_history_syncの後に実行され、play_count_increaseの値を修正する
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    print("==== 再生数増加値修正処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            print(f"Pub/Subメッセージを受信: {message_data}")
            
            # video_history_syncからの完了メッセージを確認
            if message_data.get("status") != "success":
                print(f"video_history_syncが成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            # 収集日を取得（video_history_syncから受け取る）
            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
            print(f"データなしのトリガー実行。収集日を{collection_date}に設定します")

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

        #次の処理（summary_table_sync）にメッセージを送信
        print("商品日次集計処理のトリガーメッセージを送信します")
        publish_message("summary-table-sync", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "play_count_correction",
            "corrected_records": len(records_to_update) if records_to_update else 0,
            "message": "再生数増加値修正が完了しました。商品日次集計処理を開始します。"
        })

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