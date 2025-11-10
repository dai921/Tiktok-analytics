import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def update_ten_days_metrics(event, context):
    """
    video_history_sync の後に実行し、10日間の指標を各テーブルに更新する
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== 10日間指標更新処理の開始 ====")

    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")

            if message_data.get("status") != "success":
                logger.info(f"前段処理が成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}

            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用（既存ロジックと整合）
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")

        logger.info(f"処理対象の収集日: {collection_date}")

        # 1. frontend_data テーブルの更新
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
        execute_write_query(update_ten_days_metrics_query)
        logger.info("frontend_dataテーブルの10日間の指標の更新が完了しました")

        # 2. アフィリエイトテーブル（parent_account_type='アフィ'）の更新
        update_affiliate_ten_days_metrics_query = """
        UPDATE frontend_affiliate_data fad
        SET 
            ten_days_increase = CASE 
                WHEN fad.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fad.play_count
                ELSE LEAST(fad.play_count, (
                    SELECT COALESCE(SUM(play_count_increase), 0)
                    FROM (
                        SELECT play_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fad.video_id
                          AND pch.parent_account_type = 'アフィ'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_likes_increase = CASE 
                WHEN fad.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fad.likes_count
                ELSE LEAST(fad.likes_count, (
                    SELECT COALESCE(SUM(likes_count_increase), 0)
                    FROM (
                        SELECT likes_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fad.video_id
                          AND pch.parent_account_type = 'アフィ'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_comment_increase = CASE 
                WHEN fad.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fad.comment_count
                ELSE LEAST(fad.comment_count, (
                    SELECT COALESCE(SUM(comment_count_increase), 0)
                    FROM (
                        SELECT comment_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fad.video_id
                          AND pch.parent_account_type = 'アフィ'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_save_increase = CASE 
                WHEN fad.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fad.save_count
                ELSE LEAST(fad.save_count, (
                    SELECT COALESCE(SUM(save_count_increase), 0)
                    FROM (
                        SELECT save_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fad.video_id
                          AND pch.parent_account_type = 'アフィ'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END
        WHERE fad.parent_account_type = 'アフィ'
        """
        execute_write_query(update_affiliate_ten_days_metrics_query)
        logger.info("frontend_affiliate_dataテーブルの10日間の指標の更新が完了しました")

        # 3. 企業アカウントテーブル（parent_account_type='企業アカウント'）の更新
        update_corporate_ten_days_metrics_query = """
        UPDATE frontend_corporate_data fcd
        SET 
            ten_days_increase = CASE 
                WHEN fcd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fcd.play_count
                ELSE LEAST(fcd.play_count, (
                    SELECT COALESCE(SUM(play_count_increase), 0)
                    FROM (
                        SELECT play_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fcd.video_id
                          AND pch.parent_account_type = '企業アカウント'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_likes_increase = CASE 
                WHEN fcd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fcd.likes_count
                ELSE LEAST(fcd.likes_count, (
                    SELECT COALESCE(SUM(likes_count_increase), 0)
                    FROM (
                        SELECT likes_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fcd.video_id
                          AND pch.parent_account_type = '企業アカウント'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_comment_increase = CASE 
                WHEN fcd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fcd.comment_count
                ELSE LEAST(fcd.comment_count, (
                    SELECT COALESCE(SUM(comment_count_increase), 0)
                    FROM (
                        SELECT comment_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fcd.video_id
                          AND pch.parent_account_type = '企業アカウント'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_save_increase = CASE 
                WHEN fcd.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fcd.save_count
                ELSE LEAST(fcd.save_count, (
                    SELECT COALESCE(SUM(save_count_increase), 0)
                    FROM (
                        SELECT save_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fcd.video_id
                          AND pch.parent_account_type = '企業アカウント'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END
        WHERE fcd.parent_account_type = '企業アカウント'
        """
        execute_write_query(update_corporate_ten_days_metrics_query)
        logger.info("frontend_corporate_dataテーブルの10日間の指標の更新が完了しました")

        # 4. インフルエンサーテーブル（parent_account_type='インフルエンサー'）の更新
        update_influencer_ten_days_metrics_query = """
        UPDATE frontend_influencer_data fid
        SET 
            ten_days_increase = CASE 
                WHEN fid.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fid.play_count
                ELSE LEAST(fid.play_count, (
                    SELECT COALESCE(SUM(play_count_increase), 0)
                    FROM (
                        SELECT play_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fid.video_id
                          AND pch.parent_account_type = 'インフルエンサー'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_likes_increase = CASE 
                WHEN fid.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fid.likes_count
                ELSE LEAST(fid.likes_count, (
                    SELECT COALESCE(SUM(likes_count_increase), 0)
                    FROM (
                        SELECT likes_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fid.video_id
                          AND pch.parent_account_type = 'インフルエンサー'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_comment_increase = CASE 
                WHEN fid.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fid.comment_count
                ELSE LEAST(fid.comment_count, (
                    SELECT COALESCE(SUM(comment_count_increase), 0)
                    FROM (
                        SELECT comment_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fid.video_id
                          AND pch.parent_account_type = 'インフルエンサー'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END,
            ten_days_save_increase = CASE 
                WHEN fid.created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY) THEN fid.save_count
                ELSE LEAST(fid.save_count, (
                    SELECT COALESCE(SUM(save_count_increase), 0)
                    FROM (
                        SELECT save_count_increase
                        FROM play_count_history pch
                        WHERE pch.video_id = fid.video_id
                          AND pch.parent_account_type = 'インフルエンサー'
                        ORDER BY collection_date DESC
                        LIMIT 5
                    ) AS recent_data
                ))
            END
        WHERE fid.parent_account_type = 'インフルエンサー'
        """
        execute_write_query(update_influencer_ten_days_metrics_query)
        logger.info("frontend_influencer_dataテーブルの10日間の指標の更新が完了しました")

        logger.info("全テーブルの10日間の指標更新が完了しました")

        # 次の処理（play_count_correction）にメッセージを送信
        logger.info("再生数増加値修正処理のトリガーメッセージを送信します")
        publish_message("play-count-correction", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "ten_days_metrics_update",
            "message": "10日間指標更新が完了しました。再生数増加値修正処理を開始します。"
        })

        return {
            "status": "success",
            "message": "10日間の指標更新が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }

    except Exception as e:
        error_message = f"10日間指標更新処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}

    finally:
        logger.info("==== 10日間指標更新処理の終了 ====")


