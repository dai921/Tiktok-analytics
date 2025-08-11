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
from collections import defaultdict

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def sync_corporate_data(event, context):
    """
    企業系動画のTOP100ランキングデータを同期する
    Pub/Subトリガーで実行される
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    
    Returns:
        dict: 処理結果を含むJSON
    """
    logger.info("==== 企業系動画TOP100ランキング同期処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
            
            # summary_all_trendsからの完了メッセージを確認
            if (message_data.get("status") != "success" or 
                message_data.get("previous_step") != "summary_all_trends"):
                logger.info(f"前の処理が成功していないため、処理をスキップします: {message_data.get('status')}")
                return {"status": "skipped", "reason": "Previous step not successful"}
                
            # 収集日を取得
            collection_date = message_data.get("collection_date")
        else:
            # データがない場合は現在日付の前日を使用
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) - timedelta(days=1)).strftime('%Y-%m-%d')
            logger.info(f"データなしのトリガー実行。収集日を{collection_date}に設定します")
        
        if not collection_date:
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) - timedelta(days=1)).strftime('%Y-%m-%d')
            logger.info(f"収集日が指定されていないため、昨日の日付を使用します: {collection_date}")
        
        # 企業系動画TOP100ランキングを同期
        sync_corporate_top100_for_date(collection_date)
        
        logger.info(f"企業系動画TOP100ランキング同期が完了しました。収集日: {collection_date}")
        
        # 次の処理（data_integrity_check）にメッセージを送信
        logger.info("データ整合性チェック処理のトリガーメッセージを送信します")
        publish_message("data-integrity-check", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "sync_corporate_data",
            "message": "企業系動画TOP100ランキング同期が完了しました。データ整合性チェック処理を開始します。"
        })
        
        return {
            "status": "success",
            "message": "企業系動画TOP100ランキング同期が完了しました",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"企業系動画TOP100ランキング同期処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        # エラーの場合もdata_integrity_checkに通知
        try:
            publish_message("data-integrity-check", {
                "status": "error",
                "collection_date": collection_date if 'collection_date' in locals() else None,
                "execution_time": datetime.now().isoformat(),
                "previous_step": "sync_corporate_data",
                "error": error_message
            })
        except Exception as pub_error:
            logger.error(f"Pub/Subメッセージ送信中にエラーが発生しました: {str(pub_error)}")
        
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 企業系動画TOP100ランキング同期処理の終了 ====")

def parse_account_types(account_type_str):
    """
    アカウントタイプ文字列を解析し、account_typeとsecond_account_typeに分ける
    
    Args:
        account_type_str (str): カンマ区切りのアカウントタイプ文字列
        
    Returns:
        tuple: (account_type, second_account_type)
    """
    if not account_type_str:
        return None, None
    
    # カンマで分割
    parts = [part.strip() for part in account_type_str.replace('、', ',').split(',') if part.strip()]
    
    if len(parts) == 1:
        # 分割されない場合はそのまま返す
        return parts[0], None
    elif len(parts) >= 2:
        # '採用'または'集客'が含まれているかチェック
        recruitment_hiring_parts = [part for part in parts if part in ['採用', '集客']]
        other_parts = [part for part in parts if part not in ['採用', '集客']]
        
        if recruitment_hiring_parts:
            # '採用'または'集客'がある場合
            second_account_type = recruitment_hiring_parts[0]  # 最初に見つかった方を使用
            account_type = other_parts[0] if other_parts else parts[0]
            return account_type, second_account_type
        else:
            # '採用'も'集客'もない場合は最初の2つを使用
            return parts[0], parts[1]
    
    return None, None

def sync_corporate_top100_for_date(collection_date):
    """指定された日付の企業系動画TOP100ランキングを同期する"""
    
    # 企業系動画の全データを取得するクエリ
    select_query = """
    SELECT 
        pch.video_id,
        pch.play_count_increase,
        pch.likes_count_increase,
        pch.comment_count_increase,
        pch.save_count_increase,
        fd.created_at,
        fd.thumbnail_url,
        fd.account_type
    FROM 
        play_count_history pch
    JOIN 
        frontend_corporate_data fd ON pch.video_id = fd.video_id
    WHERE 
        pch.collection_date = %s
        AND pch.play_count_increase IS NOT NULL
        AND pch.play_count_increase > 0
        AND fd.parent_account_type = '企業アカウント'
    ORDER BY 
        pch.play_count_increase DESC
    """
    
    params = [collection_date]
    results = execute_query(select_query, params)
    
    if not results:
        logger.info(f"日付 {collection_date} の企業系動画データが見つかりません")
        return
    
    # アカウントタイプの組み合わせごとにグループ化
    account_type_groups = defaultdict(list)
    
    for row in results:
        account_type_str = row['account_type']
        account_type, second_account_type = parse_account_types(account_type_str)
        
        # アカウントタイプの組み合わせをキーとして使用
        key = (account_type, second_account_type)
        account_type_groups[key].append({
            'video_id': row['video_id'],
            'play_count_increase': row['play_count_increase'],
            'likes_count_increase': row['likes_count_increase'],
            'comment_count_increase': row['comment_count_increase'],
            'save_count_increase': row['save_count_increase'],
            'created_at': row['created_at'],
            'thumbnail_url': row['thumbnail_url'],
            'account_type': account_type,
            'second_account_type': second_account_type
        })
    
    # 各アカウントタイプの組み合わせごとにTOP100を取得して挿入
    total_insert_count = 0
    
    for (account_type, second_account_type), videos in account_type_groups.items():
        # 再生数増加でソートしてTOP100を取得
        sorted_videos = sorted(videos, key=lambda x: x['play_count_increase'], reverse=True)[:100]
        
        logger.info(f"アカウントタイプ組み合わせ ({account_type}, {second_account_type}): {len(sorted_videos)}件のTOP動画を処理")
        
        # 各動画をデータベースに挿入
        for video in sorted_videos:
            insert_query = """
            INSERT INTO corporate_daily_top100_videos 
            (video_id, fetch_date, account_type, second_account_type, plays_increase, 
             likes_increase, comments_increase, saves_increase, post_time, thumbnail_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                account_type = VALUES(account_type),
                second_account_type = VALUES(second_account_type),
                plays_increase = VALUES(plays_increase),
                likes_increase = VALUES(likes_increase),
                comments_increase = VALUES(comments_increase),
                saves_increase = VALUES(saves_increase),
                post_time = VALUES(post_time),
                thumbnail_url = VALUES(thumbnail_url)
            """
            
            insert_params = [
                video['video_id'],
                collection_date,
                video['account_type'],
                video['second_account_type'],
                video['play_count_increase'],
                video['likes_count_increase'] or 0,
                video['comment_count_increase'] or 0,
                video['save_count_increase'] or 0,
                video['created_at'],
                video['thumbnail_url']
            ]
            
            execute_write_query(insert_query, insert_params)
            total_insert_count += 1
    
    logger.info(f"日付 {collection_date} の企業系動画TOP100ランキング同期が完了しました。")
    logger.info(f"アカウントタイプ組み合わせ数: {len(account_type_groups)}, 総処理件数: {total_insert_count}")
