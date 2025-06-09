import os
import traceback
import re
import tempfile
import requests
from typing import Optional
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from google.cloud import storage
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
    """Cloud Storage管理"""
    
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
        except Exception as e:
            logger.error(f"Cloud Storage初期化エラー: {str(e)}")
            raise Exception(f"Cloud Storage の初期化に失敗しました: {str(e)}")
    
    def download_video(self, storage_url: str) -> str:
        """Cloud Storageから動画をダウンロード"""
        try:
            self._initialize()
            
            # URLからblob名を抽出
            blob_name = storage_url.split('/')[-1]
            if '/' in storage_url and 'videos/' in storage_url:
                # videos/video_id.mp4 形式の場合
                blob_name = f"videos/{blob_name}"
            
            blob = self.bucket.blob(blob_name)
            
            # 一時ファイルにダウンロード
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
            blob.download_to_filename(temp_file.name)
            
            logger.info(f"動画をダウンロードしました: {temp_file.name}")
            return temp_file.name
            
        except Exception as e:
            logger.error(f"動画ダウンロードエラー: {str(e)}")
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

class GeminiTranscriptionService:
    """Gemini APIを使った文字起こしサービス"""
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.repository = VideoTranscriptionRepository()
        
        if self.api_key:
            genai.configure(api_key=self.api_key)
        else:
            logger.warning("GEMINI_API_KEY環境変数が設定されていません。文字起こし機能が動作しません。")
    
    async def generate_transcription(self, video_id: str, video_path: str) -> str:
        """GeminiモデルでTikTok動画の文字起こしを生成する"""
        try:
            if not self.api_key:
                raise Exception("Gemini APIキーが設定されていません")
            
            # 動画ファイルを読み込み
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
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        
        # 3. 各行の前後の空白を除去（改行は保持）
        lines = cleaned.split('\n')
        lines = [line.strip() for line in lines]
        cleaned = '\n'.join(lines)
        
        # 4. 空の行を除去しすぎないように、意味のある空行は1つまで保持
        cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
        
        logger.info(f"文字起こしテキストをクリーニングしました（{len(raw_text)}文字 → {len(cleaned)}文字）")
        return cleaned

@functions_framework.http
async def process_video_transcription(request: Request):
    """動画文字起こし処理のメイン処理"""
    video_path = None
    
    try:
        # リクエストデータの取得
        request_json = request.get_json(silent=True)
        if not request_json:
            return {
                "success": False,
                "error": "リクエストボディが無効です"
            }, 400
        
        video_id = request_json.get("video_id")
        storage_url = request_json.get("storage_url")
        
        if not video_id or not storage_url:
            return {
                "success": False,
                "error": "video_idとstorage_urlは必須です"
            }, 400
        
        logger.info(f"文字起こし処理開始: video_id={video_id}, storage_url={storage_url}")
        
        # 1. Cloud Storageから動画をダウンロード
        storage_manager = CloudStorageManager()
        video_path = storage_manager.download_video(storage_url)
        
        # 2. Geminiで文字起こし生成
        transcription_service = GeminiTranscriptionService()
        transcription = await transcription_service.generate_transcription(video_id, video_path)
        
        # 3. レスポンス作成
        response = {
            "success": True,
            "video_id": video_id,
            "transcription": transcription
        }
        
        logger.info(f"文字起こし処理完了: video_id={video_id}")
        return response, 200
        
    except Exception as e:
        logger.error(f"文字起こし処理エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": f"文字起こし処理中にエラーが発生しました: {str(e)}"
        }, 500
        
    finally:
        # クリーンアップ
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
                logger.info(f"一時ファイル削除: {video_path}")
            except Exception as cleanup_error:
                logger.warning(f"一時ファイル削除エラー: {cleanup_error}") 