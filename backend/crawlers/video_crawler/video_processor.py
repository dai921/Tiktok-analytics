import os
import asyncio
import logging
import json
import aiohttp
import base64
import subprocess
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import pubsub_v1, storage
from TikTokApi import TikTokApi
import random
import shutil
import requests
from yt_dlp import YoutubeDL
from playwright.async_api import async_playwright
# Flaskをインポート
from flask import Flask, request, Response
import jwt
import time
from functools import wraps

# ロギング設定を更新
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self):
        # ロガー設定を先に行う
        self.logger = logger  # 既存のロガーを使用
        
        # 環境設定
        self.environment = os.getenv('ENVIRONMENT', 'production')
        self.logger.info(f"起動環境: {self.environment}")
        
        # セマフォアを緩和（同時に処理できるリクエスト数を増やす）
        self.semaphore = asyncio.Semaphore(3)  # 1から3に変更
        
        # セッション管理用の変数
        self.session_locks = [asyncio.Lock() for _ in range(3)]  # 各セッション用のロック
        self.api_lock = asyncio.Lock()  # APIインスタンス全体のロック
        self.api_instance = None  # 共有APIインスタンス
        
        # Pod名を環境変数から取得（Kubernetesで自動設定される）
        self.pod_name = os.getenv('POD_NAME', 'unknown-pod')
        self.logger.info(f"Pod名: {self.pod_name}")
        
        # メッセージタイムアウト設定
        self.message_timeout_seconds = int(os.getenv('MESSAGE_TIMEOUT_SECONDS', '600'))  # デフォルト10分
        self.last_message_time = time.time()
        self.logger.info(f"メッセージタイムアウト設定: {self.message_timeout_seconds}秒")
        
        # User-Agent一覧
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Edge/121.0.0.0'
        ]

        # PubSub設定
        # if os.getenv('ENVIRONMENT') == 'development' and not os.getenv('PUBSUB_EMULATOR_HOST'):
        #     os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'  # コメントアウト: ローカル開発用
        
        self.project_id = os.getenv('PROJECT_ID', 'tiktok-analytics-prod-451609')  # デフォルト値を本番環境のIDに変更
        self.publisher = pubsub_v1.PublisherClient()
        self.subscriber = pubsub_v1.SubscriberClient()
        
        # トピックとサブスクリプションのパス
        self.video_processing_sub = os.environ.get('PUBSUB_SUBSCRIPTION', 'video-processing-sub')
        self.video_processing_sub_path = self.subscriber.subscription_path(
            self.project_id, self.video_processing_sub
        )
        self.video_data_topic = self.publisher.topic_path(
            self.project_id, 'video-data'
        )

        # Cloud Storage設定
        # if os.getenv('STORAGE_EMULATOR_HOST'):  # コメントアウト: ローカル環境のStorage Emulator設定
        #     # エミュレータ用の設定
        #     storage_client_options = {
        #         'api_endpoint': os.getenv('STORAGE_EMULATOR_HOST')
        #     }
        #     self.storage_client = storage.Client(
        #         project=self.project_id,
        #         client_options=storage_client_options
        #     )
        # else:
        self.storage_client = storage.Client()

        self.bucket_name = os.getenv('BUCKET_NAME', 'tiktok-data-bucket')
        
        # 環境に応じたバケット取得ロジック
        try:
            self.bucket = self.storage_client.bucket(self.bucket_name)
            if not self.bucket.exists():
                # if os.getenv('ENVIRONMENT') == 'development':  # コメントアウト: 開発環境のみのコード
                #     # 開発環境のみバケット自動作成
                #     self.bucket = self.storage_client.create_bucket(self.bucket_name)
                #     self.logger.info(f"開発環境用バケットを作成しました: {self.bucket_name}")
                # else:
                # 本番環境では事前作成されているはず
                self.logger.error(f"バケット {self.bucket_name} が存在しません")
                raise ValueError(f"バケット {self.bucket_name} が事前に作成されていません")
        except Exception as e:
            self.logger.error(f"バケット接続エラー: {str(e)}")
            raise

        # 環境変数から保存パスを取得またはデフォルト設定
        self.temp_dir = os.getenv('TEMP_DIR', "temp_downloads")
        self.storage_dir = os.getenv('STORAGE_DIR', "storage")

        # ディレクトリパスのログ出力
        self.logger.info(f"一時ディレクトリ: {self.temp_dir}")
        self.logger.info(f"ストレージディレクトリ: {self.storage_dir}")

        # ディレクトリの作成
        for directory in [self.temp_dir, self.storage_dir]:
            if not os.path.exists(directory):
                os.makedirs(directory)

        # Flask アプリケーションを初期化
        self.app = Flask(__name__)
        self.setup_routes()

    def setup_routes(self):
        """Flaskルートの設定"""
        self.app.route('/pubsub', methods=['POST'])(self.handle_pubsub_message)
        
    def verify_pubsub_token(self, request):
        """Pub/Subメッセージの認証を検証"""
        try:
            # リクエストヘッダーからBearerトークンを取得
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                self.logger.error("Authorization Bearer トークンがありません")
                return False
                
            token = auth_header.split('Bearer ')[1]
            
            # JWTトークンを検証
            # 注意: この実装は簡略化されています。本番環境では適切な検証が必要です
            decoded_token = jwt.decode(token, options={"verify_signature": False})
            
            # トークンの有効期限と発行元を確認
            now = time.time()
            if decoded_token.get('exp', 0) < now:
                self.logger.error("トークンの有効期限切れ")
                return False
                
            # 発行元が期待するサービスアカウントか確認
            expected_email = "pubsub-to-cloudrun-invoker@tiktok-analytics-prod-451609.iam.gserviceaccount.com"
            if decoded_token.get('email') != expected_email:
                self.logger.error(f"不正なサービスアカウント: {decoded_token.get('email')}")
                return False
                
            return True
            
        except Exception as e:
            self.logger.error(f"トークン検証エラー: {str(e)}")
            return False
    
    def handle_pubsub_message(self):
        """Pub/Subプッシュメッセージを処理"""
        try:
            # 認証チェック
            if not self.verify_pubsub_token(request):
                return Response('認証失敗', status=401)
                
            # リクエストボディを解析
            envelope = request.get_json()
            if not envelope:
                self.logger.error("リクエストボディがありません")
                return Response('無効なリクエスト', status=400)
                
            if not isinstance(envelope, dict) or 'message' not in envelope:
                self.logger.error("無効なPub/Subメッセージ形式")
                return Response('無効なPub/Subメッセージ', status=400)
                
            pubsub_message = envelope['message']
            
            # メッセージデータが存在するか確認
            if 'data' not in pubsub_message:
                self.logger.error("Pub/Subメッセージにデータがありません")
                return Response('データなし', status=400)
                
            # Base64エンコードされたデータをデコード
            data_str = base64.b64decode(pubsub_message['data']).decode('utf-8')
            data = json.loads(data_str)
            
            self.logger.info(f"Pub/Subから受信したメッセージ: {json.dumps(data)}")
            
            # メッセージ受信時間を更新
            self.last_message_time = time.time()
            
            # 非同期処理を開始（別スレッドで実行）
            asyncio.run_coroutine_threadsafe(
                self.process_data(data), 
                asyncio.get_event_loop()
            )
            
            # Pub/Subに成功を返す
            return Response('', status=204)
            
        except Exception as e:
            self.logger.error(f"Pub/Subメッセージ処理エラー: {str(e)}")
            return Response(f'エラー: {str(e)}', status=500)
    
    async def process_data(self, data):
        """受信したデータを非同期で処理"""
        try:
            # video_dataと同じ形式に変換
            video_data = {
                'video_id': data.get('video_id'),
                'video_url': data.get('video_url'),
                'username': data.get('username'),
                'is_new_video': data.get('is_new_video', True)
            }
            
            # 既存の処理関数を呼び出す
            message = type('PubSubMessage', (), {'data': json.dumps(video_data).encode('utf-8'), 'ack': lambda: None, 'nack': lambda: None})
            await self.process_message(message)
            
        except Exception as e:
            self.logger.error(f"データ処理エラー: {str(e)}")

    def get_random_user_agent(self) -> str:
        return random.choice(self.user_agents)

    async def apply_enhanced_stealth(self, page):
        """ステルス対策を適用"""
        await page.add_init_script("""
        (() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {}
            };
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        })();
        """)

    async def get_api_instance(self):
        """TikTokApiのインスタンスを取得（並行処理に対応）"""
        async with self.api_lock:
            if self.api_instance is None:
                self.logger.debug("新しいTikTokAPIインスタンスを作成中...")
                api = TikTokApi()
                
                try:
                    # セマフォアと同じ数のセッションを作成
                    num_sessions = len(self.session_locks)
                    self.logger.debug(f"{num_sessions}個のセッションを作成します")
                    
                    await api.create_sessions(
                        num_sessions=num_sessions,
                        headless=True,
                        sleep_after=1,
                        browser="chromium",
                        context_options={
                            "viewport": {"width": 1920, "height": 1080},
                            "user_agent": self.get_random_user_agent()
                        }
                    )
                    
                    # セッション作成直後に属性を確認
                    if not hasattr(api, 'num_sessions') or api.num_sessions != num_sessions:
                        api.num_sessions = num_sessions
                        self.logger.debug(f"num_sessions属性を{num_sessions}に設定しました")
                    
                    self.api_instance = api
                    self.logger.debug(f"TikTokAPIインスタンス作成完了: {api.num_sessions}個のセッション")
                except Exception as e:
                    self.logger.error(f"TikTokAPIインスタンス作成エラー: {str(e)}")
                    raise
                
            return self.api_instance

    async def acquire_session(self):
        """使用可能なセッションを取得して予約する"""
        api = await self.get_api_instance()
        
        # 空いているセッションを探す
        for i, lock in enumerate(self.session_locks):
            if not lock.locked():
                await lock.acquire()
                self.logger.debug(f"セッション {i} を予約しました")
                return i, api
        
        # すべてのセッションが使用中の場合は待機
        self.logger.warning("すべてのセッションが使用中です。セッション0の解放を待機します")
        await self.session_locks[0].acquire()
        self.logger.debug("セッション 0 を予約しました")
        return 0, api

    def release_session(self, session_index):
        """セッションを解放する"""
        if 0 <= session_index < len(self.session_locks) and self.session_locks[session_index].locked():
            self.session_locks[session_index].release()
            self.logger.debug(f"セッション {session_index} を解放しました")

    async def process_message(self, message) -> None:
        """PubSubメッセージを処理"""
        # セマフォアは維持するが、メッセージID追跡を追加
        message_id = message.message_id if hasattr(message, 'message_id') else 'unknown'
        self.logger.info(f"処理開始 [Pod: {self.pod_name}]: message_id={message_id}")
        
        async with self.semaphore:
            session_index = None
            try:
                data = json.loads(message.data.decode('utf-8'))
                self.logger.debug(f"処理開始: video_id={data['video_id']} [Pod: {self.pod_name}]")

                # 使用可能なセッションを取得
                session_index, api = await self.acquire_session()
                self.logger.debug(f"セッション {session_index} を使用して処理を開始")

                try:
                    # 動画情報を取得（セッションインデックスを指定）
                    self.logger.debug(f"動画情報取得開始: {data['video_id']} (セッション: {session_index})")
                    video_info = await self.get_video_info(api, data, session_index=session_index)

                    if video_info:
                        video_id = data['video_id']
                        url = data['video_url']
                        username = data['username']
                        self.logger.debug(f"処理するデータ: video_id={video_id}, url={url}, username={username}")

                        # 基本情報を設定
                        base_result = {
                            "video_id": video_id,
                            "video_url": url,
                            "username": username
                        }
                        self.logger.debug(f"基本情報を設定: {json.dumps(base_result)}")

                        # content_typeの判定（URLを使用）
                        original_url = url
                        url_lower = url.lower()
                        self.logger.debug(f"URL判定開始: {url_lower}")

                        if 'video' in url_lower:
                            content_type = 'video'
                            self.logger.debug(f"'video'キーワードを検出: content_type='video'に設定")
                        elif 'photo' in url_lower:
                            content_type = 'carousel'
                            self.logger.debug(f"'photo'キーワードを検出: content_type='carousel'に設定")
                        else:
                            content_type = 'video'
                            self.logger.debug(f"キーワード未検出: デフォルトでcontent_type='video'に設定")

                        # 削除チェック
                        self.logger.debug(f"削除チェック開始: {url}")
                        is_deleted = await self._check_deleted_content(url)
                        self.logger.debug(f"削除チェック結果: is_deleted={is_deleted}")

                        if is_deleted:
                            result = {
                                **base_result,
                                "status": "deleted",
                                "message": "コンテンツは削除されています",
                                "type": content_type
                            }
                            self.logger.info(f"削除済みコンテンツを検出: {json.dumps(result)}")
                        else:
                            page = await api.browser.new_page()
                            try:
                                self.logger.debug(f"ページアクセス開始: {url}")
                                await page.goto(url, wait_until='domcontentloaded')
                                await asyncio.sleep(2)
                                self.logger.debug("ページロード完了")

                                if content_type == 'video':
                                    self.logger.debug(f"ビデオ処理開始: content_type={content_type}, url={url}")
                                    process_result = await self._process_video(url, video_id)
                                    self.logger.debug(f"ビデオ処理結果: {json.dumps(process_result)}")
                                    
                                    if process_result["status"] == "error":
                                        self.logger.error(f"ビデオ処理エラー: {process_result.get('message')}")
                                        self.logger.error(f"エラー発生URL: {url}")
                                    
                                    result = {**base_result, **process_result}
                                    self.logger.debug(f"最終結果: {json.dumps(result)}")
                                else:
                                    self.logger.debug(f"カルーセル処理開始: content_type={content_type}, url={url}")
                                    carousel_dir = os.path.join(self.storage_dir, f"carousel_{video_id}")
                                    os.makedirs(carousel_dir, exist_ok=True)
                                    self.logger.debug(f"カルーセルディレクトリ作成: {carousel_dir}")

                                    # カルーセル処理のコード
                                    image_urls = []
                                    slide_count = 0
                                    while True:
                                        slide_count += 1
                                        self.logger.debug(f"スライド {slide_count} の処理開始")
                                        
                                        img_elements = await page.query_selector_all('img.css-brxox6-ImgPhotoSlide')
                                        self.logger.debug(f"検出された画像要素数: {len(img_elements)}")
                                        
                                        for elem in img_elements:
                                            src = await elem.get_attribute('src')
                                            if src and src.startswith('http') and src not in image_urls:
                                                image_urls.append(src)
                                                self.logger.debug(f"新しい画像URLを追加: {src}")
                                        
                                        try:
                                            next_button = await page.wait_for_selector('button[class*="NextButton"]', timeout=2000)
                                            if next_button:
                                                await next_button.click()
                                                self.logger.debug("次のスライドに移動")
                                                await asyncio.sleep(1)
                                            else:
                                                self.logger.debug("次のスライドボタンが見つからないため終了")
                                                break
                                        except Exception as e:
                                            self.logger.debug(f"スライド処理終了: {str(e)}")
                                            break

                                    # 画像のダウンロードと保存
                                    self.logger.debug(f"画像ダウンロード開始: {len(image_urls)}個の画像")
                                    saved_images = []
                                    for i, img_url in enumerate(image_urls, 1):
                                        try:
                                            response = requests.get(img_url)
                                            if response.status_code == 200:
                                                image_path = os.path.join(carousel_dir, f"image_{i:02d}.jpg")
                                                with open(image_path, 'wb') as f:
                                                    f.write(response.content)
                                                saved_images.append(image_path)
                                                self.logger.debug(f"画像 {i} を保存: {image_path}")
                                        except Exception as e:
                                            self.logger.error(f"画像 {i} のダウンロード失敗: {str(e)}")

                                    result = {
                                        **base_result,
                                        "status": "success",
                                        "folder_path": carousel_dir if saved_images else None,
                                        "image_count": len(saved_images),
                                        "type": "carousel"
                                    }
                                    self.logger.debug(f"カルーセル処理結果: {json.dumps(result)}")
                            except Exception as e:
                                self.logger.error(f"ページ処理中のエラー: {str(e)}")
                                result = {
                                    **base_result,
                                    "status": "error",
                                    "message": str(e),
                                    "type": content_type
                                }
                            finally:
                                await page.close()
                                self.logger.debug("ページをクローズ")

                        # video_infoから重複する基本情報を削除
                        for key in ["video_id", "video_url", "username"]:
                            video_info.pop(key, None)

                        # 処理済みデータをPubSubに送信
                        final_message = {**result, **video_info}  # resultを優先して結合
                        self.logger.debug("=== 送信前の最終データ確認 ===")
                        self.logger.debug(f"result: {json.dumps(result, indent=2)}")
                        self.logger.debug(f"video_info: {json.dumps(video_info, indent=2)}")
                        self.logger.debug(f"final_message: {json.dumps(final_message, indent=2)}")
                        self.logger.debug("===========================")
                        
                        message_data = json.dumps(final_message).encode('utf-8')
                        future = self.publisher.publish(self.video_data_topic, message_data)
                        message_id = future.result()
                        self.logger.info(f"処理済みデータを送信: Message ID: {message_id}")

                except Exception as e:
                    self.logger.error(f"API処理中にエラー: {str(e)}")
                    raise
                
                # メッセージを確認
                message.ack()
                self.logger.debug(f"処理完了: video_id={data['video_id']} [Pod: {self.pod_name}]")

            except Exception as e:
                self.logger.error(f"メッセージ処理中にエラー [Pod: {self.pod_name}]: {str(e)}", exc_info=True)
                message.nack()
            finally:
                # 確実にセッションを解放
                if session_index is not None:
                    self.release_session(session_index)

    async def get_video_info(self, api: TikTokApi, video_data: Dict[str, Any], session_index: int = None) -> Optional[Dict[str, Any]]:
        """動画の情報を取得"""
        try:
            video_id = video_data['video_id']
            username = video_data['username']
            video_url = video_data['video_url']
            is_new_video = video_data['is_new_video']

            # URLから動画IDとユーザー名を正しく抽出
            try:
                parts = video_url.split('/')
                video_id = parts[-1].split('?')[0]
                username = parts[3].lstrip('@')
                normalized_url = f'https://www.tiktok.com/@{username}/video/{video_id}'
                self.logger.info(f"正規化後の動画URL: {normalized_url}")
            except Exception as e:
                self.logger.error(f"動画URLの解析に失敗: {str(e)}")
                return None
            
            # 動画情報を取得（セッションインデックスを指定）
            self.logger.debug(f"APIリクエスト実行 (セッション: {session_index})")
            
            # セッションインデックスを指定してvideoオブジェクトを取得
            video_obj = api.video(id=video_id, username=username, url=normalized_url)
            
            # セッションインデックスを指定して情報を取得
            if session_index is not None:
                video = await video_obj.info(session_index=session_index)
            else:
                video = await video_obj.info()
            
            if not video:
                raise Exception("Empty response received")

            # 基本情報を取得（既存のデータを使用）
            base_info = {
                'video_id': video_id,
                'username': username,
                'url': video_url,
                'currentFetchDate': datetime.now().date().isoformat(),  # 日付のみに変更
                'likes_count': video.get('stats', {}).get('diggCount'),
                'play_count': video.get('stats', {}).get('playCount'),
                'comment_count': video.get('stats', {}).get('commentCount'),
                'share_count': video.get('stats', {}).get('shareCount'),
                'save_count': video.get('stats', {}).get('collectCount'),
                'isViral': video.get('stats', {}).get('playCount', 0) >= 100000,
                'is_new_video': is_new_video  # is_new_videoも含める
            }

            # サムネイル画像は新規動画の場合のみCloud Storageに保存
            if is_new_video:
                cover_image_url = video.get('video', {}).get('cover')
                if cover_image_url:
                    storage_path = f'thumbnails/{video_id}.jpg'
                    await self.save_to_storage(cover_image_url, storage_path)
                    base_info['cover_image_url'] = f'gs://{self.bucket_name}/{storage_path}'

            # 全ての動画に追加情報を設定（新規・既存共通）
            base_info.update({
                'display_name': video.get('author', {}).get('nickname'),
                'description': video.get('desc'),
                'created_at': datetime.fromtimestamp(
                    int(video.get('createTime', '0'))
                ).date().isoformat(),  # .date().isoformat()で日付のみを取得
                'hashtags': [tag.get('hashtagName') for tag in video.get('textExtra', []) if tag.get('hashtagName')],
                'duration': video.get('video', {}).get('duration'),
                'music_id': video.get('music', {}).get('id'),
                'music_title': video.get('music', {}).get('title'),
                'music_artist': video.get('music', {}).get('authorName')
            })

            return base_info

        except Exception as e:
            self.logger.error(f"動画情報の取得に失敗 - video_id: {video_id}, session: {session_index}, error: {str(e)}")
            return {
                "video_url": video_url,
                "video_id": video_id,
                "username": username,
                "status": "error"
            }

    async def save_to_storage(self, url: str, storage_path: str) -> None:
        """画像をCloud Storageに保存"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.read()
                        blob = self.bucket.blob(storage_path)
                        blob.upload_from_string(data)
                        self.logger.info(f"画像を保存しました: {storage_path}")
        except Exception as e:
            self.logger.error(f"画像の保存に失敗: {str(e)}")
            raise

    async def _process_video(self, url: str, video_id: str) -> Dict[str, Any]:
        """動画のダウンロードと保存"""
        temp_path = os.path.join(self.temp_dir, f"{video_id}")
        storage_path = os.path.join(self.storage_dir, f"{video_id}")
        
        try:
            ydl_opts = {
                'outtmpl': f"{temp_path}.%(ext)s",
                'format': 'bestvideo+bestaudio/best',
            }
            
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                downloaded_file = ydl.prepare_filename(info)
                
                # ストレージに移動
                final_path = f"{storage_path}.{downloaded_file.split('.')[-1]}"
                shutil.move(downloaded_file, final_path)
                
                self.logger.info(f"動画を保存しました: {final_path}")
                return {
                    "status": "success",
                    "video_id": video_id,
                    "file_path": final_path,
                    "type": "video"
                }
                
        except Exception as e:
            self.logger.error(f"動画ダウンロード中にエラー: {str(e)}")
            return {
                "status": "error",
                "video_id": video_id,
                "message": str(e),
                "type": "video"
            }

    async def process_video_data(self, video_data: Dict[str, Any]) -> Dict[str, Any]:
        """動画データの処理を実行"""
        try:
            url = video_data['video_url']
            video_id = video_data['video_id']           

            result = await self._process_video(url, video_id)
            
            return result
            
        except Exception as e:
            self.logger.error(f"処理中にエラーが発生: {str(e)}")
            return {
                "status": "error",
                "video_id": video_data.get('video_id', 'unknown'),
                "message": str(e)
            }

    async def _check_deleted_content(self, url: str) -> bool:
        """コンテンツが削除されているかチェック"""
        try:
            async with async_playwright() as p:
                # 日本語ロケールとタイムゾーンを設定
                browser = await p.chromium.launch(
                    headless=True,
                )
                context = await browser.new_context(
                    locale='ja-JP',
                    timezone_id='Asia/Tokyo',
                    user_agent=self.get_random_user_agent()
                )
                page = await context.new_page()
                
                await page.goto(url, wait_until='domcontentloaded')
                await asyncio.sleep(2)
                
                # 削除されているかチェック
                dead_link_selector = 'p.css-1y4x9xk-PTitle'
                try:
                    element = await page.wait_for_selector(dead_link_selector, timeout=2000)
                    if element:
                        text = await element.text_content()
                        self.logger.info(f"削除メッセージを検出: '{text}'")  # 実際のメッセージをログ出力
                        return any(msg in text for msg in [
                            "動画は現在ご利用できません",
                            "Video currently unavailable",
                            "This video is unavailable",
                            "このビデオは削除されました",
                            "このビデオは利用できません"
                        ])
                except:
                    return False
                finally:
                    await context.close()
                    await browser.close()
                    
        except Exception as e:
            self.logger.error(f"削除チェック中にエラー: {str(e)}")
            return False

    def cleanup(self):
        """一時ファイルの削除"""
        try:
            shutil.rmtree(self.temp_dir)
            os.makedirs(self.temp_dir)
            self.logger.info("一時ファイルを削除しました")
        except Exception as e:
            self.logger.error(f"一時ファイルの削除中にエラー: {str(e)}")

    async def scale_down_statefulset(self):
        """StatefulSetのレプリカ数を0に設定"""
        try:
            self.logger.info("10分間メッセージがないため、StatefulSetのレプリカ数を0に設定します")
            cmd = [
                "kubectl", "scale", "statefulset",
                "video-crawler",
                "-n", "video-crawler",
                "--replicas=0"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                self.logger.info(f"StatefulSetのスケールダウン成功: {result.stdout}")
                return True
            else:
                self.logger.error(f"StatefulSetのスケールダウン失敗: {result.stderr}")
                return False
        except Exception as e:
            self.logger.error(f"StatefulSetのスケールダウン中にエラー: {str(e)}")
            return False

    def setup_subscription(self):
        """サブスクリプションをセットアップする（プル型）"""
        try:
            self.logger.info(f"プル型サブスクリプションを設定します (Project ID: {self.project_id})")
            
            # Flow control設定を追加して処理速度を制御
            flow_control_settings = pubsub_v1.types.FlowControl(
                max_messages=5,  # 一度に処理する最大メッセージ数
                max_bytes=10 * 1024 * 1024,  # 10MB
                max_lease_duration=300  # 5分
            )
            
            def callback(message):
                try:
                    self.logger.info(f"メッセージを受信しました: {message.message_id} [Pod: {self.pod_name}]")
                    # メッセージ受信時間を更新
                    self.last_message_time = time.time()
                    asyncio.run_coroutine_threadsafe(
                        self.process_message(message), 
                        self.loop
                    )
                except Exception as e:
                    self.logger.error(f"メッセージ処理エラー: {e}")
                    message.nack()
            
            streaming_pull_future = self.subscriber.subscribe(
                self.video_processing_sub_path,
                callback=callback,
                flow_control=flow_control_settings
            )
            
            self.logger.info(f"プル型サブスクリプション '{self.video_processing_sub}' の設定完了 [Pod: {self.pod_name}] - メッセージ待機中...")
            return streaming_pull_future
                
        except Exception as e:
            self.logger.error(f"サブスクリプション設定エラー: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            raise

    async def check_message_timeout(self):
        """メッセージタイムアウトをチェック"""
        while True:
            try:
                await asyncio.sleep(10)  # 10秒ごとにチェック
                current_time = time.time()
                elapsed_time = current_time - self.last_message_time
                
                if elapsed_time > self.message_timeout_seconds:
                    self.logger.warning(f"メッセージタイムアウト: 最後のメッセージから{elapsed_time:.1f}秒経過")
                    # StatefulSetのレプリカ数を0に設定
                    if await self.scale_down_statefulset():
                        self.logger.info("StatefulSetのスケールダウンが成功しました。正常終了します。")
                        sys.exit(0)  # 正常終了
                    else:
                        self.logger.error("StatefulSetのスケールダウンに失敗しました。異常終了します。")
                        sys.exit(1)  # 異常終了
            except Exception as e:
                self.logger.error(f"タイムアウトチェック中にエラー: {str(e)}")
                # エラーが発生しても継続

    async def run(self):
        """メッセージの受信と処理を開始"""
        try:
            # イベントループを保存
            self.loop = asyncio.get_running_loop()
            
            # API定期リフレッシュタスクを開始
            api_refresh_task = asyncio.create_task(self.api_refresh_loop())
            
            # タイムアウトチェックタスクを開始
            timeout_check_task = asyncio.create_task(self.check_message_timeout())
            
            # Pod情報を取得
            try:
                import socket
                hostname = socket.gethostname()
                self.pod_name = hostname
                self.logger.info(f"Pod名を検出しました: {self.pod_name}")
            except:
                self.logger.warning("Pod名の自動検出に失敗しました")
            
            # Flaskアプリケーションを実行
            from waitress import serve
            self.logger.info(f"HTTP APIを開始: 0.0.0.0:8080 [Pod: {self.pod_name}]")
            
            # Flaskアプリを別スレッドで起動
            import threading
            threading.Thread(
                target=serve,
                args=(self.app,),
                kwargs={'host': '0.0.0.0', 'port': 8080},
                daemon=True
            ).start()
            
            # プル型サブスクリプションを設定
            streaming_pull_future = self.setup_subscription()
            self.logger.info(f"メッセージの受信を開始: {self.video_processing_sub}")
            
            # 無限ループで実行し続ける
            while True:
                await asyncio.sleep(1)
                
        except Exception as e:
            self.logger.error(f"実行中にエラー: {str(e)}")
            if 'streaming_pull_future' in locals():
                streaming_pull_future.cancel()
            if 'api_refresh_task' in locals():
                api_refresh_task.cancel()
            if 'timeout_check_task' in locals():
                timeout_check_task.cancel()
            # 異常終了（再起動される）
            sys.exit(1)
        finally:
            if 'streaming_pull_future' in locals():
                streaming_pull_future.cancel()
            if 'api_refresh_task' in locals():
                api_refresh_task.cancel()
            if 'timeout_check_task' in locals():
                timeout_check_task.cancel()

    async def api_refresh_loop(self):
        """TikTokApiインスタンスを定期的にリフレッシュ"""
        while True:
            try:
                await asyncio.sleep(3600)  # 1時間ごとにリフレッシュ
                
                self.logger.info("APIインスタンスの定期リフレッシュを開始...")
                
                # すべてのセッションを一時的にロック
                for lock in self.session_locks:
                    await lock.acquire()
                    
                # APIインスタンスをリフレッシュ
                async with self.api_lock:
                    if self.api_instance is not None:
                        try:
                            await self.api_instance.close_sessions()
                        except Exception as e:
                            self.logger.warning(f"古いAPIセッションのクローズに失敗: {str(e)}")
                        self.api_instance = None
                
                # セッションを解放
                for lock in self.session_locks:
                    if lock.locked():
                        lock.release()
                    
                self.logger.info("APIインスタンスリフレッシュ完了")
                
            except Exception as e:
                self.logger.error(f"APIリフレッシュループでエラー: {str(e)}")
                # セッションが残っている場合は解放
                for lock in self.session_locks:
                    if lock.locked():
                        lock.release()
                await asyncio.sleep(60)  # エラー時は短い間隔で再試行

async def main():
    processor = VideoProcessor()
    await processor.run()

if __name__ == "__main__":
    asyncio.run(main())