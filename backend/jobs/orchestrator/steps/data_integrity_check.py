import os
import json
import logging
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from backend.jobs.core.db_utils import execute_query, execute_write_query
from backend.jobs.core.config import initialize_config, get_secret
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def check_data_integrity(collection_date: Optional[str] = None) -> Dict[str, Any]:
    """
    データの整合性をチェックしてDiscordに通知（非Pub/Sub）
    """
    logger.info("==== データ整合性チェック処理の開始 ====")
    
    try:
        # 収集日の決定（デフォルト: JST基準で2日前）
        if collection_date is None:
            jst = timezone('Asia/Tokyo')
            collection_date = (datetime.now(jst) + timedelta(hours=9) - timedelta(days=2)).strftime('%Y-%m-%d')
        
        # データ整合性をチェック
        anomaly_count = check_play_count_integrity(collection_date)
        
        # 異常があった場合Discordに通知
        if anomaly_count > 0:
            send_discord_alert(anomaly_count, collection_date)
            logger.warning(f"データ整合性に異常を検出: {anomaly_count}件")
        else:
            logger.info("データ整合性チェック完了: 異常なし")
        
        # 追加: 4テーブル結合の件数集計とDiscord通知
        jst = timezone('Asia/Tokyo')
        now_jst = datetime.now(jst)
        since_dt = (now_jst - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        since_dt_str = since_dt.strftime('%Y-%m-%d %H:%M:%S')
        try:
            join_count = count_master_gt_frontend_with_recent_crawls(since_dt_str)
            send_discord_join_count(join_count, since_dt_str)
            logger.info(f"結合件数の集計と通知が完了しました: {join_count}件, 基準(JST): {since_dt_str}")
        except Exception as e:
            logger.error(f"結合件数の集計/通知中にエラー: {str(e)}")
        
        logger.info(f"データ整合性チェックが完了しました。収集日: {collection_date}")
        
        return {
            "status": "success",
            "message": "データ整合性チェックが完了しました",
            "collection_date": collection_date,
            "anomaly_count": anomaly_count,
            "join_count": join_count if 'join_count' in locals() else None,
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
        # Cloud SecretからDiscord Webhook URLを取得
        secret_name = os.getenv('DATA_INTEGRITY_DISCORD_WEBHOOK_SECRET', 'data-integrity-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
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
            "fields": [
                {
                    "name": "収集日",
                    "value": collection_date,
                    "inline": True
                },
                {
                    "name": "異常件数",
                    "value": f"{anomaly_count}件",
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
        # Cloud SecretからDiscord Webhook URLを取得
        secret_name = os.getenv('DATA_INTEGRITY_DISCORD_WEBHOOK_SECRET', 'data-integrity-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
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

def send_discord_error(error_message):
    """
    Discordにエラーを通知する
    
    Args:
        error_message (str): エラーメッセージ
    """
    try:
        # Cloud SecretからDiscord Webhook URLを取得
        secret_name = os.getenv('DATA_INTEGRITY_DISCORD_WEBHOOK_SECRET', 'data-integrity-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
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

def count_master_gt_frontend_with_recent_crawls(since_datetime: str) -> int:
    """
    video_idでfrontend_data, video_master, video_heavy_raw_data, video_play_count_raw_dataを接続し、
    - video_master.play_count > frontend_data.play_count
    - video_heavy_raw_data と video_play_count_raw_data の最新 crawled_at が since_datetime 以降
    の件数を返す
    """
    try:
        query = """
        SELECT COUNT(DISTINCT vm.video_id) AS join_count
        FROM video_master vm
        INNER JOIN frontend_data fd ON fd.video_id = vm.video_id
        INNER JOIN (
            SELECT video_id, MAX(crawled_at) AS last_heavy_crawled
            FROM video_heavy_raw_data
            GROUP BY video_id
        ) vh ON vh.video_id = vm.video_id
        INNER JOIN (
            SELECT video_id, MAX(crawled_at) AS last_play_crawled
            FROM video_play_count_raw_data
            GROUP BY video_id
        ) vp ON vp.video_id = vm.video_id
        WHERE vm.play_count > fd.play_count
          AND vh.last_heavy_crawled >= %s
          AND vp.last_play_crawled >= %s
        """
        rows = execute_query(query, (since_datetime, since_datetime))
        return rows[0]['join_count'] if rows else 0
    except Exception as e:
        logger.error(f"4テーブル結合の件数集計に失敗: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise

def send_discord_join_count(join_count: int, since_datetime: str) -> None:
    """
    4テーブル結合の条件を満たす件数をDiscordに送信する
    """
    try:
        secret_name = os.getenv('DATA_INTEGRITY_DISCORD_WEBHOOK_SECRET', 'data-integrity-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
            return

        embed = {
            "title": "ℹ️ フロント未反映の再生数件数",
            "description": "video_masterのplay_countがfrontend_dataのplay_countを上回り、かつ生データの最新crawled_atが基準以降の件数",
            "color": 3447003,
            "fields": [
                {"name": "基準(JST)", "value": since_datetime, "inline": True},
                {"name": "件数", "value": f"{join_count}件", "inline": True},
            ],
            "footer": {"text": "TikTok Analytics - Data Integrity Check"}
        }

        payload = {"embeds": [embed]}
        timeout = int(os.getenv('DISCORD_TIMEOUT', '10'))
        max_retries = int(os.getenv('DISCORD_MAX_RETRIES', '3'))

        for attempt in range(max_retries):
            try:
                resp = requests.post(
                    discord_webhook_url,
                    json=payload,
                    headers={'Content-Type': 'application/json'},
                    timeout=timeout
                )
                if resp.status_code == 204:
                    logger.info(f"Discordに4テーブル結合の件数通知を送信しました: {join_count}件")
                    return
                else:
                    logger.warning(f"Discord通知の送信失敗 (試行{attempt + 1}/{max_retries}): {resp.status_code}")
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(2 ** attempt)
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
        logger.error(f"4テーブル件数通知送信中にエラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
