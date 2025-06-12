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
import requests

logger = setup_logger()


class VideoTranscriptionRepository:
    """動画文字起こし関連のデータベース操作（コンパクトAPI用）"""
    
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
    def save_transcription(video_id: str, transcription: str):
        """文字起こし結果を保存（UPSERT処理）"""
        # 既存データがあるかチェック
        existing = VideoTranscriptionRepository.find_transcription_by_video_id(video_id)
        
        if existing:
            # 更新
            execute_update(
                "UPDATE video_transcription SET transcription = :transcription WHERE video_id = :video_id",
                {"video_id": video_id, "transcription": transcription}
            )
            logger.info(f"文字起こしデータ更新: video_id={video_id}")
        else:
            # 挿入
            execute_update(
                "INSERT INTO video_transcription (video_id, transcription, file_path) VALUES (:video_id, :transcription, '')",
                {"video_id": video_id, "transcription": transcription}
            )
            logger.info(f"文字起こしデータ挿入: video_id={video_id}")
    
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
    """TikTok URL解析クラス（コンパクトAPI用）"""
    
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
    
    @staticmethod
    def expand_short_url(url: str, timeout: int = 10) -> Optional[str]:
        """短縮URLを実際のURLに展開する"""
        try:
            # 短縮URLかどうかをチェック
            if not any(domain in url for domain in ['vm.tiktok.com', 'vt.tiktok.com']):
                # 短縮URLでない場合はそのまま返す
                return url
            
            logger.info(f"短縮URL展開開始: {url}")
            
            # リダイレクトを追跡してHEADリクエストで最終URLを取得
            response = requests.head(
                url, 
                timeout=timeout,
                allow_redirects=True,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.69 Safari/537.36'
                }
            )
            
            expanded_url = response.url
            logger.info(f"短縮URL展開結果: {url} -> {expanded_url}")
            return expanded_url
            
        except requests.RequestException as e:
            logger.error(f"短縮URL展開エラー: {url} - {str(e)}")
            return None
        except Exception as e:
            logger.error(f"短縮URL展開中の予期しないエラー: {url} - {str(e)}")
            return None
    
    @staticmethod
    def is_carousel_or_photo_url(url: str) -> bool:
        """URLがカルーセル（画像スライドショー）やフォト形式かを判定する
        
        Args:
            url: チェックするURL（短縮URLの場合は自動的に展開される）
            
        Returns:
            True: カルーセル/フォト形式, False: 動画形式またはエラー
        """
        try:
            # 短縮URLの場合は展開
            expanded_url = TikTokUrlExtractor.expand_short_url(url)
            if not expanded_url:
                logger.warning(f"URL展開に失敗: {url}")
                return False
            
            # 展開後のURLでカルーセル/フォトチェック
            is_photo = "photo" in expanded_url.lower()
            if is_photo:
                logger.info(f"カルーセル/フォト形式を検出: {expanded_url}")
            
            return is_photo
            
        except Exception as e:
            logger.error(f"カルーセル判定エラー: {url} - {str(e)}")
            return False