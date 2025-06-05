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

# TikTok URLからvideo_idを抽出する関数
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

# Geminiを使用して文字起こしを生成する関数
async def generate_transcription_with_gemini(video_id: str, url: str) -> str:
    """GeminiモデルでTikTok動画の文字起こしを生成する"""
    try:
        if not GEMINI_API_KEY:
            raise Exception("Gemini APIキーが設定されていません")
        
        # Gemini-Proモデルを設定
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # プロンプト作成
        prompt = f"""
        以下のコンテンツの文字起こしを行ってください：

        メインは映像に表示されているテロップのテキストを抽出してください
        もしテロップがなければ音声を抽出してください
        結果は文字起こしのみを出力してください

        注意点：
        - 日本語で出力してください
        - テキストが見つからない場合は「テキストなし」と記載
        - テロップが切り替わるごとに改行してください
        """
        
        # 安全性設定
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }
        
        # 文字起こし生成
        response = model.generate_content(
            prompt,
            safety_settings=safety_settings
        )
        
        transcription = response.text.strip()
        
        # 生成された文字起こしをデータベースに保存
        execute_update(
            "INSERT INTO video_transcription (video_id, transcription) VALUES (:video_id, :transcription)",
            {"video_id": video_id, "transcription": transcription}
        )
        
        return transcription
        
    except Exception as e:
        logger.error(f"Geminiによる文字起こし生成エラー: {str(e)}")
        logger.error(traceback.format_exc())
        raise Exception(f"文字起こし生成中にエラーが発生しました: {str(e)}")

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
        
        # URLからvideo_idを抽出
        video_id = extract_video_id_from_url(url)
        if not video_id:
            logger.warning(f"無効なURL形式: {url}")
            return {
                "success": False,
                "error": "無効なURL形式です。TikTok動画のURLを入力してください。"
            }
        
        logger.info(f"抽出されたvideo_id: {video_id}")
        
        # ①frontend_dataテーブルを検索し、video_idが存在するか確認
        video_query = "SELECT url FROM frontend_data WHERE url LIKE :video_id_pattern LIMIT 1"
        video_result = fetch_one(video_query, {"video_id_pattern": f"%{video_id}%"})
        
        if not video_result:
            logger.warning(f"指定されたvideo_id {video_id} が見つかりません")
            return {
                "success": False,
                "error": "指定された動画が見つかりません。有効なTikTok動画URLを入力してください。"
            }
        
        # ②video_transcriptionテーブルを検索
        transcription_query = "SELECT transcription FROM video_transcription WHERE video_id = :video_id"
        transcription_result = fetch_one(transcription_query, {"video_id": video_id})
        
        if transcription_result:
            # 既存の文字起こしデータがある場合はそれを返す
            logger.info(f"既存の文字起こしデータを返します: video_id={video_id}")
            return {
                "success": True,
                "video_id": video_id,
                "transcription": transcription_result["transcription"],
                "source": "database"
            }
        else:
            # 文字起こしデータがない場合はGeminiを呼び出す
            logger.info(f"Geminiを使用して文字起こしを生成します: video_id={video_id}")
            transcription = await generate_transcription_with_gemini(video_id, url)
            
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
