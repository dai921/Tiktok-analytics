from fastapi import APIRouter, HTTPException, Request, Depends
import re
import os
from typing import Optional
import traceback
from src.db.database import execute_query, fetch_one, execute_update
from src.utils.logger_config import setup_logger
from .models import TranscriptionRequest, JobResponse, TranscriptionResponse, JobStatus
from .cloud_function_service import CloudFunctionService
from .repositories import VideoTranscriptionRepository, TikTokUrlExtractor
from src.auth.router import get_current_user
from src.auth.models import User

# ロガーのセットアップ
logger = setup_logger()

# APIルーターの設定
router = APIRouter(
    prefix="/api/transcription",
    tags=["transcription"],
)

# Cloud Function サービス（遅延初期化）
cloud_function_service = None

def get_cloud_function_service():
    """Cloud Function サービスを取得（遅延初期化）"""
    global cloud_function_service
    if cloud_function_service is None:
        cloud_function_service = CloudFunctionService()
    return cloud_function_service

@router.post("/start", response_model=JobResponse)
async def start_transcription(
    request: TranscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    """文字起こし処理を開始"""
    return await _start_transcription_impl(request.url, current_user)


async def _start_transcription_impl(url: str, current_user: User) -> JobResponse:
    try:
        logger.info(f"文字起こしリクエスト: URL={url}, user_number={current_user.user_number}")
        
        # カルーセル（画像スライドショー）のチェック - 短縮URLにも対応
        if TikTokUrlExtractor.is_carousel_or_photo_url(url):
            logger.warning(f"カルーセル（画像）形式の投稿: {url}")
            return JobResponse(
                success=False,
                job_id="",
                video_id="",
                status=JobStatus.FAILED,
                error="カルーセル（画像スライドショー）形式の投稿は文字起こしできません。動画形式のURLを入力してください。"
            )
        
        # URLからvideo_idを抽出
        video_id = TikTokUrlExtractor.extract_video_id_from_url(url)
        if not video_id:
            logger.warning(f"無効なURL形式: {url}")
            return JobResponse(
                success=False,
                job_id="",
                video_id="",
                status=JobStatus.FAILED,
                error="無効なURL形式です。TikTok動画のURLを入力してください。"
            )
        
        logger.info(f"抽出されたvideo_id: {video_id}")
        
        # ②既存の文字起こしデータをチェック
        transcription_result = VideoTranscriptionRepository.find_transcription_by_video_id(video_id)
        
        if transcription_result and transcription_result["transcription"]:
            # 既存の文字起こしデータがある場合は即座に返す
            logger.info(f"既存の文字起こしデータを返します: video_id={video_id}")
            return JobResponse(
                success=True,
                job_id="",
                video_id=video_id,
                status=JobStatus.COMPLETED,
                message="既存の文字起こしデータが利用可能です"
            )
        else:
            # 新規処理: Cloud Functionを直接呼び出し
            logger.info(f"新規文字起こし処理を開始: video_id={video_id}, user_number={current_user.user_number}")
            
            cf_service = get_cloud_function_service()
            
            # Cloud Function呼び出し（user_numberを付与）
            success = await cf_service.start_transcription_job(video_id, url, user_number=current_user.user_number)
            
            if success:
                return JobResponse(
                    success=True,
                    job_id="",
                    video_id=video_id,
                    status=JobStatus.PROCESSING,
                    message="文字起こし処理を開始しました"
                )
            else:
                return JobResponse(
                    success=False,
                    job_id="",
                    video_id=video_id,
                    status=JobStatus.FAILED,
                    error="Cloud Function呼び出しに失敗しました"
                )
            
    except Exception as e:
        logger.error(f"文字起こし開始エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return JobResponse(
            success=False,
            job_id="",
            video_id="",
            status=JobStatus.FAILED,
            error=f"文字起こし処理中にエラーが発生しました: {str(e)}"
        )

@router.get("/result/{video_id}", response_model=TranscriptionResponse)
async def get_transcription_result(video_id: str):
    """video_idから文字起こし結果を取得"""
    try:
        logger.info(f"文字起こし結果取得: video_id={video_id}")
        
        # 文字起こし結果を取得
        transcription_result = VideoTranscriptionRepository.find_transcription_by_video_id(video_id)
        
        if transcription_result and transcription_result["transcription"]:
            return TranscriptionResponse(
                success=True,
                video_id=video_id,
                transcription=transcription_result["transcription"],
                source="database"
            )
        else:
            return TranscriptionResponse(
                success=False,
                video_id=video_id,
                source="not_found",
                error="指定された動画の文字起こしデータが見つかりません"
            )
            
    except Exception as e:
        logger.error(f"文字起こし結果取得エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return TranscriptionResponse(
            success=False,
            video_id=video_id,
            source="error",
            error=f"文字起こし結果取得中にエラーが発生しました: {str(e)}"
        )

# 既存のエンドポイント（後方互換性のため残しておく）
@router.post("")
async def transcribe_video_legacy(
    request: TranscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    """レガシーエンドポイント（後方互換性）"""
    logger.warning("レガシーエンドポイントが使用されました。/startエンドポイントの使用を推奨します。")
    
    # 新しいエンドポイントにリダイレクト
    job_response = await _start_transcription_impl(request.url, current_user)
    
    if job_response.success:
        if job_response.status == JobStatus.COMPLETED:
            # 既存データの場合は即座に結果を返す
            result = await get_transcription_result(job_response.video_id)
            return {
                "success": True,
                "video_id": job_response.video_id,
                "transcription": result.transcription,
                "source": "database"
            }
        else:
            # 新規処理の場合：結果が出るまで待機
            # ポーリングでCloud Function完了を待つ
            import asyncio
            max_wait_time = 300  # 180秒から300秒（5分）に延長
            poll_interval = 10   # 10秒間隔
            waited_time = 0
            
            while waited_time < max_wait_time:
                await asyncio.sleep(poll_interval)
                waited_time += poll_interval
                
                # 結果を確認
                result = await get_transcription_result(job_response.video_id)
                if result.success and result.transcription:
                    return {
                        "success": True,
                        "video_id": job_response.video_id,
                        "transcription": result.transcription,
                        "source": "generated"
                    }
            
            # タイムアウトの場合
            return {
                "success": False,
                "error": "文字起こし処理がタイムアウトしました。しばらく後に再度お試しください。"
            }
    else:
        return {
            "success": False,
            "error": job_response.error
        }
