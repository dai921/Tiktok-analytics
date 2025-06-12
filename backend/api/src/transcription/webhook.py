from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional
import traceback
from src.utils.logger_config import setup_logger
from .repositories import VideoTranscriptionRepository

logger = setup_logger()

# Webhookルーターの設定
router = APIRouter(
    prefix="/api/webhook",
    tags=["webhook"],
)

class WebhookNotification(BaseModel):
    video_id: str
    status: str  # "completed" or "failed"
    error: Optional[str] = None
    transcription: Optional[str] = None

@router.post("/transcription-complete")
async def handle_transcription_complete(notification: WebhookNotification):
    """Cloud Functionからの文字起こし完了通知を処理"""
    try:
        logger.info(f"Webhook通知受信: video_id={notification.video_id}, status={notification.status}")
        
        if notification.status == "completed":
            # 成功時: 文字起こしデータを保存
            if notification.transcription:
                # 文字起こし結果をデータベースに保存
                VideoTranscriptionRepository.save_transcription(
                    notification.video_id,
                    notification.transcription
                )
                logger.info(f"文字起こし完了・保存: video_id={notification.video_id}")
            else:
                logger.warning(f"文字起こし完了通知に文字起こし内容がありません: video_id={notification.video_id}")
            
            return {
                "success": True,
                "message": "文字起こし完了通知を受信しました"
            }
            
        elif notification.status == "failed":
            # 失敗時: ログ出力のみ
            logger.error(f"文字起こし失敗: video_id={notification.video_id}, error={notification.error}")
            
            return {
                "success": True,
                "message": "文字起こし失敗通知を受信しました"
            }
        else:
            logger.warning(f"不明なステータス: {notification.status}")
            return {
                "success": False,
                "error": f"不明なステータス: {notification.status}"
            }
            
    except Exception as e:
        logger.error(f"Webhook処理エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": f"Webhook処理中にエラーが発生しました: {str(e)}"
        } 