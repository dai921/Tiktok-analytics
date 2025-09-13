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

def update_product_daily_summary(event, context):
    """
    video_history_syncの後に実行され、product_daily_summaryテーブルを更新する
    """
    logger.info("==== 商品日次集計処理の開始 ====")
    
    try:
        # 既存のPub/Subメッセージ処理
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            
            if message_data.get("status") != "success":
                logger.info(f"video_history_syncが成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            collection_date = message_data.get("collection_date")
        else:
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")
        
        # 新Product検知と過去データ処理を追加
        handle_new_products_backfill(collection_date)
        
        # 既存の商品ごとの集計クエリ - そのまま
        product_summary_query = """
        INSERT INTO product_daily_summary 
        (fetch_date, product, product_category, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            pm.product_name as product,
            pm.product_category,
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
        JOIN 
            product_master pm ON fd.product = pm.product_name
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
        GROUP BY 
            pm.product_name, pm.product_category
        ON DUPLICATE KEY UPDATE
            plays_increase = VALUES(plays_increase),
            over_100k = VALUES(over_100k),
            post_count = VALUES(post_count)
        """
        
        # クエリを実行
        execute_write_query(product_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        logger.info(f"商品日次集計が完了しました。収集日: {collection_date}")
        
        # 既存の処理を継続...
        update_genre_daily_summary(collection_date)
        
        logger.info("TOP100動画更新処理のトリガーメッセージを送信します")
        publish_message("top100-videos-sync", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "summary_table_sync",
            "message": "商品・ジャンル日次集計が完了しました。TOP100動画更新処理を開始します。"
        })
        
        return {
            "status": "success",
            "message": "商品・ジャンル日次集計が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"商品日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 商品日次集計処理の終了 ====")

# 新Product処理用の関数を追加
def handle_new_products_backfill(collection_date):
    """新Productの過去データバックフィル処理"""
    logger.info("新Product検知処理を開始")
    
    # is_new = 1のProductを取得
    new_products_query = """
    SELECT product_name, product_category 
    FROM product_master 
    WHERE is_new = 1
    """
    new_products = execute_query(new_products_query)
    
    if not new_products:
        logger.info("新Productは見つかりませんでした")
        return
    
    logger.info(f"{len(new_products)}個の新Productを検知: {[p['product_name'] for p in new_products]}")
    
    # 各新Productに対して過去2週間分を処理
    for product in new_products:
        backfill_product_historical_data(product['product_name'], product['product_category'], collection_date)
    
    # 処理完了後、is_newフラグを0に更新
    update_processed_products_flag([p['product_name'] for p in new_products])

def backfill_product_historical_data(product_name, product_category, collection_date, days_back=14):
    """指定Productの過去データをバックフィル"""
    logger.info(f"Product '{product_name}' の過去{days_back}日分のデータ処理を開始")

    base_date = datetime.strptime(collection_date, '%Y-%m-%d')
    
    # 過去14日分の日付で処理（直近から遡る）
    for days_ago in range(1, days_back + 1):
        backfill_date = (base_date - timedelta(days=days_ago)).strftime('%Y-%m-%d')
        
        # play_count_historyに該当日のデータがあるかチェック
        data_check_query = """
        SELECT COUNT(*) as count
        FROM play_count_history pch
        JOIN frontend_data fd ON pch.video_id = fd.video_id
        WHERE pch.collection_date = %s 
        AND fd.product = %s
        """
        data_exists = execute_query(data_check_query, (backfill_date, product_name))
        
        if data_exists[0]['count'] == 0:
            logger.info(f"Product '{product_name}' の日付 {backfill_date} にはデータがありません。スキップ")
            continue
        
        # 1. product_daily_summaryのバックフィル処理
        backfill_summary_query = """
        INSERT INTO product_daily_summary 
        (fetch_date, product, product_category, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            pm.product_name as product,
            pm.product_category,
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
        JOIN 
            product_master pm ON fd.product = pm.product_name
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
            AND pm.product_name = %s
        GROUP BY 
            pm.product_name, pm.product_category
        ON DUPLICATE KEY UPDATE
            plays_increase = VALUES(plays_increase),
            over_100k = VALUES(over_100k),
            post_count = VALUES(post_count)
        """
        
        try:
            execute_write_query(backfill_summary_query, (
                backfill_date, backfill_date, backfill_date, 
                backfill_date, product_name
            ))
            logger.info(f"Product '{product_name}' の日付 {backfill_date} のサマリー集計完了")
        except Exception as e:
            logger.error(f"Product '{product_name}' の日付 {backfill_date} のサマリー処理でエラー: {e}")
            continue
        
        # 2. product_daily_top100_videosのバックフィル処理
        try:
            # 既存のデータを削除（同じ日付・商品の組み合わせ）
            delete_top100_query = """
            DELETE FROM product_daily_top100_videos
            WHERE fetch_date = %s AND product = %s
            """
            execute_write_query(delete_top100_query, (backfill_date, product_name))
            
            # 商品別TOP100動画を取得して挿入
            insert_top100_query = """
            INSERT INTO product_daily_top100_videos 
            (video_id, fetch_date, product, product_category, plays_increase, likes_increase, post_time, thumbnail_url)
            SELECT DISTINCT
                fd.video_id,
                %s as fetch_date,
                fd.product,
                %s as product_category,
                fd.play_count_increase as plays_increase,
                fd.likes_count_increase as likes_increase,
                fd.created_at as post_time,
                fd.thumbnail_url
            FROM 
                frontend_data fd
            WHERE 
                fd.product = %s
                AND fd.created_at <= %s
                AND fd.play_count_increase IS NOT NULL
                AND fd.likes_count_increase IS NOT NULL
            ORDER BY 
                fd.play_count_increase DESC, fd.video_id DESC
            LIMIT 100
            """
            
            execute_write_query(insert_top100_query, (
                backfill_date, product_category, product_name, backfill_date
            ))
            
            logger.info(f"Product '{product_name}' の日付 {backfill_date} のTOP100動画集計完了")
            
        except Exception as e:
            logger.error(f"Product '{product_name}' の日付 {backfill_date} のTOP100動画処理でエラー: {e}")
    
    logger.info(f"Product '{product_name}' の過去データ処理完了（サマリー + TOP100動画）")

def update_processed_products_flag(product_names):
    """処理済みProductのis_newフラグを0に更新"""
    if not product_names:
        return
    
    # product_namesを文字列リストに変換してIN句で使用
    placeholders = ','.join(['%s'] * len(product_names))
    update_flag_query = f"""
    UPDATE product_master 
    SET is_new = 0 
    WHERE product_name IN ({placeholders})
    """
    
    execute_write_query(update_flag_query, tuple(product_names))
    logger.info(f"処理完了: {len(product_names)}個のProductのis_newフラグを0に更新")

def update_genre_daily_summary(collection_date):
    """
    genre_daily_summaryテーブルを更新する
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    """
    logger.info("==== 動画ジャンル日次集計処理の開始 ====")
    
    try:
        # ジャンルごとの集計クエリ
        genre_summary_query = """
        INSERT INTO genre_daily_summary 
        (fetch_date, video_genre, plays_increase, over_100k, post_count)
        SELECT 
            %s as fetch_date,
            TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(fd.category, ',', n.n), ',', -1)) AS video_genre,
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
        CROSS JOIN 
            (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
        WHERE 
            pch.collection_date = %s
            AND pch.play_count_increase IS NOT NULL
            AND fd.category IS NOT NULL
            AND fd.category != ''
            AND n.n <= 1 + LENGTH(fd.category) - LENGTH(REPLACE(fd.category, ',', ''))
            AND (FIND_IN_SET('pr', fd.hashtags) > 0 OR fd.hashtags = 'pr')
        GROUP BY 
            video_genre
        ON DUPLICATE KEY UPDATE
            plays_increase = VALUES(plays_increase),
            over_100k = VALUES(over_100k),
            post_count = VALUES(post_count)
        """
        
        # クエリを実行
        execute_write_query(genre_summary_query, (collection_date, collection_date, collection_date, collection_date))
        
        logger.info(f"動画ジャンル日次集計が完了しました。収集日: {collection_date}")
        
    except Exception as e:
        error_message = f"動画ジャンル日次集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e
    
    finally:
        logger.info("==== 動画ジャンル日次集計処理の終了 ====")
