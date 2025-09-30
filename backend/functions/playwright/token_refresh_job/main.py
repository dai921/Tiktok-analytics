import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from google.cloud import secretmanager
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

logger = logging.getLogger(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

DEFAULT_TARGET_URL = "https://www.tiktok.com/"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)


class TokenRefreshError(Exception):
    """Raised when the token refresh job fails to obtain or persist a token."""


def _load_env(name: str, *, required: bool = True, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name, default)
    if required and not value:
        raise TokenRefreshError(f"環境変数 {name} が設定されていません")
    return value


def fetch_ms_token(target_url: str, user_agent: str) -> str:
    """Launch Playwright, visit TikTok, and extract the msToken cookie."""
    logger.info("Playwrightを起動してトークンを取得します: url=%s", target_url)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=user_agent)
            page = context.new_page()
            page.goto(target_url, wait_until="networkidle", timeout=30_000)
            cookies = context.cookies()
            browser.close()
    except PlaywrightTimeoutError as exc:
        raise TokenRefreshError("TikTokページの読み込みにタイムアウトしました") from exc
    except Exception as exc:  # noqa: BLE001
        raise TokenRefreshError("Playwright実行中にエラーが発生しました") from exc

    for cookie in cookies:
        if cookie.get("name") == "msToken":
            logger.info("msTokenの取得に成功しました")
            return cookie["value"]

    raise TokenRefreshError("取得したCookieにmsTokenが含まれていません")


def store_token(secret_client: secretmanager.SecretManagerServiceClient, secret_path: str, token: str) -> None:
    payload = {
        "msToken": token,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info("Secret Managerに新しいバージョンを保存します: %s", secret_path)
    secret_client.add_secret_version(
        request={
            "parent": secret_path,
            "payload": {"data": json.dumps(payload).encode("utf-8")},
        }
    )


def main() -> None:
    project_id = _load_env("PROJECT_ID")
    secret_id = _load_env("MS_TOKEN_SECRET_ID")
    target_url = _load_env("TARGET_URL", required=False, default=DEFAULT_TARGET_URL)
    user_agent = _load_env("USER_AGENT", required=False, default=DEFAULT_USER_AGENT)

    secret_client = secretmanager.SecretManagerServiceClient()
    secret_path = secret_client.secret_path(project_id, secret_id)

    token = fetch_ms_token(target_url, user_agent)
    store_token(secret_client, secret_path, token)
    logger.info("トークン更新ジョブが正常に完了しました")


if __name__ == "__main__":
    try:
        main()
    except TokenRefreshError as exc:
        logger.error("トークン更新に失敗しました: %s", exc)
        raise
