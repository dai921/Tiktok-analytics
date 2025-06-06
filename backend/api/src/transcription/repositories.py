import os
import tempfile
import traceback
import yt_dlp
from google.cloud import storage
from src.utils.logger_config import setup_logger
from src.db.database import execute_update

logger = setup_logger()

class CloudStorageManager:
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.bucket_name = os.getenv("CLOUD_STORAGE_BUCKET", "tiktok-videos-storage")
        self.client = storage.Client(project=self.project_id)
        self.bucket = self.client.bucket(self.bucket_name)
    
    def upload_video(self, video_path: str, video_id: str) -> str:
        """動画をCloud Storageにアップロードし、URLを返す"""
        try:
            # ファイル名にvideo_idを含める
            file_extension = os.path.splitext(video_path)[1]
            blob_name = f"videos/{video_id}{file_extension}"
            
            blob = self.bucket.blob(blob_name)
            blob.upload_from_filename(video_path)
            
            # 公開URLを生成
            blob.make_public()
            storage_url = blob.public_url
            
            logger.info(f"動画をCloud Storageにアップロードしました: {storage_url}")
            return storage_url
            
        except Exception as e:
            logger.error(f"Cloud Storageアップロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"Cloud Storageへのアップロードに失敗しました: {str(e)}")


class TikTokVideoDownloader:
    def __init__(self):
        self.ydl_opts = {
            'format': 'best[ext=mp4]',
            'outtmpl': '%(id)s.%(ext)s',
            'quiet': True,
            'no_warnings': True,
        }
    
    def download_video(self, url: str, video_id: str) -> str:
        """TikTok動画をダウンロードし、ファイルパスを返す"""
        try:
            # 一時ディレクトリを作成
            temp_dir = tempfile.mkdtemp()
            
            # ダウンロード設定を更新
            ydl_opts = self.ydl_opts.copy()
            ydl_opts['outtmpl'] = os.path.join(temp_dir, f"{video_id}.%(ext)s")
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # 動画情報を取得
                info = ydl.extract_info(url, download=False)
                
                # カルーセル（画像）の場合はエラー
                if info.get('_type') == 'playlist' or 'entries' in info:
                    raise Exception("カルーセル形式の投稿は対応していません")
                
                # 動画をダウンロード
                ydl.download([url])
                
                # ダウンロードされたファイルのパスを取得
                ext = info.get('ext', 'mp4')
                video_path = os.path.join(temp_dir, f"{video_id}.{ext}")
                
                if not os.path.exists(video_path):
                    raise Exception(f"動画ファイルが見つかりません: {video_path}")
                
                logger.info(f"動画をダウンロードしました: {video_path}")
                return video_path
                
        except Exception as e:
            logger.error(f"動画ダウンロードエラー: {str(e)}")
            logger.error(traceback.format_exc())
            raise Exception(f"動画のダウンロードに失敗しました: {str(e)}")


class VideoStorageService:
    def __init__(self):
        self.storage_manager = CloudStorageManager()
        self.video_downloader = TikTokVideoDownloader()
    
    async def download_and_store_video(self, url: str, video_id: str) -> str:
        """動画をダウンロードしてCloud Storageに保存し、URLを返す"""
        video_path = None
        try:
            # 1. 動画をダウンロード
            video_path = self.video_downloader.download_video(url, video_id)
            
            # 2. Cloud Storageにアップロード
            storage_url = self.storage_manager.upload_video(video_path, video_id)
            
            logger.info(f"動画保存完了: {storage_url}")
            return storage_url
            
        except Exception as e:
            logger.error(f"動画保存処理エラー: {str(e)}")
            raise
        finally:
            # 一時ファイルを削除
            if video_path and os.path.exists(video_path):
                try:
                    os.remove(video_path)
                    # 一時ディレクトリも削除
                    temp_dir = os.path.dirname(video_path)
                    if os.path.exists(temp_dir):
                        os.rmdir(temp_dir)
                except Exception as cleanup_error:
                    logger.warning(f"一時ファイルの削除に失敗: {cleanup_error}")
