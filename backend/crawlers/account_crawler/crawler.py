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
from typing import Dict, Any
from flask import Flask, request, Response
import jwt
import time

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
# pubsub_host = os.environ.get('PUBSUB_EMULATOR_HOST', 'pubsub:8681')  # コメントアウト: ローカル環境用
project_id = os.environ.get('PROJECT_ID','tiktok-analytics-prod-451609')

# デバッグ情報の表示
# logger.info(f"環境変数: PUBSUB_EMULATOR_HOST={pubsub_host}")  # コメントアウト: ローカル環境用
logger.info(f"環境変数: PROJECT_ID={project_id}")

# ホスト名の解決をテスト
try:
    logger.info(f"localhost IPアドレス: {socket.gethostbyname('localhost')}")
except Exception as e:
    logger.error(f"localhost名前解決エラー: {e}")

# Flaskアプリケーションの初期化
app = Flask(__name__)

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
                logger.info(f"アカウントにアクセス: {account_url} (新規アカウント: {is_new_account})")
                await page.goto(account_url, timeout=30000)
                await page.wait_for_load_state('domcontentloaded', timeout=30000)
                # より長い待機時間を設定
                await asyncio.sleep(5)  # get_video_urlsと同じ5秒待機
                
                # デッドリンクチェック
                dead_link_texts = [
                    "このアカウントは見つかりませんでした",
                    "Couldn't find this account"
                ]
                
                logger.info("デッドリンクチェックを開始します")
                try:
                    # セレクタでデッドリンクを確認
                    selectors = ['p.css-1y4x9xk-PTitle', 'p.css-1ovqurc-PTitle.emuynwa1']
                    for selector in selectors:
                        try:
                            element = await page.wait_for_selector(selector, timeout=1000)
                            if element:
                                text = await element.text_content()
                                logger.info(f"セレクタのテキスト: {text}")
                                if any(dead_text in text for dead_text in dead_link_texts):
                                    logger.info(f"削除済みアカウントを検出（セレクタ）: {account_url}")
                                    return {
                                        "success": False,
                                        "account_url": account_url,
                                        "status": "deleted_account",
                                        "video_count": 0,
                                        "is_new_account": is_new_account,
                                        "videos": []
                                    }
                        except TimeoutError:
                            continue
                except Exception as e:
                    logger.warning(f"デッドリンク確認中に予期せぬエラー: {e}")

                # 動画要素の確認 - get_video_urlsのような粘り強い待機
                try:
                    await page.wait_for_selector('div[data-e2e="user-post-item"]', timeout=10000)
                except TimeoutError:
                    logger.info("動画要素の読み込みに時間がかかっています。さらに待機します。")
                    await asyncio.sleep(5)  # さらに5秒待機
                
                # 新規アカウントの場合は全件取得、既存アカウントは制限付き
                max_videos = float('inf') if is_new_account else 8  # 既存アカウントでも少し多めに
                
                logger.info(f"動画収集を開始: {account_url}")
                
                videos = []
                processed_videos = []
                previous_height = 0
                retry_count = 0
                
                while retry_count < 3 and len(videos) < max_videos:
                    try:
                        # 動画要素の取得
                        video_elements = await page.query_selector_all('div[data-e2e="user-post-item"] a')
                        
                        for elem in video_elements:
                            if len(videos) >= max_videos:
                                break
                                
                            href = await elem.get_attribute('href')
                            if href and ('/video/' in href or '/photo/' in href):
                                # 重複チェック
                                    if not href.startswith('http'):
                                        href = f'https://www.tiktok.com{href}'
                                        
                                    # video_idの抽出
                                    video_id = None
                                    if '/video/' in href:
                                        video_id = href.split('/video/')[-1].split('?')[0]
                                    elif '/photo/' in href:
                                        video_id = href.split('/photo/')[-1].split('?')[0]
                                        
                                    video_info = {
                                        'url': href,
                                        'video_id': video_id,
                                        'type': 'video' if '/video/' in href else 'photo'
                                    }
                                    videos.append(video_info)
                                    processed_videos.append(video_info)
                        if not is_new_account and len(videos) >= max_videos:
                            break
                        # スクロールの制御と終了条件のチェック
                        current_height = await page.evaluate('document.body.scrollHeight')
                        if current_height == previous_height:
                            retry_count += 1
                            # 同じ高さでも少し待機を長くして追加読み込みのチャンスを与える
                            await asyncio.sleep(3)
                            
                            # スクロール位置を少し上下させてTikTokのロード検出を促進
                            await page.evaluate('window.scrollBy(0, -100)')
                            await asyncio.sleep(1)
                            await page.evaluate('window.scrollBy(0, 150)')
                        else:
                            retry_count = 0
                        
                        previous_height = current_height
                        
                        # スクロール方法の改善 - より確実に下部まで移動させる
                        await page.evaluate('''
                            window.scrollTo({
                                top: document.body.scrollHeight,
                                behavior: 'smooth'
                            });
                        ''')
                        
                        # スクロール待機時間を延長
                        await asyncio.sleep(5)  # 3秒から5秒に延長
                        
                        # 追加：30件以上収集できた場合はログを出力
                        if len(videos) > 30 and len(videos) % 10 == 0:
                            logger.info(f"現在 {len(videos)} 件の動画を収集中...")
                        
                    except Exception as e:
                        logger.error(f"スクロール中にエラー: {e}")
                        retry_count += 1
                        await asyncio.sleep(2)
                
                logger.info(f"動画収集完了: {len(videos)}件")

                # アカウントURLからユーザー名を抽出
                try:
                    username = account_url.split('@')[-1].split('?')[0]
                    if not username:
                        logger.warning(f"URLからユーザー名を抽出できませんでした: {account_url}")
                except Exception as e:
                    logger.warning(f"ユーザー名の取得に失敗: {e}")
                    username = None

                # 正常なアカウントとして処理を完了
                return {
                    "success": True,
                    "account_url": account_url,
                    "status": "success",
                    "video_count": len(processed_videos),
                    "is_new_account": is_new_account,
                    "username": username,
                    "videos": processed_videos
                }
                
            except Exception as e:
                logger.error(f"コンテンツ収集中にエラー: {e}")
                return {
                    "success": False,
                    "account_url": account_url,
                    "status": "error",
                    "error": str(e),
                    "video_count": 0,
                    "is_new_account": is_new_account,
                    "videos": []
                }
            finally:
                await context.close()
                await browser.close()

    async def crawl_account(self, account_info: dict):
        """アカウントのクローリングを実行"""
        try:
            account_url = account_info.get('account_url')
            account_name = account_info.get('account_name')
            is_new_account = account_info.get('is_new_account')
            
            logger.info(f"アカウント {account_name} ({account_url}) のクロールを開始")
            
            # 動画URL収集
            result = await self.collect_video_urls(account_url, is_new_account)
            
            if result["success"]:
                # データベースに保存
                connection = get_db_connection()
                try:
                    if save_video_urls(connection, result["videos"], result["username"]):
                        logger.info(f"{len(result['videos'])} 件の動画/写真を保存しました")
                finally:
                    connection.close()
            
            # 結果を返す（Pub/Sub通知用）
            return {
                "success": result["success"],
                "account_url": account_url,
                "account_name": account_name,
                "status": result["status"],
                "video_count": result["video_count"],
                "is_new_account": is_new_account,
                "error": result.get("error")
            }
            
        except Exception as e:
            logger.error(f"クロール中にエラーが発生しました: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "account_url": account_url,
                "account_name": account_name,
                "status": "error",
                "error": str(e),
                "is_new_account": is_new_account,
                "video_count": 0
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
    is_new_account = account_info.get('is_new_account')
    
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
        
        # Docker環境用のホスト設定から本番環境用に修正
        connection = pymysql.connect(
            host=os.environ.get('MYSQL_HOST'),  # デフォルト値を削除
            port=int(os.environ.get('MYSQL_PORT', 3306)),
            user=os.environ.get('MYSQL_USER'),  # デフォルト値を削除
            password=os.environ.get('MYSQL_PASSWORD'),  # デフォルト値を削除
            database=os.environ.get('MYSQL_DATABASE'),  # デフォルト値を削除
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

async def process_message(message) -> None:
    """メッセージを処理する"""
    try:
        message_data = json.loads(message.data.decode('utf-8'))
        logger.info(f"受信したメッセージ: {message_data}")
        
        accounts = message_data.get("accounts", [])
        processing_info = message_data.get("processing_info")
        
        crawler = AccountCrawler()  # クローラーインスタンスを作成
        
        # アカウントリストの全件数を取得
        total_accounts = len(accounts)
        
        for i, account in enumerate(accounts):
            try:
                # クローリング処理
                result = await crawler.crawl_account(account)
                
                # 完了通知メッセージの作成と送信
                complete_message = {
                    "account_url": account["account_url"],
                    "account_name": account["account_name"],
                    "account_id": account["account_id"],
                    "is_new_account": account["is_new_account"],
                    "status": result.get("status", "failed"),
                    "video_count": result.get("video_count", 0),
                    "timestamp": datetime.now().isoformat()
                }
                
                # 最後のアカウントの場合、processing_infoを含める
                if i == total_accounts - 1 and processing_info:
                    complete_message["processing_info"] = processing_info
                
                # Pub/Subにメッセージを送信
                publisher = pubsub_v1.PublisherClient()
                topic_path = publisher.topic_path(project_id, "crawl-complete")
                
                future = publisher.publish(
                    topic_path,
                    json.dumps(complete_message).encode("utf-8")
                )
                message_id = future.result()
                logger.info(f"クロール完了通知を送信: {message_id}")
                
            except Exception as e:
                logger.error(f"アカウント処理中にエラー: {str(e)}")
                # エラー通知の送信
                error_message = {
                    "account_url": account["account_url"],
                    "account_name": account["account_name"],
                    "account_id": account["account_id"],
                    "is_new_account": account["is_new_account"],
                    "status": "failed",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }
                
                # 最後のアカウントの場合、processing_infoを含める
                if i == total_accounts - 1 and processing_info:
                    error_message["processing_info"] = processing_info
                
                publisher = pubsub_v1.PublisherClient()
                topic_path = publisher.topic_path(project_id, "crawl-complete")
                future = publisher.publish(
                    topic_path,
                    json.dumps(error_message).encode("utf-8")
                )
                message_id = future.result()
                logger.error(f"エラー通知を送信: {message_id}")
        
        message.ack()
                
    except Exception as e:
        logger.error(f"メッセージ処理中にエラー: {str(e)}")
        message.nack()
        raise

def verify_pubsub_token(request):
    """Pub/Subメッセージの認証を検証"""
    try:
        # リクエストヘッダーからBearerトークンを取得
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            logger.error("Authorization Bearerトークンがありません")
            return False
            
        token = auth_header.split('Bearer ')[1]
        
        # JWTトークンを検証
        decoded_token = jwt.decode(token, options={"verify_signature": False})
        
        # トークンの有効期限と発行元を確認
        now = time.time()
        if decoded_token.get('exp', 0) < now:
            logger.error("トークンの有効期限切れ")
            return False
            
        # 発行元が期待するサービスアカウントか確認
        expected_email = "pubsub-to-cloudrun-invoker@tiktok-analytics-prod-451609.iam.gserviceaccount.com"
        if decoded_token.get('email') != expected_email:
            logger.error(f"不正なサービスアカウント: {decoded_token.get('email')}")
            return False
            
        return True
        
    except Exception as e:
        logger.error(f"トークン検証エラー: {str(e)}")
        return False

@app.route('/pubsub', methods=['POST'])
def handle_pubsub_message():
    """Pub/Subプッシュメッセージを処理"""
    try:
        # 認証チェック
        if not verify_pubsub_token(request):
            return Response('認証失敗', status=401)
            
        # リクエストボディを解析
        envelope = request.get_json()
        if not envelope:
            logger.error("リクエストボディがありません")
            return Response('無効なリクエスト', status=400)
            
        if not isinstance(envelope, dict) or 'message' not in envelope:
            logger.error("無効なPub/Subメッセージ形式")
            return Response('無効なPub/Subメッセージ', status=400)
            
        pubsub_message = envelope['message']
        
        # メッセージデータが存在するか確認
        if 'data' not in pubsub_message:
            logger.error("Pub/Subメッセージにデータがありません")
            return Response('データなし', status=400)
            
        # Base64エンコードされたデータをデコード
        data_str = base64.b64decode(pubsub_message['data']).decode('utf-8')
        data = json.loads(data_str)
        
        logger.info(f"Pub/Subから受信したメッセージ: {json.dumps(data)}")
        
        # 別スレッドで処理を実行
        def run_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # 受信データの形式に変換
            message_data = {}
            if "accounts" in data:
                message_data = data
            else:
                # 単一のアカウント情報の場合
                message_data = {
                    "accounts": [{
                        "account_url": data.get("account_url"),
                        "account_name": data.get("account_name"),
                        "account_id": data.get("account_id", "unknown"),
                        "is_new_account": data.get("is_new_account", True)
                    }],
                    "processing_info": data.get("processing_info", {})
                }
            
            # メッセージオブジェクトを作成
            message = type('PubSubMessage', (), {
                'data': json.dumps(message_data).encode('utf-8'),
                'ack': lambda: None,
                'nack': lambda: None
            })
            
            # 処理関数を実行
            loop.run_until_complete(process_message(message))
            loop.close()
        
        # 別スレッドで処理を開始
        threading.Thread(target=run_async).start()
        
        # Pub/Subに成功を返す
        return Response('', status=204)
        
    except Exception as e:
        logger.error(f"Pub/Subメッセージ処理エラー: {str(e)}")
        return Response(f'エラー: {str(e)}', status=500)


def setup_subscription():
    """サブスクリプションをセットアップする（プル型に統一）"""
    try:
        logger.info(f"プル型サブスクリプションを設定します (Project ID: {project_id})")
        
        subscriber = pubsub_v1.SubscriberClient()
        # サブスクリプション名は環境変数で指定可能にする
        subscription_name = os.environ.get('PUBSUB_SUBSCRIPTION', "process-account-list-sub")
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        def callback(message):
            try:
                logger.info(f"メッセージを受信しました: {message.message_id}")
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(process_message(message))
                loop.close()
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
                message.nack()
        
        streaming_pull_future = subscriber.subscribe(
            subscription_path,
            callback=callback
        )
        
        logger.info(f"プル型サブスクリプション '{subscription_name}' の設定完了 - メッセージ待機中...")
        # メッセージを待機（ブロッキング呼び出し）
        streaming_pull_future.result()
            
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise

if __name__ == "__main__":
    logger.info("=== Account Crawler 起動 ===")
    logger.info(f"環境変数:")
    logger.info(f"- PROJECT_ID: {os.environ.get('PROJECT_ID')}")
    logger.info(f"- PUBSUB_SUBSCRIPTION: {os.environ.get('PUBSUB_SUBSCRIPTION', 'process-account-list-sub')}")
    
    try:
        setup_subscription()
    except KeyboardInterrupt:
        logger.info("プログラムを終了します")
    except Exception as e:
        logger.error(f"予期せぬエラー: {e}")
        import traceback
        logger.error(traceback.format_exc()) 