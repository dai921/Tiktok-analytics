
## 主な特徴：

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

def update_all_trends_summary(event, context):
    """
    ハッシュタグとBGMの日次集計処理を実行する
    上位150個を取得してサマリーテーブルとTOP150動画テーブルを更新する
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== ハッシュタグ・BGM日次集計処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            
            # 前の処理からの完了メッセージを確認
            if message_data.get("status") != "success":
                logger.info(f"前の処理が成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            # 収集日を取得
            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")
        
        # ハッシュタグとBGMの集計を実行
        update_hashtags_summary(collection_date)
        update_sound_summary(collection_date)
        
        logger.info(f"ハッシュタグ・BGM日次集計が完了しました。収集日: {collection_date}")
        
        # 次の処理にメッセージを送信（必要に応じて）
        logger.info("全体のトレンド集計処理が完了しました")
        
        return {
            "status": "success",
            "message": "ハッシュタグ・BGM日次集計が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"ハッシュタグ・BGM日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== ハッシュタグ・BGM日次集計処理の終了 ====")

def update_hashtags_summary(collection_date):
    """
    ハッシュタグの日次集計処理
    上位150個のハッシュタグのサマリーとTOP150動画を更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== ハッシュタグ日次集計処理の開始 ====")
    
    try:
        # 既存データを削除
        logger.info("既存のハッシュタグデータを削除しています...")
        delete_hashtags_query = """
        DELETE FROM hashtags_daily_summary WHERE fetch_date = %s
        """
        execute_write_query(delete_hashtags_query, (collection_date,))
        
        delete_hashtags_videos_query = """
        DELETE FROM hashtags_daily_top150_videos WHERE fetch_date = %s
        """
        execute_write_query(delete_hashtags_videos_query, (collection_date,))
        
        # ハッシュタグサマリーの集計（上位150個）
        hashtags_summary_query = """
        INSERT INTO hashtags_daily_summary 
        (fetch_date, hashtags, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            hashtag,
            COALESCE(SUM(pch.play_count_increase), 0) as plays_increase,
            COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as over_100k,
            COUNT(DISTINCT CASE 
                WHEN fd.created_at BETWEEN DATE_SUB(%s, INTERVAL 1 DAY) AND %s 
                THEN fd.video_id 
                ELSE NULL 
            END) as post_count
        FROM (
            SELECT 
                fd.video_id,
                TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.hashtags, ',', numbers.n), ',', -1)) AS hashtag
            FROM frontend_data fd
            CROSS JOIN (
                SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL 
                SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL 
                SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
            ) numbers
            WHERE fd.hashtags IS NOT NULL 
            AND fd.hashtags != ''
            AND numbers.n <= 1 + LENGTH(fd.hashtags) - LENGTH(REPLACE(fd.hashtags, ',', ''))
        ) hashtag_split
        JOIN frontend_data fd ON hashtag_split.video_id = fd.video_id
        JOIN play_count_history pch ON fd.video_id = pch.video_id
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
            AND hashtag != ''
        GROUP BY hashtag
        ORDER BY post_count DESC
        LIMIT 150
        """
        
        execute_write_query(hashtags_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        # ハッシュタグTOP150動画の集計
        hashtags_videos_query = """
        INSERT INTO hashtags_daily_top150_videos 
        (video_id, fetch_date, hashtags, plays_increase, likes_increase, post_time, thumbnail_url)
        SELECT 
            hashtag_data.video_id,
            %s as fetch_date,
            hashtag_data.hashtag as hashtags,
            pch.play_count_increase as plays_increase,
            COALESCE(pch.likes_count_increase, 0) as likes_increase,
            fd.created_at as post_time,
            fd.thumbnail_url
        FROM (
            SELECT DISTINCT
                hs.hashtags as hashtag,
                hashtag_split.video_id,
                ROW_NUMBER() OVER (PARTITION BY hs.hashtags ORDER BY pch2.play_count_increase DESC) as rank_num
            FROM hashtags_daily_summary hs
            JOIN (
                SELECT 
                    fd.video_id,
                    TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.hashtags, ',', numbers.n), ',', -1)) AS hashtag
                FROM frontend_data fd
                CROSS JOIN (
                    SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL 
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL 
                    SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
                ) numbers
                WHERE fd.hashtags IS NOT NULL 
                AND fd.hashtags != ''
                AND numbers.n <= 1 + LENGTH(fd.hashtags) - LENGTH(REPLACE(fd.hashtags, ',', ''))
            ) hashtag_split ON hs.hashtags = hashtag_split.hashtag
            JOIN play_count_history pch2 ON hashtag_split.video_id = pch2.video_id
            WHERE hs.fetch_date = %s
            AND pch2.collection_date = %s
        ) hashtag_data
        JOIN frontend_data fd ON hashtag_data.video_id = fd.video_id
        JOIN play_count_history pch ON fd.video_id = pch.video_id
        WHERE pch.collection_date = %s
        AND hashtag_data.rank_num <= 150
        """
        
        execute_write_query(hashtags_videos_query, (collection_date, collection_date, collection_date, collection_date))
        
        logger.info(f"ハッシュタグ日次集計が完了しました。収集日: {collection_date}")
        
    except Exception as e:
        error_message = f"ハッシュタグ日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== ハッシュタグ日次集計処理の終了 ====")

def update_sound_summary(collection_date):
    """
    BGM（サウンド）の日次集計処理
    上位150個のBGMのサマリーとTOP150動画を更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== BGM日次集計処理の開始 ====")
    
    try:
        # 既存データを削除
        logger.info("既存のBGMデータを削除しています...")
        delete_sound_query = """
        DELETE FROM sound_daily_summary_top150 WHERE fetch_date = %s
        """
        execute_write_query(delete_sound_query, (collection_date,))
        
        delete_sound_videos_query = """
        DELETE FROM sound_daily_top150_videos WHERE fetch_date = %s
        """
        execute_write_query(delete_sound_videos_query, (collection_date,))
        
        # BGMサマリーの集計（上位150個）
        sound_summary_query = """
        INSERT INTO sound_daily_summary_top150 
        (fetch_date, sound_name, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            CASE 
                WHEN fd.music_info LIKE 'オリジナル楽曲%%' THEN 'オリジナル楽曲'
                ELSE fd.music_info
            END as sound_name,
            COALESCE(SUM(pch.play_count_increase), 0) as plays_increase,
            COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as over_100k,
            COUNT(DISTINCT CASE 
                WHEN fd.created_at BETWEEN DATE_SUB(%s, INTERVAL 1 DAY) AND %s 
                THEN fd.video_id 
                ELSE NULL 
            END) as post_count
        FROM 
            play_count_history pch
        JOIN 
            frontend_data fd ON pch.video_id = fd.video_id
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
            AND fd.music_info IS NOT NULL
            AND fd.music_info != ''
        GROUP BY 
            CASE 
                WHEN fd.music_info LIKE 'オリジナル楽曲%%' THEN 'オリジナル楽曲'
                ELSE fd.music_info
            END
        ORDER BY post_count DESC
        LIMIT 150
        """
        
        execute_write_query(sound_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        # BGMTOP150動画の集計
        sound_videos_query = """
        INSERT INTO sound_daily_top150_videos 
        (video_id, fetch_date, sound_name, plays_increase, likes_increase, post_time, thumbnail_url)
        SELECT 
            sound_data.video_id,
            %s as fetch_date,
            sound_data.sound_name,
            pch.play_count_increase as plays_increase,
            COALESCE(pch.likes_count_increase, 0) as likes_increase,
            fd.created_at as post_time,
            COALESCE(fd.thumbnail_url, '') as thumbnail_url
        FROM (
            SELECT DISTINCT
                sds.sound_name,
                fd2.video_id,
                ROW_NUMBER() OVER (PARTITION BY sds.sound_name ORDER BY pch2.play_count_increase DESC) as rank_num
            FROM sound_daily_summary_top150 sds
            JOIN frontend_data fd2 ON (
                (sds.sound_name = 'オリジナル楽曲' AND fd2.music_info LIKE 'オリジナル楽曲%%')
                OR
                (sds.sound_name != 'オリジナル楽曲' AND fd2.music_info = sds.sound_name)
            )
            JOIN play_count_history pch2 ON fd2.video_id = pch2.video_id
            WHERE sds.fetch_date = %s
            AND pch2.collection_date = %s
        ) sound_data
        JOIN frontend_data fd ON sound_data.video_id = fd.video_id
        JOIN play_count_history pch ON fd.video_id = pch.video_id
        WHERE pch.collection_date = %s
        AND sound_data.rank_num <= 150
        """
        
        execute_write_query(sound_videos_query, (collection_date, collection_date, collection_date, collection_date))
        
        logger.info(f"BGM日次集計が完了しました。収集日: {collection_date}")
        
    except Exception as e:
        error_message = f"BGM日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== BGM日次集計処理の終了 ====")
