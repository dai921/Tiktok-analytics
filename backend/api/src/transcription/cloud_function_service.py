import os
import requests
from src.utils.logger_config import setup_logger
import datetime
import json
from google.cloud import pubsub_v1
from typing import Optional

logger = setup_logger()

class CloudFunctionService:
    """Cloud Function呼び出しサービス"""
    
    def __init__(self):
        # Cloud Run では ADC を使用するため、環境変数による鍵ファイル指定は無効化する
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            logger.warning("GOOGLE_APPLICATION_CREDENTIALS が設定されていますが、Cloud Run では使用しません。変数を無効化します。")
            try:
                del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
            except Exception:
                # 失敗しても致命的ではないため無視
                pass

        self.download_function_url = os.getenv("TIKTOK_DOWNLOADER_FUNCTION_URL")
        self.transcription_function_url = os.getenv("TRANSCRIPTION_FUNCTION_URL")
        
        if not self.download_function_url:
            logger.warning("TIKTOK_DOWNLOADER_FUNCTION_URL環境変数が設定されていません")
        if not self.transcription_function_url:
            logger.warning("TRANSCRIPTION_FUNCTION_URL環境変数が設定されていません")
    
    async def start_transcription_job(self, video_id: str, url: str, user_number: Optional[int] = None) -> bool:
        """文字起こし用の動画ダウンロードジョブを開始"""
        try:
            # Pub/Subでメッセージを送信
            message_data = {
                "url": url,
                "video_id": video_id,
                "type": "transcription",  # 文字起こし用であることを明示
                "user_number": user_number,
            }
            
            # Pub/Subトピックに送信
            publisher = pubsub_v1.PublisherClient()
            topic_path = publisher.topic_path(
                os.getenv("PROJECT_ID"), 
                os.getenv("VIDEO_DOWNLOADER_PUBSUB_TOPIC", "video-download-tasks")
            )
            
            message_bytes = json.dumps(message_data).encode('utf-8')
            future = publisher.publish(topic_path, message_bytes)
            message_id = future.result()
            
            logger.info(f"文字起こし用動画ダウンロードタスクを送信: video_id={video_id}, message_id={message_id}")
            return True
            
        except Exception as e:
            logger.error(f"Cloud Function Pub/Sub送信エラー: {str(e)}")
            return False 