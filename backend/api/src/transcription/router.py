from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import re
import os
from typing import Optional
import traceback
from src.db.database import execute_query, fetch_one, execute_update
from src.utils.logger_config import setup_logger
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from .repositories import (
    VideoStorageService, 
    VideoTranscriptionRepository,
    TikTokUrlExtractor,
    GeminiTranscriptionService
)

# ロガーのセットアップ
logger = setup_logger()

# APIルーターの設定
router = APIRouter(
    prefix="/api/transcription",
    tags=["transcription"],
)

# リクエストモデルの定義
class TranscriptionRequest(BaseModel):
    url: str

# Gemini APIの設定
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY環境変数が設定されていません。文字起こし機能が動作しません。")

# 動画保存サービス（遅延初期化）
video_storage_service = None

def get_video_storage_service():
    """動画保存サービスを取得（遅延初期化）"""
    global video_storage_service
    if video_storage_service is None:
        video_storage_service = VideoStorageService()
    return video_storage_service

@router.post("")
async def transcribe_video(request: TranscriptionRequest):
    """TikTok動画URLから文字起こしを取得または生成するエンドポイント"""
    try:
        url = request.url
        logger.info(f"文字起こしリクエスト: URL={url}")
        
        # カルーセル（画像スライドショー）のチェック
        if "photo" in url:
            logger.warning(f"カルーセル（画像）形式の投稿は文字起こしできません: {url}")
            return {
                "success": False,
                "error": "カルーセル（画像スライドショー）形式の投稿は文字起こしできません。動画形式のURLを入力してください。"
            }
        
        # URLからvideo_idを抽出（静的メソッドを直接呼び出し）
        video_id = TikTokUrlExtractor.extract_video_id_from_url(url)
        if not video_id:
            logger.warning(f"無効なURL形式: {url}")
            return {
                "success": False,
                "error": "無効なURL形式です。TikTok動画のURLを入力してください。"
            }
        
        logger.info(f"抽出されたvideo_id: {video_id}")
        
        # ①frontend_dataテーブルを検索し、video_idが存在するか確認（静的メソッド呼び出し）
        video_result = VideoTranscriptionRepository.find_video_by_id(video_id)
        if not video_result:
            logger.warning(f"指定されたvideo_id {video_id} が見つかりません")
            return {
                "success": False,
                "error": "指定された動画が見つかりません。有効なTikTok動画URLを入力してください。"
            }
        
        # ②video_transcriptionテーブルを検索（文字起こし済みかチェック）（静的メソッド呼び出し）
        transcription_result = VideoTranscriptionRepository.find_transcription_by_video_id(video_id)
        
        if transcription_result and transcription_result["transcription"]:
            # 既存の文字起こしデータがある場合はそれを返す
            logger.info(f"既存の文字起こしデータを返します: video_id={video_id}")
            return {
                "success": True,
                "video_id": video_id,
                "transcription": transcription_result["transcription"],
                "source": "database"
            }
        else:
            # 文字起こしデータがない場合
            logger.info(f"新規文字起こし処理を開始: video_id={video_id}")
            
            # 1. 動画をダウンロードしてCloud Storageに保存
            logger.info(f"動画をCloud Storageに保存中: video_id={video_id}")
            storage_service = get_video_storage_service()
            storage_url = await storage_service.download_and_store_video(url, video_id)
            logger.info(f"動画保存完了: {storage_url}")
            
            # 2. Geminiを使用して文字起こしを生成
            logger.info(f"Geminiを使用して文字起こしを生成します: video_id={video_id}")
            transcription_service = GeminiTranscriptionService()
            transcription = await transcription_service.generate_transcription(video_id)
            
            return {
                "success": True,
                "video_id": video_id,
                "transcription": transcription,
                "source": "generated"
            }
            
    except Exception as e:
        logger.error(f"文字起こし処理エラー: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": f"文字起こし処理中にエラーが発生しました: {str(e)}"
        }
