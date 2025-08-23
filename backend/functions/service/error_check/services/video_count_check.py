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
        
        # 36時間以上経過しているかチェック
        if time_diff.total_seconds() >= 36 * 3600:
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

        # 新規: ブランク/Null項目チェックを実行
        blank_result = blank_field_check()

        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"動画数チェック定期実行完了: 実行時間 {execution_time}秒, 結果: {result}")

        return {
            "status": "success",
            "video_count_check": result,
            "blank_field_check": blank_result,
            "execution_time_sec": execution_time
        }

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

def get_unprocessed_account_counts():
    """
    crawler_account_idごとの未処理アカウント数を取得する
    
    Returns:
        List[Dict]: crawler_account_idと未処理アカウント数のリスト
    """
    logger.info("==== crawler_account_idごとの未処理アカウント数取得開始 ====")
    
    try:
        # JST時刻で当日の日付を取得
        jst = timezone('Asia/Tokyo')
        current_date = datetime.now(jst).strftime('%Y-%m-%d')
        
        query = """
        SELECT 
            crawler_account_id,
            COUNT(*) as count
        FROM account_list
        WHERE updated_at < %s
            AND favorite_user_is_alive = 1
            AND crawler_account_id IS NOT NULL
        GROUP BY crawler_account_id
        ORDER BY crawler_account_id
        """
        
        # クエリを実行
        results = execute_query(query, (current_date,))
        
        logger.info(f"未処理アカウント数集計完了: {len(results)}件のcrawler_account_id")
        return results
        
    except Exception as e:
        error_message = f"未処理アカウント数集計中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e

def video_count_check():
    """
    crawler_account_idごとの動画数と未処理アカウント数をチェックしてDiscordに送信する
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
        
        # 未処理アカウント数を集計するクエリを実行
        unprocessed_counts = get_unprocessed_account_counts()
        
        # 結果をDiscordに送信
        send_discord_notification(video_counts, unprocessed_counts, start_date, end_date)
        
        logger.info(f"動画数チェックが完了しました。対象期間: {start_date} 〜 {end_date}")
        
        return {
            "status": "success",
            "message": "動画数チェックが完了しました",
            "start_date": start_date,
            "end_date": end_date,
            "crawler_account_count": len(video_counts),
            "unprocessed_account_count": len(unprocessed_counts),
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
              ON al.favorite_user_username COLLATE utf8mb4_0900_ai_ci = v.user_username
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

def send_discord_notification(video_counts, unprocessed_counts, start_date, end_date):
    """
    Discordに動画数と未処理アカウント数の集計結果を通知する
    
    Args:
        video_counts (List[Dict]): 動画数の集計結果
        unprocessed_counts (List[Dict]): 未処理アカウント数の集計結果
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
        
        # 動画数の結果をフォーマット
        total_videos = sum(item['video_count'] for item in video_counts)
        total_accounts = len(video_counts)
        
        # 上位5件のアカウントを取得（動画数）
        top_video_accounts = sorted(video_counts, key=lambda x: x['video_count'], reverse=True)[:5]
        
        # 未処理アカウント数の結果をフォーマット
        total_unprocessed = sum(item['count'] for item in unprocessed_counts)
        unprocessed_account_count = len(unprocessed_counts)
        
        # 動画数詳細データを文字列として作成
        video_details_text = ""
        for item in video_counts:
            video_details_text += f"ID: {item['crawler_account_id']} -> {item['video_count']}件\n"
        
        # 未処理アカウント詳細データを文字列として作成（全件）
        unprocessed_details_text = ""
        for item in sorted(unprocessed_counts, key=lambda x: x['crawler_account_id']):
            unprocessed_details_text += f"ID: {item['crawler_account_id']} -> {item['count']}件\n"
        
        # Discord webhook メッセージを作成
        embed = {
            "title": "📊 動画数・未処理アカウント数チェック結果",
            "description": f"期間: {start_date} 〜 {end_date}",
            "color": 3447003,  # 青色
            "fields": [
                {
                    "name": "📹 動画数 上位5アカウント",
                    "value": "\n".join([f"ID: {item['crawler_account_id']} -> {item['video_count']}件" for item in top_video_accounts]) if top_video_accounts else "データなし",
                    "inline": False
                }
            ],
            "footer": {
                "text": "TikTok Analytics - Video Count & Unprocessed Account Check"
            },
            "timestamp": datetime.now().isoformat()
        }
        
        # 未処理アカウント数は全件表示（個別データのみ、集計概要なし）
        if len(unprocessed_details_text) < 1000:
            embed["fields"].append({
                "name": "⏳ 未処理アカウント数（crawler_account_id毎）",
                "value": f"```\n{unprocessed_details_text}```",
                "inline": False
            })
        else:
            # データが長すぎる場合は複数のフィールドに分割
            chunks = []
            current_chunk = ""
            for line in unprocessed_details_text.split('\n'):
                if len(current_chunk + line + '\n') > 950:  # 余裕を持って950文字で区切り
                    if current_chunk:
                        chunks.append(current_chunk)
                        current_chunk = line + '\n'
                    else:
                        chunks.append(line[:950])  # 1行が長すぎる場合
                else:
                    current_chunk += line + '\n'
            
            if current_chunk:
                chunks.append(current_chunk)
            
            # 各チャンクをフィールドとして追加
            for i, chunk in enumerate(chunks):
                field_name = f"⏳ 未処理アカウント数（{i+1}/{len(chunks)}）"
                embed["fields"].append({
                    "name": field_name,
                    "value": f"```\n{chunk}```",
                    "inline": False
                })
        
        # 動画数詳細データの追加
        if len(video_details_text) < 500:
            embed["fields"].append({
                "name": "📹 動画数全データ",
                "value": f"```\n{video_details_text}```",
                "inline": False
            })
        else:
            embed["fields"].append({
                "name": "📹 動画数データ詳細",
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
                    logger.info(f"Discordに動画数・未処理アカウント数チェック結果を送信しました: 動画数{total_accounts}アカウント({total_videos}動画), 未処理{unprocessed_account_count}クローラー({total_unprocessed}アカウント)")
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

# 追加: 2日前〜当日(既存ロジックと同じ境界)の video_heavy_raw_data から必須項目の空/Null件数を集計してDiscord通知

def blank_field_check():
    """
    video_heavy_raw_data と account_list を結合し、
    2日前から当日までの v.post_time を対象に必須項目のブランク/Null件数を
    crawler_account_id ごとに集計してDiscordに送信する
    """
    logger.info("==== ブランク/Null項目チェック処理の開始 ====")
    try:
        jst = timezone('Asia/Tokyo')
        current_date = datetime.now(jst)
        start_date = (current_date - timedelta(days=2)).strftime('%Y-%m-%d')
        end_date = (current_date).strftime('%Y-%m-%d')

        logger.info(f"チェック対象期間(ブランク/Null): {start_date} 〜 {end_date}")

        blank_counts = get_blank_field_counts_by_crawler_account(start_date, end_date)
        send_discord_blank_field_report(blank_counts, start_date, end_date)

        logger.info("ブランク/Null項目チェックが完了しました")
        return {
            "status": "success",
            "count_groups": len(blank_counts),
            "start_date": start_date,
            "end_date": end_date,
            "time": datetime.now().isoformat()
        }
    except Exception as e:
        error_message = f"ブランク/Null項目チェック処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        send_discord_error(error_message)
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    finally:
        logger.info("==== ブランク/Null項目チェック処理の終了 ====")


def get_blank_field_counts_by_crawler_account(start_date: str, end_date: str):
    """
    指定期間における必須項目のブランク/Null件数を crawler_account_id ごとに集計
    """
    logger.info("==== crawler_account_idごとのブランク/Null件数取得開始 ====")
    try:
        query = """
        SELECT
            al.crawler_account_id,
            SUM(CASE WHEN v.user_nickname IS NULL OR TRIM(v.user_nickname) = '' THEN 1 ELSE 0 END) AS user_nickname_blank,
            SUM(CASE WHEN v.video_thumbnail_url IS NULL OR TRIM(v.video_thumbnail_url) = '' THEN 1 ELSE 0 END) AS video_thumbnail_url_blank,
            SUM(CASE WHEN v.video_title IS NULL OR TRIM(v.video_title) = '' THEN 1 ELSE 0 END) AS video_title_blank,
            SUM(CASE WHEN v.post_time_text IS NULL OR TRIM(v.post_time_text) = '' THEN 1 ELSE 0 END) AS post_time_text_blank,
            SUM(CASE WHEN v.audio_info_text IS NULL OR TRIM(v.audio_info_text) = '' THEN 1 ELSE 0 END) AS audio_info_text_blank,
            COUNT(v.id) AS total_rows
        FROM
            video_heavy_raw_data AS v
        JOIN
            account_list AS al
              ON al.favorite_user_username COLLATE utf8mb4_0900_ai_ci = v.user_username
        WHERE
            v.post_time >= %s
            AND v.post_time < %s
        GROUP BY
            al.crawler_account_id
        ORDER BY
            al.crawler_account_id
        """
        results = execute_query(query, (start_date, end_date))
        logger.info(f"ブランク/Null件数集計完了: {len(results)}件のcrawler_account_id")
        return results
    except Exception as e:
        error_message = f"ブランク/Null件数集計中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        raise e


def send_discord_blank_field_report(blank_counts, start_date: str, end_date: str):
    """
    ブランク/Null件数の集計結果をDiscordに通知
    """
    try:
        # 環境変数があれば専用Webhook、無ければ動画数チェックのWebhookを流用
        secret_name = os.getenv('VIDEO_FIELD_CHECK_DISCORD_WEBHOOK_SECRET', 'video-count-check-discord-webhook')
        try:
            discord_webhook_url = get_secret(secret_name)
        except Exception as e:
            logger.warning(f"Discord Webhook URLのSecret取得に失敗しました ({secret_name}): {str(e)}")
            return

        # 合計サマリ
        total_user_nickname = sum(item['user_nickname_blank'] for item in blank_counts) if blank_counts else 0
        total_thumbnail = sum(item['video_thumbnail_url_blank'] for item in blank_counts) if blank_counts else 0
        total_title = sum(item['video_title_blank'] for item in blank_counts) if blank_counts else 0
        total_post_text = sum(item['post_time_text_blank'] for item in blank_counts) if blank_counts else 0
        total_audio = sum(item['audio_info_text_blank'] for item in blank_counts) if blank_counts else 0

        # 詳細行（crawler_account_id毎）
        details_lines = []
        for item in sorted(blank_counts, key=lambda x: x['crawler_account_id']):
            details_lines.append(
                f"ID:{item['crawler_account_id']} | "
                f"nickname:{item['user_nickname_blank']} "
                f"thumb:{item['video_thumbnail_url_blank']} "
                f"title:{item['video_title_blank']} "
                f"post_text:{item['post_time_text_blank']} "
                f"audio:{item['audio_info_text_blank']} "
                f"/ total:{item['total_rows']}"
            )
        details_text = "\n".join(details_lines)

        embed = {
            "title": "🧪 必須項目の空/Nullチェック結果",
            "description": f"期間: {start_date} 〜 {end_date}",
            "color": 15158332,  # 赤系
            "fields": [
                {
                    "name": "合計",
                    "value": (
                        f"nickname:{total_user_nickname}, "
                        f"thumb:{total_thumbnail}, "
                        f"title:{total_title}, "
                        f"post_text:{total_post_text}, "
                        f"audio:{total_audio}"
                    ),
                    "inline": False
                }
            ],
            "footer": {"text": "TikTok Analytics - Blank/Null Field Check"},
            "timestamp": datetime.now().isoformat()
        }

        # 詳細が長い場合は分割
        if len(details_text) <= 1000:
            embed["fields"].append({
                "name": "明細（crawler_account_id毎）",
                "value": f"```\n{details_text}```",
                "inline": False
            })
        else:
            chunk = ""
            chunks = []
            for line in details_lines:
                if len(chunk) + len(line) + 1 > 950:
                    if chunk:
                        chunks.append(chunk)
                        chunk = line + "\n"
                    else:
                        chunks.append(line[:950])
                else:
                    chunk += line + "\n"
            if chunk:
                chunks.append(chunk)
            for i, c in enumerate(chunks, 1):
                embed["fields"].append({
                    "name": f"明細 分割({i}/{len(chunks)})",
                    "value": f"```\n{c}```",
                    "inline": False
                })

        payload = {"embeds": [embed]}

        timeout = int(os.getenv('DISCORD_TIMEOUT', '10'))
        max_retries = int(os.getenv('DISCORD_MAX_RETRIES', '3'))

        for attempt in range(max_retries):
            try:
                response = requests.post(
                    discord_webhook_url,
                    json=payload,
                    headers={'Content-Type': 'application/json'},
                    timeout=timeout
                )
                if response.status_code == 204:
                    logger.info("Discordにブランク/Null項目チェック結果を送信しました")
                    return
                else:
                    logger.warning(f"Discord通知の送信失敗 (試行{attempt + 1}/{max_retries}): {response.status_code}")
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
        logger.error(f"Discord通知送信中にエラーが発生しました: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

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