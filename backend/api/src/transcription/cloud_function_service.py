import os
import requests
from src.utils.logger_config import setup_logger

logger = setup_logger()

class CloudFunctionService:
    """Cloud Function呼び出しサービス"""
    
    def __init__(self):
        self.download_function_url = os.getenv("TIKTOK_DOWNLOADER_FUNCTION_URL")
        self.transcription_function_url = os.getenv("TRANSCRIPTION_FUNCTION_URL")
        
        if not self.download_function_url:
            logger.warning("TIKTOK_DOWNLOADER_FUNCTION_URL環境変数が設定されていません")
        if not self.transcription_function_url:
            logger.warning("TRANSCRIPTION_FUNCTION_URL環境変数が設定されていません")
    
    async def start_transcription_job(self, video_id: str, url: str) -> bool:
        """Cloud Functionを呼び出して文字起こしジョブを開始"""
        try:
            if not self.download_function_url:
                raise Exception("動画ダウンロードFunction URLが設定されていません")
            
            # 動画ダウンロードFunction呼び出し
            payload = {
                "url": url,
                "video_id": video_id
            }
            
            logger.info(f"動画ダウンロードFunctionを呼び出し: video_id={video_id}")
            response = requests.post(
                self.download_function_url,
                json=payload,
                timeout=240
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(f"動画ダウンロードFunction呼び出し成功: video_id={video_id}")
                    return True
                else:
                    logger.error(f"動画ダウンロード失敗: {result.get('error', '不明なエラー')}")
                    return False
            else:
                logger.error(f"動画ダウンロードFunction呼び出し失敗: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Cloud Function呼び出しエラー: {str(e)}")
            return False 