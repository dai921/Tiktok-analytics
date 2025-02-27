import os
import time
import asyncio
import random
from playwright.async_api import async_playwright, TimeoutError
from google.cloud import pubsub_v1
from tiktok_crawler.common.db import save_video_urls
import json
import base64
from datetime import datetime
import pymysql
import logging
import threading
import socket
import sys

# ロギングの設定を強化
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# 起動時のデバッグ情報を追加
logger.info("=== Account Crawler Starting ===")
logger.info(f"Python Version: {sys.version}")
logger.info(f"Current Directory: {os.getcwd()}")
logger.info(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")

# 環境変数の設定（Docker環境用）
pubsub_host = os.environ.get('PUBSUB_EMULATOR_HOST', 'pubsub:8681')  # Dockerサービス名を使用
project_id = os.environ.get('PROJECT_ID', 'local-project')

# デバッグ情報の表示
logger.info(f"環境変数: PUBSUB_EMULATOR_HOST={pubsub_host}")
logger.info(f"環境変数: PROJECT_ID={project_id}")

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
                processed_videos = []
                previous_height = 0
                retry_count = 0
                max_videos = float('inf') if is_new_account else 8
                
                while retry_count < 3 and len(videos) < max_videos:
                    video_elements = await page.query_selector_all('div[data-e2e="user-post-item"] a')
                    
                    for elem in video_elements:
                        if len(videos) >= max_videos:
                            break
                            
                        href = await elem.get_attribute('href')
                        if href and ('/video/' in href or '/photo/' in href) and href not in videos:
                            if not href.startswith('http'):
                                href = f'https://www.tiktok.com{href}'
                            
                            # video_idまたはphoto_idを抽出
                            content_id = None
                            if '/video/' in href:
                                content_id = href.split('/video/')[1]
                            elif '/photo/' in href:
                                content_id = href.split('/photo/')[1]
                            
                            # クエリパラメータがある場合は除去
                            if content_id and '?' in content_id:
                                content_id = content_id.split('?')[0]
                            
                            # シンプルにURLを追加
                            videos.append(href)
                            processed_videos.append(href)  # video_urlをそのまま追加
                    
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

                # 動画URL取得後にusernameを設定
                username = account_url.split('@')[-1]
                
                # データベースに保存
                connection = get_db_connection()
                try:
                    if save_video_urls(connection, processed_videos, username):
                        print(f"Found {len(processed_videos)} videos/photos")
                        return processed_videos
                    else:
                        print("Error saving URLs")
                        return []
                finally:
                    connection.close()
                
            except Exception as e:
                print(f"Error collecting content: {e}")
                return []

    async def crawl_account(self, account):
        """アカウントのクローリングを実行"""
        try:
            logger.info(f"アカウント {account.get('account_name')} ({account.get('account_url')}) のクロールを開始")
            
            video_urls = await self.collect_video_urls(
                account.get('account_url'),
                account.get('is_new_account', False)
            )
            
            # データベースに保存
            connection = get_db_connection()
            try:
                # video_urlsは単純な文字列のリストなので、そのまま渡す
                if save_video_urls(connection, video_urls, account.get('account_name')):
                    logger.info(f"Found {len(video_urls)} videos/photos")
                    return {
                        "success": True,
                        "account_url": account.get('account_url'),
                        "video_count": len(video_urls),
                        "is_new_account": account.get('is_new_account', False)
                    }
            finally:
                connection.close()
            
        except Exception as e:
            logger.error(f"クロール中にエラーが発生しました: {e}")
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "account_url": account.get('account_url'),
                "error": str(e),
                "is_new_account": account.get('is_new_account', False)
            }

async def crawl_account(account_info):
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
        # AccountCrawlerインスタンスを作成
        crawler = AccountCrawler()
        
        # 実際のクローリング処理を実行
        result = await crawler.crawl_account(account_info)
        
        # 結果を返す
        return result
        
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

def get_db_connection():
    """データベース接続を取得"""
    try:
        logger.info(f"データベース接続試行: {os.environ.get('MYSQL_HOST')}:{os.environ.get('MYSQL_PORT')}/{os.environ.get('MYSQL_DATABASE')}")
        
        # Docker環境用のホスト設定
        connection = pymysql.connect(
            host=os.environ.get('MYSQL_HOST', 'host.docker.internal'),  # Docker環境用のホスト
            port=int(os.environ.get('MYSQL_PORT', 3306)),
            user=os.environ.get('MYSQL_USER', 'tiktok_user'),
            password=os.environ.get('MYSQL_PASSWORD', 'tiktok_pass'),
            database=os.environ.get('MYSQL_DATABASE', 'tiktok_data'),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        return connection
    except Exception as e:
        logger.error(f"データベース接続エラー: {e}")
        raise

def send_crawl_complete_notification(result):
    """クロール完了通知をPub/Subで送信する"""
    try:
        publisher = pubsub_v1.PublisherClient()
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

async def process_accounts(accounts):
    """アカウントリストを処理する"""
    results = []
    
    for account in accounts:
        try:
            # アカウントをクロール
            result = await crawl_account(account)
            results.append(result)
            
            # クロール完了通知を送信
            send_crawl_complete_notification(result)
            
            # 次のアカウント処理前に少し待機（サーバー負荷軽減）
            time.sleep(2)
            
        except Exception as e:
            logger.error(f"アカウント {account.get('account_name')} の処理中にエラーが発生: {e}")
            results.append({
                "success": False,
                "account_url": account.get('account_url'),
                "account_name": account.get('account_name'),
                "error": str(e),
                "is_new_account": account.get('is_new_account', False)
            })
    
    return results

async def process_account_message(message):
    """メッセージを処理する"""
    try:
        logger.info(f"=== メッセージ受信開始 ===")
        logger.info(f"メッセージID: {message.message_id}")
        
        # メッセージデータをデコード
        data = json.loads(message.data.decode('utf-8'))
        logger.info(f"受信データ: {data}")
        
        # アカウントリストを取得
        accounts = data.get('accounts', [])
        logger.info(f"処理対象アカウント数: {len(accounts)}")
        
        # 各アカウントを処理
        for account in accounts:
            logger.info(f"アカウント処理開始: {account}")
            try:
                # クローリング処理を実行
                result = await crawl_account(account)
                logger.info(f"クローリング結果: {result}")
                
                # クロール完了通知を送信
                send_crawl_complete_notification(result)
                logger.info(f"完了通知を送信しました: {account}")
                
            except Exception as e:
                logger.error(f"アカウント処理エラー ({account}): {e}")
                continue
        
        # メッセージを確認応答
        message.ack()
        logger.info("=== メッセージ処理完了 ===")
        
    except Exception as e:
        logger.error(f"メッセージ処理エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # エラー時もメッセージを確認応答（重複処理を防ぐ）
        message.ack()

def setup_subscription():
    """サブスクリプションをセットアップする"""
    try:
        subscriber = pubsub_v1.SubscriberClient()
        subscription_path = subscriber.subscription_path(project_id, "process-account-list")
        
        logger.info(f"サブスクリプション設定開始: {subscription_path}")
        logger.info(f"Pub/Subエミュレータ接続: {os.environ.get('PUBSUB_EMULATOR_HOST')}")
        
        # 非同期処理用のイベントループを取得
        loop = asyncio.get_event_loop()
        
        # コールバックラッパー
        def callback(message):
            loop.run_until_complete(process_account_message(message))
        
        # サブスクリプションの設定
        streaming_pull_future = subscriber.subscribe(
            subscription_path,
            callback=callback
        )
        
        logger.info("サブスクリプション設定完了 - メッセージ待機中...")
        
        # メッセージ待機
        streaming_pull_future.result()
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise

if __name__ == "__main__":
    logger.info("=== Account Crawler 起動 ===")
    logger.info(f"環境変数:")
    logger.info(f"- PUBSUB_EMULATOR_HOST: {os.environ.get('PUBSUB_EMULATOR_HOST')}")
    logger.info(f"- PROJECT_ID: {os.environ.get('PROJECT_ID')}")
    
    try:
        setup_subscription()
    except KeyboardInterrupt:
        logger.info("プログラムを終了します")
    except Exception as e:
        logger.error(f"予期せぬエラー: {e}")
        import traceback
        logger.error(traceback.format_exc()) 