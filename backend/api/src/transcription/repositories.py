import os
import tempfile
import traceback
import yt_dlp
import time
import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from google.cloud import storage
from google.auth.exceptions import DefaultCredentialsError
from src.utils.logger_config import setup_logger
from src.db.database import execute_update, fetch_one
from typing import Optional
import re
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

logger = setup_logger()

class CloudStorageManager:
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
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
            # エラー時は環境変数フォールバック
            env_proxy = os.getenv("DOWNLOAD_PROXY")
            if env_proxy:
                logger.info(f"エラー時のフォールバック：環境変数からプロキシを取得: {env_proxy}")
                return env_proxy
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


class GeminiTranscriptionService:
    """Gemini APIを使った文字起こしサービス"""
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.repository = VideoTranscriptionRepository()
        
        if self.api_key:
            genai.configure(api_key=self.api_key)
        else:
            logger.warning("GEMINI_API_KEY環境変数が設定されていません。文字起こし機能が動作しません。")
    
    async def generate_transcription(self, video_id: str) -> str:
        """GeminiモデルでTikTok動画の文字起こしを生成する"""
        try:
            if not self.api_key:
                raise Exception("Gemini APIキーが設定されていません")
            
            video_path = VideoTranscriptionRepository.get_video_file_path(video_id)
            with open(video_path, 'rb') as f:
                video_data = f.read()
            
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            prompt = """
            以下のコンテンツの文字起こしを行ってください：

            メインは映像に表示されているテロップのテキストを抽出してください
            もしテロップがなければ音声を抽出してください
            結果は文字起こしのみを出力してください

            注意点：
            - 日本語で出力してください
            - テキストが見つからない場合は「テキストなし」と記載
            - テロップが切り替わるごとに改行してください
            """
            
            response = model.generate_content(
                prompt,
                {
                    "mime_type": "video/mp4",
                    "data": video_data
                }
            )
            
            # より安全な文字列クリーニング処理
            raw_transcription = response.text
            transcription = self._clean_transcription_text(raw_transcription)
            
            # データベースに保存
            self.repository.update_transcription(video_id, transcription)
            
            return transcription
            
        except Exception as e:
            logger.error(f"Geminiによる文字起こし生成エラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"文字起こし生成中にエラーが発生しました: {str(e)}")
    
    def _clean_transcription_text(self, raw_text: str) -> str:
        """文字起こしテキストをクリーニング（改行は保持）"""
        if not raw_text:
            return ""
        
        # 1. 前後の余分な空白・改行を除去
        cleaned = raw_text.strip()
        
        # 2. 連続する空行を2行まで制限（読みやすさのため）
        import re
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        
        # 3. 各行の前後の空白を除去（改行は保持）
        lines = cleaned.split('\n')
        lines = [line.strip() for line in lines]
        cleaned = '\n'.join(lines)
        
        # 4. 空の行を除去しすぎないように、意味のある空行は1つまで保持
        cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
        
        logger.info(f"文字起こしテキストをクリーニングしました（{len(raw_text)}文字 → {len(cleaned)}文字）")
        return cleaned


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
    
    async def download_and_store_video(self, url: str, video_id: str) -> str:
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
