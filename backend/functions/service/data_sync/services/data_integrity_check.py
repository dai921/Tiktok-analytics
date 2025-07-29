import os
import json
import logging
import requests
from datetime import datetime, timedelta
import functions_framework
import base64
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def check_data_integrity(event, context):
    """
    top100_videos_syncの後に実行され、データの整合性をチェックしてDiscordに通知する
    
    Args:
        event (dict): Pub/Subイベントデータ
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    """
    logger.info("==== データ整合性チェック処理の開始 ====")
    
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
        
        # データ整合性をチェック
        anomaly_count = check_play_count_integrity(collection_date)
        
        # 異常があった場合Discordに通知
        if anomaly_count > 0:
            send_discord_alert(anomaly_count, collection_date)
            logger.warning(f"データ整合性に異常を検出: {anomaly_count}件")
        else:
            logger.info("データ整合性チェック完了: 異常なし")
        
        logger.info(f"データ整合性チェックが完了しました。収集日: {collection_date}")
        
        return {
            "status": "success",
            "message": "データ整合性チェックが完了しました",
            "collection_date": collection_date,
            "anomaly_count": anomaly_count,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"データ整合性チェック処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        # エラーもDiscordに通知
        send_discord_error(error_message)
        
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== データ整合性チェック処理の終了 ====")

def check_play_count_integrity(collection_date):
    """
    play_count_historyテーブルのデータ整合性をチェックする
    
    Args:
        collection_date (str): 収集日 (YYYY-MM-DD形式)
    
    Returns:
        int: 異常データの件数
    """
    logger.info("==== play_count_historyテーブルの整合性チェック開始 ====")
    
    try:
        # まず最新の日付を取得
        latest_date_query = """
        SELECT MAX(collection_date) as latest_date
        FROM play_count_history
        WHERE collection_date <= %s
        """
        
        latest_result = execute_query(latest_date_query, (collection_date,))
        if not latest_result or not latest_result[0]['latest_date']:
            logger.info("チェック対象のデータがありません")
            return 0
            
        latest_date = latest_result[0]['latest_date']
        
        # 一日前の日付を計算
        from datetime import datetime, timedelta
        latest_datetime = datetime.strptime(str(latest_date), '%Y-%m-%d')
        previous_date = (latest_datetime - timedelta(days=2)).strftime('%Y-%m-%d')
        
        logger.info(f"チェック対象期間: {previous_date} → {latest_date}")
        
        # 前日と今日で再生数・増加数が両方とも同じ異常データを検出
        integrity_query = """
        SELECT COUNT(*) as anomaly_count
        FROM play_count_history latest
        INNER JOIN play_count_history previous 
            ON latest.video_id = previous.video_id
        WHERE 
            latest.collection_date = %s
            AND previous.collection_date = %s
            AND latest.play_count = previous.play_count
            AND latest.play_count_increase = previous.play_count_increase
            AND latest.play_count_increase > 0
        """
        
        result = execute_query(integrity_query, (latest_date, previous_date))
        anomaly_count = result[0]['anomaly_count'] if result else 0
        
        logger.info(f"データ整合性チェック完了: 異常件数 = {anomaly_count}")
        return anomaly_count
        
    except Exception as e:
        error_message = f"play_count_history整合性チェック中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e

def send_discord_alert(anomaly_count, collection_date):
    """
    Discordに異常を通知する
    
    Args:
        anomaly_count (int): 異常データの件数
        collection_date (str): 収集日
    """
    try:
        discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
        if not discord_webhook_url:
            logger.warning("DISCORD_WEBHOOK_URL環境変数が設定されていません")
            return
        
        # 通知の閾値をチェック（環境変数で設定可能）
        alert_threshold = int(os.getenv('ALERT_THRESHOLD', '1'))  # デフォルト1件以上
        if anomaly_count < alert_threshold:
            logger.info(f"異常件数({anomaly_count})が閾値({alert_threshold})未満のため通知をスキップ")
            return
        
        # Discord webhook メッセージを作成
        embed = {
            "title": "⚠️ データ整合性異常検知",
            "description": f"異常件数: {anomaly_count}件",
            "color": 15158332,  # 赤色
            "footer": {
                "text": "TikTok Analytics"
            }
        }
        
        payload = {
            "embeds": [embed]
        }
        
        # タイムアウトとリトライ設定
        timeout = int(os.getenv('DISCORD_TIMEOUT', '10'))  # デフォルト10秒
        max_retries = int(os.getenv('DISCORD_MAX_RETRIES', '3'))  # デフォルト3回
        
        for attempt in range(max_retries):
            try:
                # Discord webhookに送信
                response = requests.post(
                    discord_webhook_url,
                    json=payload,
                    headers={'Content-Type': 'application/json'},
                    timeout=timeout
                )
                
                if response.status_code == 204:
                    logger.info(f"Discordに異常通知を送信しました: {anomaly_count}件")
                    return
                else:
                    logger.warning(f"Discord通知の送信失敗 (試行{attempt + 1}/{max_retries}): {response.status_code}")
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(2 ** attempt)  # 指数バックオフ
                    
            except requests.exceptions.Timeout:
                logger.warning(f"Discord通知がタイムアウト (試行{attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(2 ** attempt)
            except requests.exceptions.RequestException as e:
                logger.warning(f"Discord通知のリクエストエラー (試行{attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(2 ** attempt)
        
        logger.error(f"Discord通知の送信に失敗しました（全{max_retries}回試行）")
            
    except Exception as e:
        logger.error(f"Discord通知送信中にエラーが発生しました: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

def send_discord_error(error_message):
    """
    Discordにエラーを通知する
    
    Args:
        error_message (str): エラーメッセージ
    """
    try:
        discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
        if not discord_webhook_url:
            logger.warning("DISCORD_WEBHOOK_URL環境変数が設定されていません")
            return
        
        # Discord webhook エラーメッセージを作成
        embed = {
            "title": "🚨 データ整合性チェック処理エラー",
            "description": "データ整合性チェック処理中にエラーが発生しました",
            "color": 15548997,  # ダークレッド
            "fields": [
                {
                    "name": "エラー内容",
                    "value": error_message[:1024],  # Discordの制限に合わせて切り詰め
                    "inline": False
                },
                {
                    "name": "発生時刻",
                    "value": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    "inline": True
                }
            ],
            "footer": {
                "text": "TikTok Analytics - Data Integrity Check"
            }
        }
        
        payload = {
            "embeds": [embed]
        }
        
        # Discord webhookに送信
        response = requests.post(
            discord_webhook_url,
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 204:
            logger.info("Discordにエラー通知を送信しました")
        else:
            logger.error(f"Discordエラー通知の送信に失敗しました: {response.status_code}, {response.text}")
            
    except Exception as e:
        logger.error(f"Discordエラー通知送信中にエラーが発生しました: {str(e)}") 