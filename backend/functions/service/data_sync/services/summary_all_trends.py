
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
            
            # top100_videos_syncからの完了メッセージを確認
            if (message_data.get("status") != "success" or 
                message_data.get("previous_step") != "top100_videos_sync"):
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
        
        # 次の処理（data_integrity_check）にメッセージを送信
        logger.info("データ整合性チェック処理のトリガーメッセージを送信します")
        publish_message("data-integrity-check", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "summary_all_trends",
            "message": "ハッシュタグ・BGM日次集計が完了しました。データ整合性チェック処理を開始します。"
        })
        
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
    ハッシュタグの日次集計処理（カテゴリ別＋総合版）
    アフィ、企業、インフルエンサー、ALL の4つのカテゴリで集計
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== ハッシュタグ日次集計処理の開始 ====")
    
    try:
        # 既存データを削除
        logger.info("既存のハッシュタグデータを削除しています...")
        delete_hashtags_query = """
        DELETE FROM hashtags_daily_summary_top150 WHERE fetch_date = %s
        """
        execute_write_query(delete_hashtags_query, (collection_date,))
        
        delete_hashtags_videos_query = """
        DELETE FROM hashtags_daily_top100_videos WHERE fetch_date = %s
        """
        execute_write_query(delete_hashtags_videos_query, (collection_date,))
        
        # ハッシュタグサマリーの集計（修正版）
        hashtags_summary_query = """
        INSERT INTO hashtags_daily_summary_top150
        (fetch_date, hashtags, plays_increase, over_100k, post_count, parent_account_type)
        WITH base AS (
            SELECT
                h.hashtag,
                fd.parent_account_type,
                COALESCE(SUM(pch.play_count_increase), 0) AS plays_increase,
                COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) AS over_100k,
                COUNT(DISTINCT CASE
                    WHEN fd.created_at BETWEEN DATE_SUB(%s, INTERVAL 1 DAY) AND %s
                    THEN fd.video_id 
                    ELSE NULL
                END) AS post_count
            FROM video_hashtags h
            JOIN frontend_data fd ON fd.video_id = h.video_id
            JOIN play_count_history pch ON pch.video_id = h.video_id
            WHERE 
                pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
            GROUP BY h.hashtag, fd.parent_account_type
        ),
        cat AS (
            SELECT * FROM base
        ),
        tot AS (
            SELECT
                hashtag,
                'ALL' AS parent_account_type,
                SUM(plays_increase) AS plays_increase,
                SUM(over_100k) AS over_100k,
                SUM(post_count) AS post_count
            FROM base
            GROUP BY hashtag
        ),
        unioned AS (
            SELECT * FROM cat
            UNION ALL
            SELECT * FROM tot
        ),
        ranked AS (
            SELECT
                %s AS fetch_date,
                hashtag,
                plays_increase,
                over_100k,
                post_count,
                parent_account_type,
                ROW_NUMBER() OVER (
                    PARTITION BY parent_account_type
                    ORDER BY post_count DESC
                ) AS rn
            FROM unioned
        )
        SELECT 
            fetch_date,
            hashtag,
            plays_increase,
            over_100k,
            post_count,
            parent_account_type
        FROM ranked
        WHERE rn <= 150
        """
        
        execute_write_query(hashtags_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        # ハッシュタグリストを取得（カテゴリ別）
        hashtags_query = """
        SELECT hashtags, parent_account_type 
        FROM hashtags_daily_summary_top150  
        WHERE fetch_date = %s
        ORDER BY parent_account_type, post_count DESC
        """
        hashtags = execute_query(hashtags_query, (collection_date,))
        
        # 各ハッシュタグ＋カテゴリごとにTOP100動画を取得
        for hashtag_row in hashtags:
            hashtag = hashtag_row['hashtags']
            account_type = hashtag_row['parent_account_type']
            
            logger.info(f"ハッシュタグ '{hashtag}' ({account_type}) のTOP100動画を処理中...")
            
            # カテゴリ別のWHERE条件を設定
            if account_type == 'ALL':
                account_condition = "1=1"  # 全て対象
                params = (collection_date, hashtag, hashtag, collection_date)
            else:
                account_condition = "fd.parent_account_type = %s"
                params = (collection_date, hashtag, hashtag, collection_date, account_type)
            
            # 各ハッシュタグ＋カテゴリのTOP100動画を取得・挿入
            hashtag_videos_query = f"""
            INSERT INTO hashtags_daily_top100_videos 
            (video_id, fetch_date, hashtags, plays_increase, likes_increase, post_time, thumbnail_url, parent_account_type)
            SELECT 
                h.video_id,
                %s as fetch_date,
                %s as hashtags,
                pch.play_count_increase as plays_increase,
                COALESCE(pch.likes_count_increase, 0) as likes_increase,
                fd.created_at as post_time,
                COALESCE(fd.thumbnail_url, '') as thumbnail_url,
                '{account_type}' as parent_account_type
            FROM video_hashtags h
            JOIN frontend_data fd ON h.video_id = fd.video_id
            JOIN play_count_history pch ON fd.video_id = pch.video_id
            WHERE 
                h.hashtag = %s
                AND pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
                AND {account_condition}
            ORDER BY 
                pch.play_count_increase DESC, h.video_id DESC
            LIMIT 100
            """
            
            execute_write_query(hashtag_videos_query, params)
        
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
    BGM（サウンド）の日次集計処理（カテゴリ別+総合版）
    アフィ、企業、インフルエンサー、ALL の4つのカテゴリで集計
    
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
        DELETE FROM sound_daily_top100_videos WHERE fetch_date = %s
        """
        execute_write_query(delete_sound_videos_query, (collection_date,))
        
        # BGMサマリーの集計（カテゴリ別＋総合版）
        sound_summary_query = """
        INSERT INTO sound_daily_summary_top150
        (fetch_date, sound_name, plays_increase, over_100k, post_count, parent_account_type)
        WITH base AS (
            SELECT
                CASE 
                    WHEN fd.music_info LIKE 'オリジナル楽曲%%' THEN 'オリジナル楽曲'
                    ELSE fd.music_info
                END as sound_name,
                fd.parent_account_type,
                COALESCE(SUM(pch.play_count_increase), 0) as plays_increase,
                COUNT(CASE WHEN pch.play_count_increase >= 100000 THEN 1 END) as over_100k,
                COUNT(DISTINCT CASE 
                    WHEN fd.created_at BETWEEN DATE_SUB(%s, INTERVAL 1 DAY) AND %s 
                    THEN fd.video_id 
                    ELSE NULL 
                END) as post_count
            FROM play_count_history pch
            JOIN frontend_data fd ON pch.video_id = fd.video_id
            WHERE 
                pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
                AND fd.music_info IS NOT NULL
                AND fd.music_info != ''
            GROUP BY 
                CASE 
                    WHEN fd.music_info LIKE 'オリジナル楽曲%%' THEN 'オリジナル楽曲'
                    ELSE fd.music_info
                END,
                fd.parent_account_type
        ),
        cat AS (
            SELECT * FROM base
        ),
        tot AS (
            SELECT
                sound_name,
                'ALL' AS parent_account_type,
                SUM(plays_increase) AS plays_increase,
                SUM(over_100k) AS over_100k,
                SUM(post_count) AS post_count
            FROM base
            GROUP BY sound_name
        ),
        unioned AS (
            SELECT * FROM cat
            UNION ALL
            SELECT * FROM tot
        ),
        ranked AS (
            SELECT
                %s AS fetch_date,
                sound_name,
                plays_increase,
                over_100k,
                post_count,
                parent_account_type,
                ROW_NUMBER() OVER (
                    PARTITION BY parent_account_type
                    ORDER BY post_count DESC
                ) AS rn
            FROM unioned
        )

        SELECT 
            fetch_date,
            sound_name,
            plays_increase,
            over_100k,
            post_count,
            parent_account_type
        FROM ranked
        WHERE rn <= 150
        """
        
        execute_write_query(sound_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        # BGMリストを取得（カテゴリ別）
        sounds_query = """
        SELECT sound_name, parent_account_type 
        FROM sound_daily_summary_top150 
        WHERE fetch_date = %s
        ORDER BY parent_account_type, post_count DESC
        """
        sounds = execute_query(sounds_query, (collection_date,))
        
        # 各BGM＋カテゴリごとにTOP100動画を取得
        for sound_row in sounds:
            sound_name = sound_row['sound_name']
            account_type = sound_row['parent_account_type']
            
            logger.info(f"BGM '{sound_name}' ({account_type}) のTOP100動画を処理中...")
            
            # カテゴリ別のWHERE条件を設定
            if account_type == 'ALL':
                account_condition = "1=1"  # 全て対象
                params = (collection_date, sound_name, sound_name, sound_name, sound_name, collection_date)
            else:
                account_condition = "fd.parent_account_type = %s"
                params = (collection_date, sound_name, sound_name, sound_name, sound_name, collection_date, account_type)
            
            # 各BGM＋カテゴリのTOP100動画を取得・挿入
            sound_videos_query = f"""
            INSERT INTO sound_daily_top100_videos 
            (video_id, fetch_date, sound_name, plays_increase, likes_increase, post_time, thumbnail_url, parent_account_type)
            SELECT 
                fd.video_id,
                %s as fetch_date,
                %s as sound_name,
                pch.play_count_increase as plays_increase,
                COALESCE(pch.likes_count_increase, 0) as likes_increase,
                fd.created_at as post_time,
                COALESCE(fd.thumbnail_url, '') as thumbnail_url,
                '{account_type}' as parent_account_type
            FROM frontend_data fd
            JOIN play_count_history pch ON fd.video_id = pch.video_id
            WHERE 
                (
                    (%s = 'オリジナル楽曲' AND fd.music_info LIKE 'オリジナル楽曲%%')
                    OR
                    (%s != 'オリジナル楽曲' AND fd.music_info = %s)
                )
                AND pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
                AND {account_condition}
            ORDER BY 
                pch.play_count_increase DESC
            LIMIT 100
            """
            
            execute_write_query(sound_videos_query, params)
        
        logger.info(f"BGM日次集計が完了しました。収集日: {collection_date}")
        
    except Exception as e:
        error_message = f"BGM日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== BGM日次集計処理の終了 ====")
