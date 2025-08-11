import os
import json
import logging
import requests
from datetime import datetime, timedelta
import functions_framework
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config, get_secret
from pytz import timezone

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def check_execution_time() -> bool:
    """
    前回の実行時刻をチェックし、48時間以上経過しているか確認する
    Returns:
        bool: 実行可能な場合はTrue、そうでない場合はFalse
    """
    try:
        query = """
            SELECT last_run 
            FROM scheduler_job_info 
            WHERE job_name = 'video_count_check'
        """
        result = execute_query(query)
        
        if not result:
            # 初回実行の場合、レコードを作成して実行可能とする
            insert_query = """
                INSERT INTO scheduler_job_info (job_name, last_run)
                VALUES ('video_count_check', NOW())
            """
            execute_write_query(insert_query)
            logger.info("初回実行のため、実行を許可します")
            return True
        
        last_run = result[0]['last_run']
        current_time = datetime.now()
        time_diff = current_time - last_run
        
        # 48時間以上経過しているかチェック
        if time_diff.total_seconds() >= 48 * 3600:
            # last_runを更新
            update_query = """
                UPDATE scheduler_job_info 
                SET last_run = NOW()
                WHERE job_name = 'video_count_check'
            """
            execute_write_query(update_query)
            logger.info(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間経過しているため、実行を許可します")
            return True
        else:
            logger.info(f"前回の実行から{time_diff.total_seconds() / 3600:.1f}時間しか経過していないため、実行をスキップします")
            return False
            
    except Exception as e:
        logger.error(f"実行時間チェックでエラーが発生しました: {str(e)}")
        return False  # エラーの場合は安全のため実行を拒否

@functions_framework.http
def scheduled_job(request):
    """
    HTTPトリガーでの定期実行用のCloud Function
    毎日実行されるが、前回実行から48時間経過していない場合はスキップ
    """
    start_time = datetime.now()
    logger.info(f"動画数チェック定期実行開始: {start_time}")

    try:
        # 前回実行時間をチェック
        if not check_execution_time():
            logger.info("前回実行から48時間経過していないため、処理をスキップします")
            return {
                "status": "skipped",
                "message": "前回実行から48時間経過していないため処理をスキップ",
                "execution_time": datetime.now().isoformat()
            }

        # 動画数チェックを実行
        result = video_count_check()
        
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"動画数チェック定期実行完了: 実行時間 {execution_time}秒, 結果: {result}")
        
        return result

    except Exception as e:
        error_message = f"動画数チェック定期実行中にエラーが発生: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        # エラーもDiscordに通知
        send_discord_error(error_message)
        
        return {
            "status": "error", 
            "error": error_message, 
            "time": datetime.now().isoformat()
        }

def video_count_check():
    """
    crawler_account_idごとの動画数をチェックしてDiscordに送信する
    """
    logger.info("==== 動画数チェック処理の開始 ====")
    
    try:
        # 2日前の日付を計算（JST）
        jst = timezone('Asia/Tokyo')
        current_date = datetime.now(jst)
        start_date = (current_date - timedelta(days=2)).strftime('%Y-%m-%d')
        end_date = (current_date).strftime('%Y-%m-%d')
        
        logger.info(f"チェック対象期間: {start_date} 〜 {end_date}")
        
        # 動画数を集計するクエリを実行
        video_counts = get_video_counts_by_crawler_account(start_date, end_date)
        
        # 結果をDiscordに送信
        send_discord_notification(video_counts, start_date, end_date)
        
        logger.info(f"動画数チェックが完了しました。対象期間: {start_date} 〜 {end_date}")
        
        return {
            "status": "success",
            "message": "動画数チェックが完了しました",
            "start_date": start_date,
            "end_date": end_date,
            "crawler_account_count": len(video_counts),
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = f"動画数チェック処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        # エラーもDiscordに通知
        send_discord_error(error_message)
        
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    
    finally:
        logger.info("==== 動画数チェック処理の終了 ====")

def get_video_counts_by_crawler_account(start_date, end_date):
    """
    crawler_account_idごとの動画数を取得する
    
    Args:
        start_date (str): 開始日 (YYYY-MM-DD形式)
        end_date (str): 終了日 (YYYY-MM-DD形式)
    
    Returns:
        List[Dict]: crawler_account_idと動画数のリスト
    """
    logger.info("==== crawler_account_idごとの動画数取得開始 ====")
    
    try:
        # ユーザー指定のクエリ
        query = """
        SELECT
            al.crawler_account_id,
            COUNT(v.id) AS video_count
        FROM
            video_heavy_raw_data AS v
        JOIN
            account_list AS al
              ON al.favorite_user_username = v.user_username
        WHERE
           v.post_time >= %s
        and v.post_time < %s
        GROUP BY
            al.crawler_account_id
        ORDER BY
            al.crawler_account_id
        """
        
        # クエリを実行
        results = execute_query(query, (start_date, end_date))
        
        logger.info(f"動画数集計完了: {len(results)}件のcrawler_account_id")
        return results
        
    except Exception as e:
        error_message = f"動画数集計中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e

def send_discord_notification(video_counts, start_date, end_date):
    """
    Discordに動画数の集計結果を通知する
    
    Args:
        video_counts (List[Dict]): 動画数の集計結果
        start_date (str): 開始日
        end_date (str): 終了日
    """
    try:
        # Cloud SecretからDiscord Webhook URLを取得
        secret_name = os.getenv('VIDEO_COUNT_CHECK_DISCORD_WEBHOOK_SECRET', 'video-count-check-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
            return
        
        # 結果をフォーマット
        total_videos = sum(item['video_count'] for item in video_counts)
        total_accounts = len(video_counts)
        
        # 上位5件のアカウントを取得
        top_accounts = sorted(video_counts, key=lambda x: x['video_count'], reverse=True)[:5]
        
        # 詳細データを文字列として作成
        details_text = ""
        for item in video_counts:
            details_text += f"ID: {item['crawler_account_id']} -> {item['video_count']}件\n"
        
        # Discord webhook メッセージを作成
        embed = {
            "title": "📊 動画数チェック結果",
            "description": f"期間: {start_date} 〜 {end_date}",
            "color": 3447003,  # 青色
            "fields": [
                {
                    "name": "集計概要",
                    "value": f"対象アカウント数: {total_accounts}件\n総動画数: {total_videos}件",
                    "inline": False
                },
                {
                    "name": "上位5アカウント",
                    "value": "\n".join([f"ID: {item['crawler_account_id']} -> {item['video_count']}件" for item in top_accounts]) if top_accounts else "データなし",
                    "inline": False
                }
            ],
            "footer": {
                "text": "TikTok Analytics - Video Count Check"
            },
            "timestamp": datetime.now().isoformat()
        }
        
        # 詳細データが長い場合は、ファイルとして添付するかページ分割を検討
        if len(details_text) < 1000:
            embed["fields"].append({
                "name": "全データ",
                "value": f"```\n{details_text}```",
                "inline": False
            })
        else:
            embed["fields"].append({
                "name": "データ詳細",
                "value": f"データが多すぎるため、上位5件のみ表示しています。\n総件数: {total_accounts}件",
                "inline": False
            })
        
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
                    logger.info(f"Discordに動画数チェック結果を送信しました: {total_accounts}アカウント, {total_videos}動画")
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
        secret_name = os.getenv('VIDEO_COUNT_CHECK_DISCORD_WEBHOOK_SECRET', 'video-count-check-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
            return
        
        # Discord webhook エラーメッセージを作成
        embed = {
            "title": "🚨 動画数チェック処理エラー",
            "description": "動画数チェック処理中にエラーが発生しました",
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
                "text": "TikTok Analytics - Video Count Check"
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

# ローカルテスト用
if __name__ == "__main__":
    try:
        if check_execution_time():
            print("条件を満たしたため、動画数チェックを実行します")
            result = video_count_check()
            print("実行結果:", result)
        else:
            print("条件を満たさないため、動画数チェックをスキップします")
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}") 