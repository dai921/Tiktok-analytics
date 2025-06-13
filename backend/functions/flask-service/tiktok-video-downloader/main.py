import os
import tempfile
import traceback
import yt_dlp
import time
import datetime
import re
import json
import requests
import random
import base64
from typing import Optional
from google.cloud import storage
from google.cloud import pubsub_v1
from google.auth.exceptions import DefaultCredentialsError
import functions_framework
from flask import Request


# Cloud Function用のロガー設定
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 既存のdb_utils.pyを使用
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_utils import execute_query, execute_write_query

def execute_update(query: str, params: dict):
    """UPDATE/INSERT文を実行（既存database.pyの互換関数）"""
    try:
        # パラメータ名の形式を :name から %(name)s に変換
        converted_query = query
        converted_params = {}
        
        for key, value in params.items():
            converted_query = converted_query.replace(f":{key}", f"%({key})s")
            converted_params[key] = value
        
        execute_write_query(converted_query, converted_params)
        
    except Exception as e:
        logger.error(f"データベース更新エラー: {e}")
        raise Exception(f"データベース更新に失敗しました: {e}")

def fetch_one(query: str, params: dict = None) -> Optional[dict]:
    """単一レコードを取得（既存database.pyの互換関数）"""
    try:
        # パラメータ名の形式を :name から %(name)s に変換
        converted_query = query
        converted_params = {}
        
        if params:
            for key, value in params.items():
                converted_query = converted_query.replace(f":{key}", f"%({key})s")
                converted_params[key] = value
        
        results = execute_query(converted_query, converted_params or {})
        return results[0] if results else None
        
    except Exception as e:
        logger.error(f"データベース取得エラー: {e}")
        raise Exception(f"データベース取得に失敗しました: {e}")

class CloudStorageManager:
    def __init__(self):
        self.project_id = os.getenv("PROJECT_ID")
        self.bucket_name = os.getenv("CLOUD_STORAGE_BUCKET", "tiktok-videos-storage")
        self.client = None
        self.bucket = None
        self._initialized = False
    
    def _initialize(self):
        """遅延初期化でCloud Storage クライアントを設定"""
        if self._initialized:
            return
        
        try:
            self.client = storage.Client(project=self.project_id)
            self.bucket = self.client.bucket(self.bucket_name)
            self._initialized = True
            logger.info("Cloud Storage クライアントを初期化しました")
        except DefaultCredentialsError:
            logger.warning("Google Cloud認証情報が見つかりません。Cloud Storage機能は無効化されます。")
            raise Exception("Google Cloud認証情報が設定されていません")
        except Exception as e:
            logger.error(f"Cloud Storage初期化エラー: {str(e)}")
            raise Exception(f"Cloud Storage の初期化に失敗しました: {str(e)}")
    
    def upload_video(self, video_path: str, video_id: str) -> str:
        """動画をCloud Storageにアップロードし、URLを返す"""
        try:
            self._initialize()
            
            file_extension = os.path.splitext(video_path)[1]
            blob_name = f"videos/{video_id}{file_extension}"
            
            blob = self.bucket.blob(blob_name)
            blob.upload_from_filename(video_path)
            
            storage_url = blob.public_url
            
            logger.info(f"動画をCloud Storageにアップロードしました: {storage_url}")
            return storage_url
            
        except Exception as e:
            logger.error(f"Cloud Storageアップロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"Cloud Storageへのアップロードに失敗しました: {str(e)}")

class TikTokVideoDownloader:
    def __init__(self):
        self.proxy = self._get_proxy()
        
        # ランダムUser-Agentリスト
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ]
        
        self.ydl_base_opts = {
            'format': 'best[ext=mp4]/best',
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 60,
            'retries': 3,
            'fragment_retries': 3,
            'noprogress': True,
            'no_color': True,
            'ignoreerrors': True,
            'writeautomaticsub': False,
            'writesubtitles': False,
            'logger': logging.getLogger('yt-dlp').setLevel(logging.CRITICAL),
            'logtostderr': False,
            # エンコーディング設定
            'encoding': 'utf-8',
            'http_headers': {
                'User-Agent': random.choice(self.user_agents),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1'
            }
        }
        
        # プロキシ設定
        if self.proxy:
            self.ydl_base_opts['proxy'] = self.proxy
            logger.info(f"yt-dlpプロキシを設定: {self.proxy}")
    
    def _get_proxy(self) -> Optional[str]:
        """プロキシを取得（データベース優先）"""
        try:
            db_proxy = VideoTranscriptionRepository.get_active_proxy()
            if db_proxy:
                return db_proxy
            
            logger.info("プロキシは設定されていません")
            return None
            
        except Exception as e:
            logger.warning(f"プロキシ取得エラー: {str(e)}")
            return None
    
    def download_video(self, url: str, video_id: str) -> str:
        """yt-dlpのみで動画をダウンロード"""
        try:
            temp_dir = tempfile.mkdtemp()
            logger.info(f"一時ディレクトリを作成: {temp_dir}")
            
            # yt-dlpオプションを準備
            ydl_opts = self.ydl_base_opts.copy()
            safe_filename = f"{video_id}.%(ext)s"
            ydl_opts['outtmpl'] = os.path.join(temp_dir, safe_filename)
            
            # User-Agentをランダム化
            ydl_opts['http_headers']['User-Agent'] = random.choice(self.user_agents)
            
            # エンコーディング設定を明示的に指定
            ydl_opts['encoding'] = 'utf-8'
            
            logger.info(f"yt-dlpでダウンロード開始: {url}")
            logger.info(f"使用プロキシ: {self.proxy or 'なし'}")
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                try:
                    # 動画情報を事前取得
                    info = ydl.extract_info(url, download=False)
                    if info is None:
                        raise Exception("動画情報の取得に失敗しました")
                    
                    title = info.get('title', 'N/A')
                    duration = info.get('duration', 'N/A')
                    logger.info(f"動画情報取得成功: title={title}, duration={duration}秒")
                    
                    # 実際のダウンロード
                    ydl.download([url])
                    
                    # ダウンロードされたファイルを確認
                    ext = info.get('ext', 'mp4')
                    video_path = os.path.join(temp_dir, f"{video_id}.{ext}")
                    
                    if not os.path.exists(video_path):
                        files = os.listdir(temp_dir)
                        if files:
                            actual_file = files[0]
                            video_path = os.path.join(temp_dir, actual_file)
                            logger.info(f"実際のファイル名: {actual_file}")
                        else:
                            raise Exception(f"動画ファイルが見つかりません: {temp_dir}")
                    
                    file_size = os.path.getsize(video_path) / (1024 * 1024)  # MB
                    logger.info(f"動画ダウンロード完了: {video_path} ({file_size:.2f}MB)")
                    return video_path
                    
                except yt_dlp.utils.DownloadError as e:
                    logger.error(f"yt-dlpダウンロードエラー: {str(e)}")
                    raise Exception(f"動画のダウンロードに失敗しました: {str(e)}")
                except Exception as e:
                    logger.error(f"動画情報取得エラー: {str(e)}")
                    raise Exception(f"動画にアクセスできません: {str(e)}")
                
        except Exception as e:
            logger.error(f"動画ダウンロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"動画のダウンロードに失敗しました: {str(e)}")

class VideoTranscriptionRepository:
    """動画文字起こし関連のデータベース操作"""
    
    @staticmethod
    def find_video_by_id(video_id: str) -> Optional[dict]:
        """frontend_dataテーブルからvideo_idで動画を検索"""
        query = "SELECT url FROM frontend_data WHERE url LIKE :video_id_pattern LIMIT 1"
        return fetch_one(query, {"video_id_pattern": f"%{video_id}%"})
    
    @staticmethod
    def find_transcription_by_video_id(video_id: str) -> Optional[dict]:
        """video_transcriptionテーブルから文字起こしを検索"""
        query = "SELECT transcription FROM video_transcription WHERE video_id = :video_id"
        return fetch_one(query, {"video_id": video_id})
    
    @staticmethod
    def save_video_file_path(video_id: str, file_path: str):
        """動画ファイルパスをテーブルに保存（既存の場合は更新）"""
        # まず既存のレコードをチェック
        existing = VideoTranscriptionRepository.find_transcription_by_video_id(video_id)
        
        if existing:
            # 既存の場合はfile_pathのみ更新
            execute_update(
                "UPDATE video_transcription SET file_path = :file_path WHERE video_id = :video_id",
                {"video_id": video_id, "file_path": file_path}
            )
            logger.info(f"既存のレコードを更新: video_id={video_id}")
        else:
            # 新規の場合はINSERT
            execute_update(
                "INSERT INTO video_transcription (video_id, file_path, transcription) VALUES (:video_id, :file_path, '')",
                {"video_id": video_id, "file_path": file_path}
            )
            logger.info(f"新規レコードを挿入: video_id={video_id}")

    @staticmethod
    def get_video_file_path(video_id: str) -> Optional[str]:
        """動画ファイルパスを取得"""
        query = "SELECT file_path FROM video_transcription WHERE video_id = :video_id"
        result = fetch_one(query, {"video_id": video_id})
        return result['file_path'] if result else None
    
    @staticmethod
    def get_active_proxy() -> Optional[str]:
        """is_alive=1のプロキシをid順で一番上のものを取得"""
        query = "SELECT proxy FROM video_download_proxies WHERE is_alive = 1 ORDER BY id LIMIT 1"
        result = fetch_one(query)
        
        if result:
            logger.info(f"データベースからプロキシを取得: {result['proxy']}")
            return result['proxy']
        else:
            logger.info("利用可能なプロキシがデータベースに見つかりません")
            return None

def publish_transcription_task(video_id: str, storage_url: str, message_type: str):
    """文字起こしタスクをPub/Subに送信（typeも含める）"""
    try:
        project_id = os.getenv("PROJECT_ID")
        topic_name = os.getenv("TRANSCRIPTION_PUBSUB_TOPIC", "transcription-tasks")
        
        if not project_id:
            logger.error("PROJECT_ID環境変数が設定されていません")
            return None
        
        # Pub/Subクライアントを初期化
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, topic_name)
        
        # メッセージペイロード（typeも含める）
        message_data = {
            "video_id": video_id,
            "storage_url": storage_url,
            "type": message_type,  # typeフィールドを追加
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # メッセージを送信
        message_bytes = json.dumps(message_data).encode('utf-8')
        future = publisher.publish(topic_path, message_bytes)
        
        # 送信完了を待機
        message_id = future.result()
        
        logger.info(f"文字起こしタスクをPub/Subに送信: video_id={video_id}, type={message_type}, message_id={message_id}")
        return {"message_id": message_id, "topic": topic_name}
        
    except Exception as e:
        logger.error(f"Pub/Sub送信エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return None

class VideoStorageService:
    def __init__(self):
        self.storage_manager = None
        self.video_downloader = None
    
    def _get_storage_manager(self):
        """Cloud Storage マネージャーを遅延初期化で取得"""
        if self.storage_manager is None:
            self.storage_manager = CloudStorageManager()
        return self.storage_manager
    
    def _get_video_downloader(self):
        """動画ダウンローダーを遅延初期化で取得"""
        if self.video_downloader is None:
            self.video_downloader = TikTokVideoDownloader()
        return self.video_downloader
    
    def download_and_store_video(self, url: str, video_id: str) -> str:
        """動画をダウンロードしてCloud Storageに保存"""
        video_path = None
        
        try:
            # 1. 動画をダウンロード（yt-dlpのみ）
            video_downloader = self._get_video_downloader()
            video_path = video_downloader.download_video(url, video_id)
            
            # 2. Cloud Storageにアップロード
            storage_manager = self._get_storage_manager()
            storage_url = storage_manager.upload_video(video_path, video_id)
            
            # 3. テーブルにvideo_idとfile_pathを保存
            VideoTranscriptionRepository.save_video_file_path(video_id, storage_url)
            
            logger.info(f"動画保存・テーブル格納完了: video_id={video_id}, url={storage_url}")
            return storage_url
            
        except Exception as e:
            logger.error(f"動画保存処理エラー: {str(e)}")
            raise
        finally:
            # 一時ファイルを削除
            if video_path and os.path.exists(video_path):
                self._cleanup_temp_file(video_path)
    
    def _cleanup_temp_file(self, video_path: str):
        """一時ファイルをリトライ方式で削除"""
        for attempt in range(5):
            try:
                os.remove(video_path)
                logger.info(f"一時ファイル削除成功: {video_path}")
                
                # 一時ディレクトリも削除
                temp_dir = os.path.dirname(video_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
                    logger.info(f"一時ディレクトリ削除成功: {temp_dir}")
                break
                
            except Exception as cleanup_error:
                logger.warning(f"一時ファイル削除リトライ {attempt + 1}/5: {video_path} - {cleanup_error}")
                if attempt < 4:
                    time.sleep(1)
                else:
                    logger.error(f"一時ファイル削除に失敗しました: {video_path}")

def download_tiktok_video(event, context):
    """TikTok動画ダウンロードのメイン処理（Pub/Subトリガー）"""
    logger.info("==== download_tiktok_video関数の実行開始 ====")
    
    try:
        # Pub/Subメッセージの処理
        if 'data' in event:
            message_data = base64.b64decode(event['data']).decode('utf-8')
            request_data = json.loads(message_data)
            logger.info(f"Pub/Subメッセージを受信: {request_data}")
        else:
            logger.error("データなしのメッセージを受信")
            return {"success": False, "error": "データなしのメッセージを受信"}
        
        url = request_data.get("url")
        video_id = request_data.get("video_id")
        message_type = request_data.get("type") 
        
        if not url or not video_id:
            error_msg = "urlとvideo_idは必須です"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
        
        logger.info(f"動画ダウンロード開始: video_id={video_id}, url={url}, type={message_type}")
        
        # カルーセル（画像）チェック
        if "photo" in url:
            error_msg = "カルーセル（画像スライドショー）形式の投稿は処理できません"
            logger.warning(f"{error_msg}: {url}")
            return {"success": False, "error": error_msg}
        
        # 1. 動画保存処理
        storage_service = VideoStorageService()
        storage_url = storage_service.download_and_store_video(url, video_id)

        # 2. 文字起こしタスクをPub/Subに送信（typeも含める）
        transcription_result = publish_transcription_task(video_id, storage_url, message_type)

        # 3. レスポンス作成
        response = {
            "success": True,
            "video_id": video_id,
            "storage_url": storage_url,
            "type": message_type
        }

        if transcription_result:
            response["transcription_message_id"] = transcription_result.get("message_id")
            response["transcription_topic"] = transcription_result.get("topic")

        logger.info(f"動画ダウンロード完了: video_id={video_id}, type={message_type}")
        return response
        
    except Exception as e:
        logger.error(f"動画ダウンロード処理エラー: {str(e)}")
        logger.error(traceback.format_exc())
        # Pub/Subの場合、例外を発生させるとメッセージが再配信される
        raise e
    
    finally:
        logger.info("==== download_tiktok_video関数の実行終了 ====") 