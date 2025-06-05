import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def sync_video_history(event, context):
    """
    video_masterの情報をvideo_view_historyに同期し、10日間の集計を更新する
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== 動画履歴同期処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
        else:
            logger.info("データなしのトリガー実行")
            message_data = {}
        
        # 完了ステータスのメッセージかどうかを確認
        if message_data.get("status") != "completed":
            logger.info(f"処理完了以外のステータスのため、同期をスキップします: {message_data.get('status')}")
            return {"status": "skipped", "reason": "Not a completion message"}
        
        # 集計日（現在日付の前日）- UTC+9で計算
        jst = timezone('Asia/Tokyo')
        print(f"現在の時刻は {datetime.now(jst)}")
        print(f"現在jstの時刻は {datetime.now(jst)}")
        collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
        
        # 履歴データの同期クエリを更新
        sync_query = """
        INSERT INTO play_count_history 
        (video_id, video_url, collection_date, 
         play_count, likes_count, comment_count, save_count,
         play_count_increase, likes_count_increase, 
         comment_count_increase, save_count_increase)
        SELECT 
            video_id,
            url,
            %s as collection_date,
            play_count,
            likes_count,
            comment_count,
            save_count,
            play_count_increase,
            likes_count_increase,
            comment_count_increase,
            save_count_increase
        FROM 
            frontend_data
        WHERE 
            video_id IS NOT NULL
            AND play_count_increase IS NOT NULL
        ON DUPLICATE KEY UPDATE
            play_count = VALUES(play_count),
            likes_count = VALUES(likes_count),
            comment_count = VALUES(comment_count),
            save_count = VALUES(save_count),
            play_count_increase = VALUES(play_count_increase),
            likes_count_increase = VALUES(likes_count_increase),
            comment_count_increase = VALUES(comment_count_increase),
            save_count_increase = VALUES(save_count_increase)
        """
        
        # クエリを実行
        execute_write_query(sync_query, (collection_date,))
        
        logger.info(f"動画履歴の同期が完了しました。収集日: {collection_date}")

        # 10日間の集計を更新 (各動画IDごとに最新5件のデータを使用)
        update_ten_days_metrics_query = """
        UPDATE frontend_data fd
        SET 
            ten_days_increase = CASE 
                WHEN fd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fd.play_count
                ELSE LEAST(fd.play_count, (
                    SELECT COALESCE(SUM(play_count_increase), 0)
                    FROM (
                        SELECT play_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fd.video_id
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_likes_increase = CASE 
                WHEN fd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fd.likes_count
                ELSE LEAST(fd.likes_count, (
                    SELECT COALESCE(SUM(likes_count_increase), 0)
                    FROM (
                        SELECT likes_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fd.video_id
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_comment_increase = CASE 
                WHEN fd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fd.comment_count
                ELSE LEAST(fd.comment_count, (
                    SELECT COALESCE(SUM(comment_count_increase), 0)
                    FROM (
                        SELECT comment_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fd.video_id
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_save_increase = CASE 
                WHEN fd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fd.save_count
                ELSE LEAST(fd.save_count, (
                    SELECT COALESCE(SUM(save_count_increase), 0)
                    FROM (
                        SELECT save_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fd.video_id
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END
        """
        
        # 10日間の集計クエリを実行
        execute_write_query(update_ten_days_metrics_query)
        
        logger.info("10日間の指標の更新が完了しました")

        # 次の処理（summary_table_sync）にメッセージを送信
        logger.info("商品日次集計処理のトリガーメッセージを送信します")
        publish_message("summary-table-sync", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "video_history_sync",
            "message": "動画履歴同期が完了しました。商品日次集計処理を開始します。"
        })

        return {
            "status": "success",
            "message": "動画履歴の同期が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"同期処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 動画履歴同期処理の終了 ====") 