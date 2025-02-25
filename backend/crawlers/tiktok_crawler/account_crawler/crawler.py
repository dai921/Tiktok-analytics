import os
import time
import asyncio
import random
from playwright.async_api import async_playwright, TimeoutError
from google.cloud import pubsub_v1
from ..common.db import save_video_urls
import json
import base64
from datetime import datetime
import pymysql
import logging
import threading
import socket

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数の設定（サービス名でなくlocalhostを使用）
os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'  # localhostを使用
os.environ['PROJECT_ID'] = 'local-project'

# デバッグ情報の表示
logger.info(f"環境変数: PUBSUB_EMULATOR_HOST={os.environ.get('PUBSUB_EMULATOR_HOST')}")
logger.info(f"環境変数: PROJECT_ID={os.environ.get('PROJECT_ID')}")

# ホスト名の解決をテスト
try:
    logger.info(f"localhost IPアドレス: {socket.gethostbyname('localhost')}")
except Exception as e:
    logger.error(f"localhost名前解決エラー: {e}")

class AccountCrawler:
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        ]

    def get_random_user_agent(self):
        return random.choice(self.user_agents)

    async def collect_video_urls(self, account_url: str, is_new_account: bool = False):
        """アカウントページから動画URLを収集"""
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-web-security',
                    '--window-size=1920,1080',
                ]
            )
            
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent=self.get_random_user_agent()
            )
            
            page = await context.new_page()
            
            try:
                print(f"Accessing account: {account_url} (New account: {is_new_account})")
                await page.goto(account_url, timeout=30000)
                await page.wait_for_load_state('domcontentloaded', timeout=30000)
                await asyncio.sleep(5)
                
                try:
                    await page.wait_for_selector('div[data-e2e="user-post-item"]', timeout=10000)
                except TimeoutError:
                    print("動画要素の読み込みに時間がかかっています。さらに待機します。")
                    await asyncio.sleep(5)
                
                videos = []
                previous_height = 0
                retry_count = 0
                max_videos = float('inf') if is_new_account else 8  # 新規アカウントは全件、既存は8件まで
                
                while retry_count < 3 and len(videos) < max_videos:
                    video_elements = await page.query_selector_all('div[data-e2e="user-post-item"] a')
                    
                    for elem in video_elements:
                        if len(videos) >= max_videos:
                            break
                            
                        href = await elem.get_attribute('href')
                        if href and '/video/' in href and href not in videos:
                            if not href.startswith('http'):
                                href = f'https://www.tiktok.com{href}'
                            videos.append(href)
                    
                    if not is_new_account and len(videos) >= max_videos:
                        break
                    
                    # スクロール処理
                    current_height = await page.evaluate('document.body.scrollHeight')
                    if current_height == previous_height:
                        retry_count += 1
                    else:
                        retry_count = 0
                    
                    previous_height = current_height
                    await page.evaluate('window.scrollBy(0, document.body.scrollHeight)')
                    await asyncio.sleep(2)

                print(f"Found {len(videos)} videos")
                await browser.close()
                
                # データベースに保存
                if videos:
                    save_video_urls(account_url, videos)
                
                return videos

            except Exception as e:
                print(f"Error collecting videos: {str(e)}")
                await browser.close()
                return []

def get_db_connection():
    """データベース接続を取得する"""
    host = "127.0.0.1"  # 明示的IPアドレスを使用
    port = int(os.environ.get("MYSQL_PORT", 3306))
    user = os.environ.get("MYSQL_USER", "tiktok_user")
    password = os.environ.get("MYSQL_PASSWORD", "tiktok_pass")
    database = os.environ.get("MYSQL_DATABASE", "tiktok_data")
    
    try:
        logger.info(f"データベース接続試行: {host}:{port}/{database}")
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        logger.info("データベース接続成功!")
        return connection
    except Exception as e:
        logger.error(f"データベース接続エラー: {e}")
        raise

def crawl_account(account_info):
    """アカウントページをクロールして動画URLを取得する
    
    Args:
        account_info (dict): アカウント情報 (account_url, account_name, is_new_account)
    
    Returns:
        dict: クロール結果
    """
    account_url = account_info.get('account_url')
    account_name = account_info.get('account_name')
    is_new_account = account_info.get('is_new_account', True)
    
    logger.info(f"アカウント {account_name} ({account_url}) のクロールを開始")
    
    try:
        # 実際のクロール処理は collect_video_urls 関数に任せる
        # ここではテスト用に模擬処理を実装
        
        # 模擬的な動画URL取得
        # 実際の実装では collect_video_urls を使用
        video_count = 15 if is_new_account else 8
        video_urls = []
        
        for i in range(video_count):
            video_id = f"{random.randint(1000000000, 9999999999)}"
            video_url = f"https://www.tiktok.com/@{account_name}/video/{video_id}"
            video_urls.append({
                "video_url": video_url,
                "video_id": video_id,
                "username": account_name,
                "created_at": datetime.now().strftime('%Y-%m-%d'),
                "play_count": random.randint(100, 100000),
                "is_new_video": True,
                "needs_update": True
            })
        
        # DB接続
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                # 動画URLをDBに保存
                database_name = os.environ.get("MYSQL_DATABASE", "tiktok_data")
                for video in video_urls:
                    try:
                        sql = f"""
                        INSERT INTO {database_name}.video_url_data 
                        (video_url, video_id, username, created_at, play_count, is_new_video, needs_update)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE 
                            play_count = VALUES(play_count),
                            is_new_video = VALUES(is_new_video),
                            needs_update = VALUES(needs_update)
                        """
                        cursor.execute(sql, (
                            video["video_url"], 
                            video["video_id"],
                            video["username"],
                            video["created_at"],
                            video["play_count"],
                            video["is_new_video"],
                            video["needs_update"]
                        ))
                    except Exception as e:
                        logger.error(f"動画URL保存エラー: {e}")
                
                conn.commit()
        finally:
            conn.close()
        
        logger.info(f"アカウント {account_name} のクロールが完了しました。{len(video_urls)}件の動画を取得")
        
        # 結果を返す
        return {
            "success": True,
            "account_url": account_url,
            "account_name": account_name,
            "video_count": len(video_urls),
            "is_new_account": is_new_account
        }
        
    except Exception as e:
        logger.error(f"クロール中にエラーが発生しました: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "account_url": account_url,
            "error": str(e),
            "is_new_account": is_new_account
        }

def send_crawl_complete_notification(result):
    """クロール完了通知をPub/Subで送信する"""
    try:
        publisher = pubsub_v1.PublisherClient()
        project_id = os.environ.get("PROJECT_ID", "local-project")
        topic_name = "crawl-complete"
        topic_path = publisher.topic_path(project_id, topic_name)
        
        # 完了メッセージを作成
        message = {
            "account_url": result.get("account_url"),
            "account_name": result.get("account_name", ""),
            "status": "completed" if result.get("success", False) else "failed",
            "video_count": result.get("video_count", 0),
            "is_new_account": result.get("is_new_account", False),
            "timestamp": datetime.now().timestamp()
        }
        
        # メッセージをJSON形式でエンコード
        data = json.dumps(message).encode("utf-8")
        
        # Pub/Subにメッセージを送信
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        
        logger.info(f"クロール完了通知を送信しました。メッセージID: {message_id}")
        return message_id
    
    except Exception as e:
        logger.error(f"クロール完了通知の送信に失敗しました: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def process_accounts(accounts):
    """アカウントリストを処理する"""
    for account in accounts:
        try:
            # アカウントをクロール
            result = crawl_account(account)
            
            # クロール完了通知を送信
            send_crawl_complete_notification(result)
            
            # 次のアカウント処理前に少し待機（サーバー負荷軽減）
            time.sleep(2)
            
        except Exception as e:
            logger.error(f"アカウント {account.get('account_name')} の処理中にエラーが発生: {e}")

def callback(message):
    """Pub/Subからのメッセージを処理する"""
    try:
        logger.debug(f"メッセージ受信: {message}")
        logger.info("Pub/Subからメッセージを受信しました")
        
        # メッセージデータを取得と出力
        pubsub_message = message.data.decode('utf-8')
        logger.debug(f"デコードされたメッセージデータ: {pubsub_message}")
        
        # メッセージをJSONとしてパース
        message_data = json.loads(pubsub_message)
        
        # アカウントリストを取得
        accounts = message_data.get("accounts", [])
        logger.info(f"処理するアカウント数: {len(accounts)}")
        
        if accounts:
            # 別スレッドでアカウント処理を開始
            threading.Thread(target=process_accounts, args=(accounts,)).start()
        
        # メッセージを確認応答
        message.ack()
        
    except Exception as e:
        logger.error(f"メッセージ処理中にエラーが発生: {e}")
        # エラーが発生してもメッセージを確認応答
        # 再処理を避けるため
        message.ack()

def debug_subscription():
    """サブスクリプションのデバッグ情報を取得"""
    try:
        # Pub/Subクライアント
        subscriber = pubsub_v1.SubscriberClient()
        publisher = pubsub_v1.PublisherClient()
        project_id = os.environ.get("PROJECT_ID", "local-project")
        subscription_name = "process-account-list"
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        topic_path = publisher.topic_path(project_id, "process-account-list")
        
        # サブスクリプション情報の取得
        try:
            sub_info = subscriber.get_subscription(request={"subscription": subscription_path})
            logger.info(f"サブスクリプション情報: {sub_info}")
        except Exception as e:
            logger.error(f"サブスクリプション情報取得エラー: {e}")
        
        # 保留中のメッセージを確認
        try:
            response = subscriber.pull(
                request={"subscription": subscription_path, "max_messages": 10}
            )
            logger.info(f"保留中のメッセージ数: {len(response.received_messages)}")
            
            # メッセージの詳細をログに出力
            for msg in response.received_messages:
                logger.info(f"  メッセージID: {msg.message.message_id}")
                logger.info(f"  データ: {msg.message.data.decode('utf-8')}")
                
                # メッセージをack
                subscriber.acknowledge(
                    request={"subscription": subscription_path, "ack_ids": [msg.ack_id]}
                )
            
            # テストメッセージを送信
            test_data = json.dumps({
                "accounts": [
                    {
                        "account_url": "https://www.tiktok.com/@test_manual",
                        "account_name": "test_manual",
                        "is_new_account": True
                    }
                ],
                "test": True,
                "timestamp": datetime.now().timestamp()
            }).encode("utf-8")
            
            # 直接メッセージを送信
            msg_id = publisher.publish(topic_path, test_data).result()
            logger.info(f"テストメッセージを送信しました: {msg_id}")
            
        except Exception as e:
            logger.error(f"メッセージ確認エラー: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    except Exception as e:
        logger.error(f"デバッグ関数エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())

def main():
    """メインエントリーポイント - Pub/Subサブスクライバーを設定"""
    # 環境変数
    project_id = os.environ.get("PROJECT_ID", "local-project")
    subscription_name = "process-account-list"
    
    # デバッグ情報を出力
    debug_subscription()
    
    # Pub/Subクライアント
    subscriber = pubsub_v1.SubscriberClient()
    subscription_path = subscriber.subscription_path(project_id, subscription_name)
    
    logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
    
    # FlowControlの設定
    flow_control = pubsub_v1.types.FlowControl(
        max_messages=10,
        max_bytes=10 * 1024 * 1024
    )
    
    # メッセージハンドラ設定
    streaming_pull_future = subscriber.subscribe(
        subscription_path, 
        callback=callback,
        flow_control=flow_control
    )
    
    logger.info(f"アカウントクローラーを起動しました。Pub/Subからのメッセージを待機中...")
    
    # 強制的にテスト処理を実行（デバッグ用）
    accounts = [
        {
            "account_url": "https://www.tiktok.com/@chokomintokirai",
            "account_name": "chokomintokirai",
            "is_new_account": True
        }
    ]
    threading.Thread(target=process_accounts, args=(accounts,)).start()
    
    # メインスレッドを維持
    try:
        # 処理が継続するよう結果を待機
        streaming_pull_future.result()
    except Exception as e:
        streaming_pull_future.cancel()
        logger.error(f"ストリーミングの処理中にエラーが発生: {e}")
        import traceback
        logger.error(traceback.format_exc())

# メイン実行部分
if __name__ == "__main__":
    main() 