from fastapi import APIRouter, HTTPException, Request
import re
import os
from typing import Optional
import traceback
from src.db.database import execute_query, fetch_one, execute_update
from src.utils.logger_config import setup_logger
from .models import TranscriptionRequest, JobResponse, TranscriptionResponse, JobStatus
from .cloud_function_service import CloudFunctionService
from .repositories import VideoTranscriptionRepository, TikTokUrlExtractor

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
async def start_transcription(request: TranscriptionRequest):
    """文字起こし処理を開始"""
    try:
        url = request.url
        logger.info(f"文字起こしリクエスト: URL={url}")
        
        # カルーセル（画像スライドショー）のチェック
        if "photo" in url:
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
        
        # ①frontend_dataテーブルを検索し、video_idが存在するか確認
        video_result = VideoTranscriptionRepository.find_video_by_id(video_id)
        if not video_result:
            logger.warning(f"指定されたvideo_id {video_id} が見つかりません")
            return JobResponse(
                success=False,
                job_id="",
                video_id=video_id,
                status=JobStatus.FAILED,
                error="指定された動画が見つかりません。ダッシュボードに存在するTikTok動画URLを入力してください。"
            )
        
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
            logger.info(f"新規文字起こし処理を開始: video_id={video_id}")
            
            cf_service = get_cloud_function_service()
            
            # Cloud Function呼び出し
            success = await cf_service.start_transcription_job(video_id, url)
            
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
async def transcribe_video_legacy(request: TranscriptionRequest):
    """レガシーエンドポイント（後方互換性）"""
    logger.warning("レガシーエンドポイントが使用されました。/startエンドポイントの使用を推奨します。")
    
    # 新しいエンドポイントにリダイレクト
    job_response = await start_transcription(request)
    
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
            # 処理中の場合
            return {
                "success": True,
                "video_id": job_response.video_id,
                "status": job_response.status.value,
                "message": "処理を開始しました。/result/{video_id}で結果を確認してください。"
            }
    else:
        return {
            "success": False,
            "error": job_response.error
        }
