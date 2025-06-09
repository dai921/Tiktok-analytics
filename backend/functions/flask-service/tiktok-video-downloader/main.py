import os
import tempfile
import traceback
import yt_dlp
import time
import datetime
import re
import json
import requests
from typing import Optional
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from google.cloud import storage
from google.auth.exceptions import DefaultCredentialsError
import functions_framework
from flask import Request

# Cloud Function用のロガー設定（既存のlogger_configは使用不可のため）
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 既存のdb_utils.pyを使用
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.db_utils import execute_query, execute_write_query

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
        self._bucket_made_public = False  # バケット公開設定フラグ
    
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
            # 遅延初期化（バケット公開設定も含む）
            self._initialize()
            
            # ファイル名にvideo_idを含める
            file_extension = os.path.splitext(video_path)[1]
            blob_name = f"videos/{video_id}{file_extension}"
            
            blob = self.bucket.blob(blob_name)
            blob.upload_from_filename(video_path)
            
            # 公開URLを生成（バケットが公開なので自動的に公開URL）
            storage_url = blob.public_url
            
            logger.info(f"動画をCloud Storageにアップロードしました: {storage_url}")
            return storage_url
            
        except Exception as e:
            logger.error(f"Cloud Storageアップロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"Cloud Storageへのアップロードに失敗しました: {str(e)}")

class TikTokVideoDownloader:
    def __init__(self):
        self.driver = None
        self.proxy = self._get_proxy()  # プロキシを初期化時に取得
        
        self.ydl_base_opts = {
            'format': 'best[ext=mp4]',
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 60,
            'http_headers': {
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36'
            }
        }
        
        # プロキシが取得できた場合は設定
        if self.proxy:
            self.ydl_base_opts['proxy'] = self.proxy
            logger.info(f"yt-dlpプロキシを設定: {self.proxy}")
    
    def _get_proxy(self) -> Optional[str]:
        """プロキシを取得（データベース優先、フォールバック：環境変数）"""
        try:
            # 1. データベースからプロキシを取得
            db_proxy = VideoTranscriptionRepository.get_active_proxy()
            if db_proxy:
                return db_proxy
            
            logger.info("プロキシは設定されていません")
            return None
            
        except Exception as e:
            logger.warning(f"プロキシ取得エラー: {str(e)}")
            return None
    
    def _setup_selenium_driver(self):
        """Selenium WebDriverを設定"""
        if self.driver is not None:
            return
        
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--disable-extensions')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36')
            
            # プロキシ設定（データベースまたは環境変数から取得）
            if self.proxy:
                chrome_options.add_argument(f'--proxy-server={self.proxy}')
                logger.info(f"Seleniumプロキシを設定: {self.proxy}")
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            
            logger.info("Selenium WebDriverを初期化しました")
            
        except Exception as e:
            logger.error(f"Selenium WebDriver初期化エラー: {str(e)}")
            raise Exception(f"WebDriverの初期化に失敗しました: {str(e)}")
    
    def _access_tiktok_page(self, url: str):
        """SeleniumでTikTokページにアクセス"""
        try:
            logger.info(f"TikTokページにアクセス中: {url}")
            self.driver.get(url)
            
            # ページロード待機
            time.sleep(5)
            logger.info("ページロード完了")
            
            # 追加待機（動画の読み込み待ち）
            time.sleep(10)
            
            # 現在時刻をログに記録
            now_jst = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
            logger.info(f"yt-dlp実行直前: {now_jst.strftime('%Y-%m-%d %H:%M:%S')} (JST)")
            
        except Exception as e:
            logger.error(f"TikTokページアクセスエラー: {str(e)}")
            raise Exception(f"ページアクセスに失敗しました: {str(e)}")
    
    def download_video(self, url: str, video_id: str) -> str:
        """TikTok動画をSelenium + yt-dlpでダウンロードし、ファイルパスを返す"""
        video_path = None
        
        try:
            # 1. Selenium WebDriverを設定
            self._setup_selenium_driver()
            
            # 2. TikTokページにアクセス
            self._access_tiktok_page(url)
            
            # 3. 一時ディレクトリを作成
            temp_dir = tempfile.mkdtemp()
            logger.info(f"一時ディレクトリを作成: {temp_dir}")
            
            # 4. yt-dlpの設定を準備
            ydl_opts = self.ydl_base_opts.copy()
            safe_filename = f"{video_id}.%(ext)s"
            ydl_opts['outtmpl'] = os.path.join(temp_dir, safe_filename)
            
            # 5. yt-dlpで動画ダウンロード
            logger.info(f"yt-dlpでダウンロード開始: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # 動画情報を取得
                info = ydl.extract_info(url, download=False)
                
                # 実際にダウンロード実行
                ydl.download([url])
                
                # ダウンロードされたファイルのパスを取得
                ext = info.get('ext', 'mp4')
                video_path = os.path.join(temp_dir, f"{video_id}.{ext}")
                
                if not os.path.exists(video_path):
                    raise Exception(f"動画ファイルが見つかりません: {video_path}")
                
                logger.info(f"動画ダウンロード完了: {video_path}")
                return video_path
                
        except Exception as e:
            logger.error(f"動画ダウンロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"動画のダウンロードに失敗しました: {str(e)}")
    
    def cleanup(self):
        """リソースのクリーンアップ"""
        if self.driver:
            try:
                self.driver.quit()
                self.driver = None
                logger.info("Selenium WebDriverを終了しました")
            except Exception as e:
                logger.warning(f"WebDriver終了時にエラー: {str(e)}")
    
    def __del__(self):
        """デストラクタでクリーンアップ"""
        self.cleanup()

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
        """動画ファイルパスをテーブルに保存"""
        execute_update(
            "INSERT INTO video_transcription (video_id, file_path, transcription) VALUES (:video_id, :file_path, '')",
            {"video_id": video_id, "file_path": file_path}
        )

    @staticmethod
    def get_video_file_path(video_id: str) -> Optional[str]:
        """動画ファイルパスを取得"""
        query = "SELECT file_path FROM video_transcription WHERE video_id = :video_id"
        result = fetch_one(query, {"video_id": video_id})
        return result['file_path'] if result else None
    
    @staticmethod
    def update_transcription(video_id: str, transcription: str):
        """文字起こし結果を更新"""
        execute_update(
            "UPDATE video_transcription SET transcription = :transcription WHERE video_id = :video_id",
            {"video_id": video_id, "transcription": transcription}
        )
    
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

class TikTokUrlExtractor:
    """TikTok URL解析クラス"""
    
    @staticmethod
    def extract_video_id_from_url(url: str) -> Optional[str]:
        """TikTok動画URLからvideo_idを抽出する"""
        patterns = [
            r'tiktok\.com/@[\w.]+/video/(\d+)',  # 標準的なTikTok URL
            r'vm\.tiktok\.com/(\w+)',           # 短縮URL
            r'vt\.tiktok\.com/(\w+)'            # 別の短縮URL形式
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None

def call_transcription_function(video_id: str, storage_url: str):
    """文字起こしCloud Functionを呼び出し"""
    try:
        transcription_function_url = os.getenv("TRANSCRIPTION_FUNCTION_URL")
        if not transcription_function_url:
            logger.warning("TRANSCRIPTION_FUNCTION_URL環境変数が設定されていません")
            return None
        
        payload = {
            "video_id": video_id,
            "storage_url": storage_url
        }
        
        response = requests.post(
            transcription_function_url,
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            logger.info(f"文字起こしFunction呼び出し成功: video_id={video_id}")
            return response.json()
        else:
            logger.error(f"文字起こしFunction呼び出し失敗: {response.status_code}")
            return None
            
    except Exception as e:
        logger.error(f"文字起こしFunction呼び出しエラー: {str(e)}")
        return None

class VideoStorageService:
    def __init__(self):
        # 遅延初期化のため、インスタンス作成時は何もしない
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
        """動画をダウンロードしてCloud Storageに保存し、テーブルにファイルパスを格納"""
        video_path = None
        video_downloader = None
        
        try:
            # 1. 動画をダウンロード（Selenium + yt-dlp）
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
            # 1. 一時ファイルを削除（リトライ方式）
            if video_path and os.path.exists(video_path):
                self._cleanup_temp_file(video_path)
            
            # 2. Seleniumリソースをクリーンアップ
            if video_downloader:
                video_downloader.cleanup()
    
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
                if attempt < 4:  # 最後のリトライでない場合は待機
                    time.sleep(1)
                else:
                    logger.error(f"一時ファイル削除に失敗しました: {video_path}")

@functions_framework.http
def download_tiktok_video(request: Request):
    """TikTok動画ダウンロードのメイン処理"""
    try:
        # リクエストデータの取得
        request_json = request.get_json(silent=True)
        if not request_json:
            return {
                "success": False,
                "error": "リクエストボディが無効です"
            }, 400
        
        url = request_json.get("url")
        video_id = request_json.get("video_id")
        
        if not url or not video_id:
            return {
                "success": False,
                "error": "urlとvideo_idは必須です"
            }, 400
        
        logger.info(f"動画ダウンロード開始: video_id={video_id}, url={url}")
        
        # カルーセル（画像）チェック
        if "photo" in url:
            logger.warning(f"カルーセル（画像）形式の投稿: {url}")
            return {
                "success": False,
                "error": "カルーセル（画像スライドショー）形式の投稿は処理できません"
            }, 400
        
        # 1. 動画保存処理
        storage_service = VideoStorageService()
        storage_url = storage_service.download_and_store_video(url, video_id)
        
        # 2. 文字起こしFunction呼び出し
        transcription_result = call_transcription_function(video_id, storage_url)
        
        # 3. レスポンス作成
        response = {
            "success": True,
            "video_id": video_id,
            "storage_url": storage_url
        }
        
        if transcription_result:
            response["transcription_task_id"] = transcription_result.get("task_id")
        
        logger.info(f"動画ダウンロード完了: video_id={video_id}")
        return response, 200
        
    except Exception as e:
        logger.error(f"動画ダウンロード処理エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": f"動画ダウンロード処理中にエラーが発生しました: {str(e)}"
        }, 500 