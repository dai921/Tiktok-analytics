import os
import asyncio
import logging
import json
import aiohttp
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import pubsub_v1, storage
from TikTokApi import TikTokApi
import random
import shutil
import requests
from yt_dlp import YoutubeDL
from playwright.async_api import async_playwright

# ロギング設定を更新
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self):
        self.logger = logger  # 既存のロガーを使用
        self.semaphore = asyncio.Semaphore(1)  # 同時処理を1つに制限
        # User-Agent一覧
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Edge/121.0.0.0'
        ]

        # PubSub設定
        if not os.getenv('PUBSUB_EMULATOR_HOST'):
            os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
        
        self.project_id = os.getenv('PROJECT_ID', 'local-project')
        self.publisher = pubsub_v1.PublisherClient()
        self.subscriber = pubsub_v1.SubscriberClient()
        
        # トピックとサブスクリプションのパス
        self.video_processing_sub = self.subscriber.subscription_path(
            self.project_id, 'video-processing-sub'
        )
        self.video_data_topic = self.publisher.topic_path(
            self.project_id, 'video-data'
        )

        # Cloud Storage設定
        if os.getenv('STORAGE_EMULATOR_HOST'):
            # エミュレータ用の設定
            storage_client_options = {
                'api_endpoint': os.getenv('STORAGE_EMULATOR_HOST')
            }
            self.storage_client = storage.Client(
                project=self.project_id,
                client_options=storage_client_options
            )
        else:
            self.storage_client = storage.Client()

        self.bucket_name = os.getenv('BUCKET_NAME', 'tiktok-data-bucket')
        
        # バケットが存在しない場合は作成
        try:
            self.bucket = self.storage_client.bucket(self.bucket_name)
            if not self.bucket.exists():
                self.bucket = self.storage_client.create_bucket(self.bucket_name)
                self.logger.info(f"バケットを作成しました: {self.bucket_name}")
        except Exception as e:
            self.logger.error(f"バケットの作成に失敗: {str(e)}")
            raise

        # 保存先ディレクトリの設定
        self.temp_dir = "temp_downloads"
        self.storage_dir = "storage"
        
        # ディレクトリの作成
        for directory in [self.temp_dir, self.storage_dir]:
            if not os.path.exists(directory):
                os.makedirs(directory)

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

    async def get_video_info(self, api: TikTokApi, video_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
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
                self.logger.error(f"正規化後の動画URL: {normalized_url}")
            except Exception as e:
                self.logger.error(f"動画URLの解析に失敗: {str(e)}")
                return None# URLから動画IDとユーザー名を正しく抽出
            # 動画情報を取得
            video = await api.video(id=video_id, username=username, url=normalized_url).info()
            if not video:
                raise Exception("Empty response received")

            # 基本情報を取得（既存のデータを使用）
            base_info = {
                'video_id': video_id,
                'username': username,     # 既存のデータを使用
                'url': video_url,        # 既存のデータを使用
                'currentFetchDate': datetime.now().isoformat(),
                'likes_count': video.get('stats', {}).get('diggCount'),
                'play_count': video.get('stats', {}).get('playCount'),
                'comment_count': video.get('stats', {}).get('commentCount'),
                'share_count': video.get('stats', {}).get('shareCount'),
                'save_count': video.get('stats', {}).get('collectCount'),
                'isViral': video.get('stats', {}).get('playCount', 0) >= 100000,
                'is_new_video': is_new_video  # is_new_videoも含める
            }

            # 新規動画の場合は追加情報を取得
            if is_new_video:
                # サムネイル画像をCloud Storageに保存
                cover_image_url = video.get('video', {}).get('cover')
                if cover_image_url:
                    storage_path = f'thumbnails/{video_id}.jpg'
                    await self.save_to_storage(cover_image_url, storage_path)
                    base_info['cover_image_url'] = f'gs://{self.bucket_name}/{storage_path}'

                # 追加情報を設定
                base_info.update({
                    'display_name': video.get('author', {}).get('nickname'),
                    'description': video.get('desc'),
                    'created_at': datetime.fromtimestamp(int(video.get('createTime', '0'))).isoformat(),
                    'hashtags': [tag.get('hashtagName') for tag in video.get('textExtra', []) if tag.get('hashtagName')],
                    'duration': video.get('video', {}).get('duration'),
                    'music_id': video.get('music', {}).get('id'),
                    'music_title': video.get('music', {}).get('title'),
                    'music_artist': video.get('music', {}).get('authorName')
                })

            return base_info

        except Exception as e:
            self.logger.error(f"動画情報の取得に失敗 - video_id: {video_id}, error: {str(e)}")
            return {
                "video_url": video_url,
                "video_id": video_id,
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

    async def process_message(self, message) -> None:
        """PubSubメッセージを処理"""
        async with self.semaphore:
            try:
                data = json.loads(message.data.decode('utf-8'))
                self.logger.debug(f"処理開始: video_id={data['video_id']}")

                # TikTokApiのセッション作成
                api = TikTokApi()
                try:
                    self.logger.debug("TikTokAPIセッション作成中...")
                    await api.create_sessions(
                        num_sessions=1,
                        headless=True,
                        sleep_after=5,
                        browser="chromium",
                        context_options={
                            "viewport": {"width": 1920, "height": 1080},
                            "user_agent": self.get_random_user_agent()
                        }
                    )
                    self.logger.debug("TikTokAPIセッション作成完了")

                    # 動画情報を取得
                    self.logger.debug(f"動画情報取得開始: {data['video_id']}")
                    video_info = await self.get_video_info(api, data)

                    if video_info:
                        content_type = data.get('content_type')
                        video_id = data['video_id']
                        url = data['video_url']
                        username = data['username']

                        # 基本情報を設定
                        base_result = {
                            "video_id": video_id,
                            "video_url": url,
                            "username": username
                        }

                        # 削除チェック
                        is_deleted = await self._check_deleted_content(url)
                        if is_deleted:
                            result = {
                                **base_result,  # 基本情報を展開
                                "status": "deleted",
                                "message": "コンテンツは削除されています"
                            }
                        else:
                            page = await api.browser.new_page()
                            try:
                                await page.goto(url, wait_until='domcontentloaded')
                                await asyncio.sleep(2)

                                if content_type == '動画':
                                    process_result = await self._process_video(url, video_id)
                                    result = {**base_result, **process_result}  # 基本情報と処理結果を結合
                                else:
                                    carousel_dir = os.path.join(self.storage_dir, f"carousel_{video_id}")
                                    os.makedirs(carousel_dir, exist_ok=True)
                                    
                                    # カルーセル処理のコード
                                    image_urls = []
                                    while True:
                                        img_elements = await page.query_selector_all('img.css-brxox6-ImgPhotoSlide')
                                        for elem in img_elements:
                                            src = await elem.get_attribute('src')
                                            if src and src.startswith('http') and src not in image_urls:
                                                image_urls.append(src)
                                        
                                        try:
                                            next_button = await page.wait_for_selector('button[class*="NextButton"]', timeout=2000)
                                            if next_button:
                                                await next_button.click()
                                                await asyncio.sleep(1)
                                            else:
                                                break
                                        except:
                                            break

                                    # 画像のダウンロードと保存
                                    saved_images = []
                                    for i, img_url in enumerate(image_urls, 1):
                                        try:
                                            response = requests.get(img_url)
                                            if response.status_code == 200:
                                                image_path = os.path.join(carousel_dir, f"image_{i:02d}.jpg")
                                                with open(image_path, 'wb') as f:
                                                    f.write(response.content)
                                                saved_images.append(image_path)
                                        except Exception as e:
                                            self.logger.error(f"画像 {i} のダウンロード中にエラー: {str(e)}")

                                    result = {
                                        **base_result,  # 基本情報を展開
                                        "status": "success" if saved_images else "error",
                                        "folder_path": carousel_dir if saved_images else None,
                                        "image_count": len(saved_images),
                                        "type": "carousel"
                                    }
                            finally:
                                await page.close()

                        # video_infoから重複する基本情報を削除
                        for key in ["video_id", "video_url", "username"]:
                            video_info.pop(key, None)

                        # 処理済みデータをPubSubに送信
                        final_message = {**result, **video_info}  # resultを優先して結合
                        message_data = json.dumps(final_message).encode('utf-8')
                        future = self.publisher.publish(self.video_data_topic, message_data)
                        message_id = future.result()
                        self.logger.info(f"処理済みデータを送信: Message ID: {message_id}")

                finally:
                    # セッションをクローズ
                    await api.close_sessions()

                # メッセージを確認
                message.ack()
                self.logger.debug(f"処理完了: video_id={data['video_id']}")

            except Exception as e:
                self.logger.error(f"メッセージ処理中にエラー: {str(e)}", exc_info=True)
                message.nack()

    def callback(self, message):
        """同期的なコールバック処理"""
        asyncio.run_coroutine_threadsafe(
            self.process_message(message),
            self.loop
        )

    async def run(self):
        """メッセージの受信と処理を開始"""
        try:
            # イベントループを保存
            self.loop = asyncio.get_running_loop()
            
            # コールバックを設定してサブスクライブ
            streaming_pull_future = self.subscriber.subscribe(
                self.video_processing_sub,
                callback=self.callback
            )
            self.logger.info(f"メッセージの受信を開始: {self.video_processing_sub}")
            
            # 無限ループで実行し続ける
            while True:
                await asyncio.sleep(1)
                
        except Exception as e:
            self.logger.error(f"実行中にエラー: {str(e)}")
            if 'streaming_pull_future' in locals():
                streaming_pull_future.cancel()
            raise
        finally:
            if 'streaming_pull_future' in locals():
                streaming_pull_future.cancel()

async def main():
    processor = VideoProcessor()
    await processor.run()

if __name__ == "__main__":
    asyncio.run(main())