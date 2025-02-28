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

# ロギング設定を更新
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
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

            # 動画情報を取得
            video = await api.video(id=video_id, username=username, url=video_url).info()
            if not video:
                raise Exception("Empty response received")

            # 基本情報を取得
            base_info = {
                'video_id': video_id,
                'currentFetchDate': datetime.now().isoformat(),
                'likes_count': video.get('stats', {}).get('diggCount'),
                'play_count': video.get('stats', {}).get('playCount'),
                'comment_count': video.get('stats', {}).get('commentCount'),
                'share_count': video.get('stats', {}).get('shareCount'),
                'save_count': video.get('stats', {}).get('collectCount'),
                'isViral': video.get('stats', {}).get('playCount', 0) >= 100000
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
            return None

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

    async def process_message(self, message) -> None:
        """PubSubメッセージを処理"""
        async with self.semaphore:
            try:
                data = json.loads(message.data.decode('utf-8'))
                self.logger.debug(f"処理開始: video_id={data['video_id']}")

                # TikTokApiのセッション管理
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
                        # 処理済みデータをPubSubに送信
                        message_data = json.dumps(video_info).encode('utf-8')
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