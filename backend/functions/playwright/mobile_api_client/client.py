import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from google.cloud import secretmanager

from .exceptions import TikTokAPIError, TokenExpiredError
from .signature import generate_x_bogus

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)

API_ENDPOINT = "https://m.tiktok.com/api/item/detail/"


@dataclass
class TokenPayload:
    value: str
    updated_at: Optional[str] = None


class TikTokMobileClient:
    """TikTok モバイルAPIから動画情報を取得するクライアント（雛形）。"""

    def __init__(
        self,
        *,
        project_id: Optional[str] = None,
        secret_id: Optional[str] = None,
        user_agent: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self._project_id = project_id or os.getenv("PROJECT_ID")
        self._secret_id = secret_id or os.getenv("MS_TOKEN_SECRET_ID")
        if not self._project_id or not self._secret_id:
            raise ValueError("PROJECT_ID と MS_TOKEN_SECRET_ID を指定してください")

        self._user_agent = user_agent or os.getenv("TIKTOK_MOBILE_USER_AGENT", DEFAULT_USER_AGENT)
        self._secret_client = secretmanager.SecretManagerServiceClient()
        self._http_client = http_client or httpx.Client(timeout=httpx.Timeout(10.0))
        self._cached_token: Optional[TokenPayload] = None

    def fetch_video_sources(self, video_id: str, *, retry_on_expired: bool = True) -> Dict[str, Any]:
        """動画IDから play/download URL を取得する。"""
        logger.info("TikTokモバイルAPIを呼び出します: video_id=%s", video_id)
        token = self._get_ms_token()
        try:
            response_json = self._call_api(video_id, token)
        except TokenExpiredError:
            if not retry_on_expired:
                raise
            logger.warning("トークンが失効した可能性があります。再取得を試みます。")
            self._trigger_token_refresh()
            token = self._get_ms_token(force_refresh=True)
            response_json = self._call_api(video_id, token)

        item_info = (
            response_json
            .get("itemInfo", {})
            .get("itemStruct")
        )
        if not item_info:
            raise TikTokAPIError("レスポンスに itemStruct が含まれていません")

        video = item_info.get("video", {})
        result = {
            "play_addr": video.get("playAddr"),
            "download_addr": video.get("downloadAddr"),
            "duration": video.get("duration"),
            "ratio": video.get("ratio"),
            "raw": item_info,
        }
        logger.info("動画情報の取得に成功しました: video_id=%s", video_id)
        return result

    def _call_api(self, video_id: str, token: TokenPayload) -> Dict[str, Any]:
        params = {
            "itemId": video_id,
            "aid": "1988",
            "app_name": "tiktok_web",
            "device_platform": "webapp",
            "region": os.getenv("TIKTOK_REGION", "JP"),
            "priority_region": os.getenv("TIKTOK_PRIORITY_REGION", ""),
        }

        base_request = httpx.URL(API_ENDPOINT).copy_add_params(params)
        signature = generate_x_bogus(str(base_request), self._user_agent)
        url = base_request.copy_add_param("X-Bogus", signature)

        headers = {
            "User-Agent": self._user_agent,
            "Referer": f"https://www.tiktok.com/@/video/{video_id}",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        }
        cookies = {"msToken": token.value}

        response = self._http_client.get(url, headers=headers, cookies=cookies)
        if response.status_code == 403:
            raise TokenExpiredError("403 Forbidden が返されました")
        if response.status_code != 200:
            raise TikTokAPIError(f"APIがエラーを返しました: {response.status_code}")

        data = response.json()
        status_code = data.get("statusCode")
        if status_code not in (0, None):
            # TikTokはトークン不正時に statusCode 10000 等を返す
            raise TokenExpiredError(f"TikTokレスポンスがエラーを示しました: {status_code}")

        return data

    def _get_ms_token(self, *, force_refresh: bool = False) -> TokenPayload:
        if self._cached_token and not force_refresh:
            return self._cached_token

        name = self._secret_client.secret_version_path(
            self._project_id, self._secret_id, "latest"
        )
        logger.info("Secret Managerからトークンを取得します: %s", name)
        response = self._secret_client.access_secret_version(name=name)
        payload = json.loads(response.payload.data.decode("utf-8"))
        token = TokenPayload(value=payload["msToken"], updated_at=payload.get("updated_at"))
        self._cached_token = token
        return token

    def _trigger_token_refresh(self) -> None:
        """Invoke the Cloud Run Job to refresh the msToken.

        実際のトリガー方法はインフラ構成によって異なるため、ここでは
        プレースホルダ実装としてログを出力するのみ。
        """
        endpoint = os.getenv("TOKEN_REFRESH_TRIGGER_URL")
        if not endpoint:
            logger.warning("トークン更新ジョブのトリガーURLが設定されていません")
            return

        logger.info("トークン更新ジョブをトリガーします: %s", endpoint)
        try:
            response = self._http_client.post(endpoint, timeout=httpx.Timeout(5.0))
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.exception("トークン更新ジョブのトリガーに失敗しました: %s", exc)
