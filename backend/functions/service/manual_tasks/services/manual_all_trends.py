from typing import Dict, List, Optional, Tuple, Any
import functions_framework
from datetime import datetime, timedelta
import logging
import os
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from pytz import timezone
from dotenv import load_dotenv

load_dotenv()
# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
project_id = os.getenv('PROJECT_ID', 'local-project') 

# 設定の初期化
initialize_config()

def get_latest_collection_date() -> Optional[str]:
    """
    最新の収集日を取得する
    
    Returns:
        Optional[str]: 最新の収集日 (YYYY-MM-DD形式)、データがない場合はNone
    """
    try:
        query = """
            SELECT DISTINCT collection_date
            FROM play_count_history
            ORDER BY collection_date DESC
            LIMIT 1
        """
        
        results = execute_query(query)
        
        if results:
            return results[0]['collection_date'].strftime('%Y-%m-%d')
        else:
            return None
            
    except Exception as e:
        logger.error(f"最新収集日取得エラー: {str(e)}")
        raise

def validate_collection_date(collection_date: str) -> bool:
    """
    指定された収集日が有効かチェックする
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
        
    Returns:
        bool: 有効な場合True
    """
    try:
        query = """
            SELECT COUNT(*) as count
            FROM play_count_history
            WHERE collection_date = %s
        """
        
        results = execute_query(query, (collection_date,))
        return results[0]['count'] > 0
        
    except Exception as e:
        logger.error(f"収集日検証エラー: {str(e)}")
        return False

def update_hashtags_summary(collection_date: str) -> Dict[str, str]:
    """
    ハッシュタグの日次集計処理（カテゴリ別＋総合版）
    アフィ、企業、インフルエンサー、ALL の4つのカテゴリで集計
    """
    logger.info(f"==== ハッシュタグ日次集計処理の開始: {collection_date} ====")
    
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
        
        return {
            'status': 'success',
            'message': f'Successfully processed hashtags for {collection_date}'
        }
        
    except Exception as e:
        error_message = f"ハッシュタグ日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {'status': 'error', 'message': error_message}
    
    finally:
        logger.info(f"==== ハッシュタグ日次集計処理の終了: {collection_date} ====")

def update_sound_summary(collection_date: str) -> Dict[str, str]:
    """
    BGM（サウンド）の日次集計処理（カテゴリ別+総合版）
    アフィ、企業、インフルエンサー、ALL の4つのカテゴリで集計
    """
    logger.info(f"==== BGM日次集計処理の開始: {collection_date} ====")
    
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
        
        return {
            'status': 'success',
            'message': f'Successfully processed sounds for {collection_date}'
        }
        
    except Exception as e:
        error_message = f"BGM日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {'status': 'error', 'message': error_message}
    
    finally:
        logger.info(f"==== BGM日次集計処理の終了: {collection_date} ====")

def process_all_trends_for_date(collection_date: str) -> Dict[str, str]:
    """
    指定日のハッシュタグとBGMの集計処理を実行する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
        
    Returns:
        Dict[str, str]: 処理結果
    """
    hashtag_error = None
    sound_error = None
    
    # ハッシュタグ集計
    try:
        hashtag_result = update_hashtags_summary(collection_date)
        if hashtag_result['status'] != 'success':
            hashtag_error = hashtag_result['message']
    except Exception as e:
        hashtag_error = str(e)
    
    # BGM集計（ハッシュタグでエラーが発生しても実行）
    try:
        sound_result = update_sound_summary(collection_date)
        if sound_result['status'] != 'success':
            sound_error = sound_result['message']
    except Exception as e:
        sound_error = str(e)
    
    # 結果の判定
    if hashtag_error and sound_error:
        return {'status': 'error', 'message': f'ハッシュタグエラー: {hashtag_error}, BGMエラー: {sound_error}'}
    elif hashtag_error:
        return {'status': 'partial', 'message': f'BGMは成功、ハッシュタグでエラー: {hashtag_error}'}
    elif sound_error:
        return {'status': 'partial', 'message': f'ハッシュタグは成功、BGMでエラー: {sound_error}'}
    else:
        return {'status': 'success', 'message': f'Successfully processed all trends for {collection_date}'}

def sync_all_trends_single_date(collection_date: Optional[str] = None) -> Dict[str, Any]:
    """
    ハッシュタグとBGMの集計を単一日で同期する
    
    Args:
        collection_date (Optional[str]): 処理対象日 (YYYY-MM-DD形式)。
                                       Noneの場合は最新日を使用
        
    Returns:
        Dict[str, Any]: 処理結果
    """
    try:
        # collection_dateが指定されていない場合は最新日を取得
        if collection_date is None:
            collection_date = get_latest_collection_date()
            if collection_date is None:
                return {
                    'status': 'error',
                    'message': '処理対象の収集日が見つかりませんでした'
                }
            logger.info(f"最新の収集日を使用します: {collection_date}")
        else:
            # 指定された日付の検証
            if not validate_collection_date(collection_date):
                return {
                    'status': 'error',
                    'message': f'指定された収集日にデータが存在しません: {collection_date}'
                }
            logger.info(f"指定された収集日を使用します: {collection_date}")
        
        # 集計処理を実行
        result = process_all_trends_for_date(collection_date)
        
        return {
            'status': result['status'],
            'message': result['message'],
            'processed_date': collection_date
        }

    except Exception as e:
        logger.error(f"単一日集計処理エラー: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

@functions_framework.http
def sync_all_trends_manual(request):
    """
    HTTPリクエストで実行される関数
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        tuple: (結果データ, HTTPステータスコード)
    """
    logger.info("==== sync_all_trends_manual関数の実行開始 ====")
    
    try:
        # リクエストからcollection_dateパラメータを取得
        collection_date = None
        
        if request.method == 'GET':
            collection_date = request.args.get('collection_date')
        elif request.method == 'POST':
            request_json = request.get_json(silent=True)
            if request_json:
                collection_date = request_json.get('collection_date')
        
        logger.info(f"リクエストパラメータ - collection_date: {collection_date}")
        
        # 単一日処理の実行
        result = sync_all_trends_single_date(collection_date)
        
        # 結果をログ出力
        status_code = 200 if result['status'] == 'success' else 500
        logger.info(f"処理完了 - ステータス: {status_code}")
        logger.info(f"処理結果: {result}")
        
        return result, status_code
        
    except Exception as e:
        logger.error(f"エラー発生: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            'status': 'error',
            'message': str(e)
        }, 500
    finally:
        logger.info("==== sync_all_trends_manual関数の実行終了 ====")


if __name__ == "__main__":
    import sys
    
    try:
        # コマンドライン引数からcollection_dateを取得
        collection_date = None
        if len(sys.argv) > 1:
            collection_date = sys.argv[1]
            logger.info(f"コマンドライン引数で指定された日付: {collection_date}")
        
        result = sync_all_trends_single_date(collection_date)
        logger.info(f"処理結果: {result}")
        
    except KeyboardInterrupt:
        logger.info("処理を中断しました")
    except Exception as e:
        logger.error(f"エラー発生: {str(e)}")
