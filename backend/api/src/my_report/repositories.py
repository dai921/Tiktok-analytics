from src.db.database import get_db_connection
from typing import Optional
import logging
from sqlalchemy.sql import text
from src.utils.encryption import encrypt_data, decrypt_data

logger = logging.getLogger(__name__)

# TikTokUserConnectionデータを保持するクラス
class TikTokUserConnection:
    def __init__(
        self,
        id=None,
        user_id=None,
        user_number=None,
        tiktok_open_id=None,
        tiktok_access_token=None,
        tiktok_refresh_token=None,
        expires_at=None,
        created_at=None,
        updated_at=None,
        display_name=None,
        linked_at=None,
        account_type=None,
        mainly_video_type=None,
    ):
        self.id = id
        self.user_id = user_id
        self.user_number = user_number
        self.tiktok_open_id = tiktok_open_id
        self.tiktok_access_token = tiktok_access_token
        self.tiktok_refresh_token = tiktok_refresh_token
        self.expires_at = expires_at
        self.created_at = created_at
        self.updated_at = updated_at
        self.display_name = display_name
        self.linked_at = linked_at
        self.account_type = account_type
        self.mainly_video_type = mainly_video_type

class TikTokRepository:
    def __init__(self):
        print("[DEBUG] TikTokRepository initialized")

    async def get_user_id_mapping(self, user_id):
        """usersテーブルからuser_numberを取得する"""
        print(f"[DEBUG] get_user_id_mapping: user_id={user_id}")
        conn = None
        try:
            conn = get_db_connection()
            query = text(
                """
                SELECT user_number
                FROM users
                WHERE id = :user_id
                LIMIT 1
                """
            )
            print(f"[DEBUG] SQL実行: {query.text.strip()} [params: {user_id}]")
            result = conn.execute(query, {"user_id": user_id}).first()
            print(f"[DEBUG] ユーザーマッピング取得結果: {result}")

            if not result:
                print(f"[ERROR] ユーザーID {user_id} のマッピングが見つかりません")
                return None

            return result[0]
        except Exception as e:
            print(f"[ERROR] get_user_id_mapping 例外: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()

    async def get_user_connection(self, user_id: int) -> Optional[TikTokUserConnection]:
        """ユーザーのTikTok連携情報を取得する"""
        print(f"[DEBUG] get_user_connection 呼び出し: user_id={user_id}")
        conn = None
        try:
            user_number = await self.get_user_id_mapping(user_id)
            if not user_number:
                return None

            print(f"[DEBUG] ユーザーマッピング: user_id={user_id} -> user_number={user_number}")

            conn = get_db_connection()
            query = text(
                """
                SELECT
                    user_number,
                    open_id,
                    access_token,
                    refresh_token,
                    expires_at,
                    display_name,
                    linked_at,
                    account_type,
                    mainly_video_type
                FROM users_tiktok_accounts
                WHERE user_number = :user_number
                ORDER BY linked_at DESC
                LIMIT 1
                """
            )
            print(f"[DEBUG] SQL実行: {query.text.strip()} [params: {user_number}]")
            result = conn.execute(query, {"user_number": user_number}).mappings().first()
            print(f"[DEBUG] 取得結果: {result}")

            if not result:
                print(f"[WARNING] ユーザー番号 {user_number} の連携情報が見つかりません")
                return None

            decrypted_access = (
                decrypt_data(result.get("access_token")) if result.get("access_token") else None
            )
            decrypted_refresh = (
                decrypt_data(result.get("refresh_token")) if result.get("refresh_token") else None
            )

            return TikTokUserConnection(
                id=None,
                user_id=user_id,
                user_number=user_number,
                tiktok_open_id=result.get("open_id"),
                tiktok_access_token=decrypted_access,
                tiktok_refresh_token=decrypted_refresh,
                expires_at=result.get("expires_at"),
                display_name=result.get("display_name"),
                linked_at=result.get("linked_at"),
                updated_at=None,
                account_type=result.get("account_type"),
                mainly_video_type=result.get("mainly_video_type"),
            )
        except Exception as e:
            print(f"[ERROR] get_user_connection 例外: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()

    async def upsert_account_daily_metrics(
        self,
        user_number: int,
        open_id: str,
        collection_date: str,
        followers: int,
        likes: int,
        videos_count: int,
        total_play_count: int,
    ) -> None:
        """users_account_daily_metricsへ日次指標を保存/更新する"""
        print("[DEBUG] upsert_account_daily_metrics 開始: user_number=%s, open_id=%s, date=%s" % (user_number, open_id, collection_date))
        conn = None
        try:
            conn = get_db_connection()
            query = text("""
                INSERT INTO users_account_daily_metrics (
                    user_number,
                    open_id,
                    collection_date,
                    followers,
                    likes,
                    videos_count,
                    total_play_count
                ) VALUES (
                    :user_number,
                    :open_id,
                    :collection_date,
                    :followers,
                    :likes,
                    :videos_count,
                    :total_play_count
                )
                ON DUPLICATE KEY UPDATE
                    followers = VALUES(followers),
                    likes = VALUES(likes),
                    videos_count = VALUES(videos_count),
                    total_play_count = VALUES(total_play_count)
            """)
            params = {
                "user_number": user_number,
                "open_id": open_id,
                "collection_date": collection_date,
                "followers": followers,
                "likes": likes,
                "videos_count": videos_count,
                "total_play_count": total_play_count,
            }
            print("[DEBUG] users_account_daily_metrics upsert SQL: %s" % query.text.strip())
            conn.execute(query, params)
            conn.commit()
            print("[DEBUG] users_account_daily_metrics upsert 完了: user_number=%s, open_id=%s, date=%s" % (user_number, open_id, collection_date))
        except Exception as e:
            print("[ERROR] upsert_account_daily_metrics 例外: %s" % str(e))
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    async def disconnect_user_account(self, user_id: str, open_id: str) -> bool:
        """ユーザーのTikTokアカウント連携を解除する"""
        print(f"[DEBUG] disconnect_user_account 開始: user_id={user_id}, open_id={open_id}")
        conn = None
        try:
            user_number = await self.get_user_id_mapping(user_id)
            if not user_number:
                print(f"[ERROR] ユーザーID {user_id} のマッピングが見つかりません")
                return False

            print(f"[DEBUG] ユーザーマッピング: user_id={user_id} -> user_number={user_number}")

            conn = get_db_connection()
            query = text(
                """
                DELETE FROM users_tiktok_accounts
                WHERE user_number = :user_number AND open_id = :open_id
                """
            )

            print(
                f"[DEBUG] users_tiktok_accounts delete SQL: {query.text.strip()} [params: user_number={user_number}, open_id={open_id}]"
            )
            result = conn.execute(query, {"user_number": user_number, "open_id": open_id})

            conn.commit()

            if result.rowcount > 0:
                print(
                    f"[DEBUG] users_tiktok_accounts disconnect success: user_number={user_number}, open_id={open_id}, removed_rows={result.rowcount}"
                )
                return True

            print(
                f"[WARNING] users_tiktok_accounts disconnect target missing: user_number={user_number}, open_id={open_id}"
            )
            return False
        except Exception as e:
            print(f"[ERROR] disconnect_user_account 例外: {str(e)}")
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                conn.close()

    async def save_user_connection(self, connection: TikTokUserConnection) -> bool:
        """ユーザーのTikTok連携情報をusers_tiktok_accountsテーブルに保存する"""
        print(f"[DEBUG] save_user_connection 開始: user_id={connection.user_id}")
        conn = None
        try:
            user_number = await self.get_user_id_mapping(connection.user_id)
            if not user_number:
                print(f"[ERROR] ユーザーID {connection.user_id} のマッピングが見つかりません")
                return False

            print(f"[DEBUG] ユーザーマッピング: user_id={connection.user_id} -> user_number={user_number}")

            conn = get_db_connection()
            encrypted_access = (
                encrypt_data(connection.tiktok_access_token)
                if connection.tiktok_access_token
                else None
            )
            encrypted_refresh = (
                encrypt_data(connection.tiktok_refresh_token)
                if connection.tiktok_refresh_token
                else None
            )
            display_name = connection.display_name or "TikTok User"

            query = text(
                """
                INSERT INTO users_tiktok_accounts (
                    user_number, open_id, access_token,
                    refresh_token, expires_at, display_name,
                    account_type, mainly_video_type
                ) VALUES (:user_number, :open_id, :access_token, :refresh_token, :expires_at, :display_name, :account_type, :mainly_video_type)
                ON DUPLICATE KEY UPDATE
                    access_token = VALUES(access_token),
                    refresh_token = VALUES(refresh_token),
                    expires_at = VALUES(expires_at),
                    display_name = VALUES(display_name),
                    account_type = VALUES(account_type),
                    mainly_video_type = VALUES(mainly_video_type),
                    linked_at = NOW()
                """
            )

            params = {
                "user_number": user_number,
                "open_id": connection.tiktok_open_id,
                "access_token": encrypted_access,
                "refresh_token": encrypted_refresh,
                "expires_at": connection.expires_at,
                "display_name": display_name,
                "account_type": connection.account_type,
                "mainly_video_type": connection.mainly_video_type,
            }

            print(f"[DEBUG] users_tiktok_accounts upsert SQL: {query.text.strip()}")
            conn.execute(query, params)

            conn.commit()
            print(
                f"[DEBUG] users_tiktok_accounts saved: user_number={user_number}, open_id={connection.tiktok_open_id}"
            )
            return True
        except Exception as e:
            print(f"[ERROR] save_user_connection 例外: {str(e)}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()
