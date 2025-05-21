from src.db.database import get_db_connection
from typing import Optional
import logging
from sqlalchemy.sql import text

logger = logging.getLogger(__name__)

# TikTokUserConnectionモデルを同じファイルで定義
class TikTokUserConnection:
    def __init__(self, id=None, user_id=None, tiktok_open_id=None, 
                 tiktok_access_token=None, tiktok_refresh_token=None, 
                 expires_at=None, created_at=None, updated_at=None, display_name=None, linked_at=None, account_type=None, mainly_video_type=None):
        self.id = id
        self.user_id = user_id
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
            query = text("""
                SELECT user_number 
                FROM users 
                WHERE id = :user_id
                LIMIT 1
            """)
            print(f"[DEBUG] SQLクエリ実行: {query.text.strip()} [params: {user_id}]")
            result = conn.execute(query, {"user_id": user_id})
            row = result.first()
            print(f"[DEBUG] ユーザーマッピング取得結果: {row}")
            
            if not row:
                print(f"[ERROR] ユーザーID {user_id} のマッピングが見つかりません")
                return None
                
            return row[0]  # user_number
        except Exception as e:
            print(f"[ERROR] get_user_id_mapping エラー: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()

    async def get_user_connection(self, user_id: int) -> Optional[TikTokUserConnection]:
        """ユーザーのTikTok連携情報を取得する"""
        print(f"[DEBUG] get_user_connection 呼び出し: user_id={user_id}")
        conn = None
        try:
            # まずuser_idからuser_numberを取得
            user_number = await self.get_user_id_mapping(user_id)
            if not user_number:
                return None
                
            print(f"[DEBUG] ユーザーマッピング: user_id={user_id} -> user_number={user_number}")
            
            conn = get_db_connection()
            
            # users_tiktok_accountsテーブルからデータを取得
            query = text("""
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
            """)
            print(f"[DEBUG] SQLクエリ実行: {query.text.strip()} [params: {user_number}]")
            result = conn.execute(query, {"user_number": user_number})
            row = result.first()
            print(f"[DEBUG] クエリ結果: {row}")
            
            if not row:
                print(f"[WARNING] ユーザー番号 {user_number} の連携情報が見つかりません")
                return None

            return TikTokUserConnection(
                id=None,
                user_id=user_id,
                tiktok_open_id=row[1],  # open_id
                tiktok_access_token=row[2],  # access_token
                tiktok_refresh_token=row[3],  # refresh_token
                expires_at=row[4],  # expires_at
                display_name=row[5],  # display_name
                created_at=row[6],  # linked_at
                updated_at=None,
                account_type=row[7],  # account_type
                mainly_video_type=row[8]  # mainly_video_type
            )
        except Exception as e:
            print(f"[ERROR] get_user_connection エラー: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()
    
    async def disconnect_user_account(self, user_id: str, open_id: str) -> bool:
        """ユーザーのTikTokアカウント連携を解除する"""
        print(f"[DEBUG] disconnect_user_account 開始: user_id={user_id}, open_id={open_id}")
        conn = None
        try:
            # まずuser_idからuser_numberを取得
            user_number = await self.get_user_id_mapping(user_id)
            if not user_number:
                print(f"[ERROR] ユーザーID {user_id} のマッピングが見つかりません")
                return False
                
            print(f"[DEBUG] ユーザーマッピング: user_id={user_id} -> user_number={user_number}")
            
            conn = get_db_connection()
            
            # users_tiktok_accountsテーブルから削除
            query = text("""
                DELETE FROM users_tiktok_accounts
                WHERE user_number = :user_number AND open_id = :open_id
            """)
            
            print(f"[DEBUG] SQLクエリ実行: {query.text.strip()} [params: user_number={user_number}, open_id={open_id}]")
            result = conn.execute(query, {
                "user_number": user_number,
                "open_id": open_id
            })
            
            conn.commit()
            
            # 削除された行数を確認
            if result.rowcount > 0:
                print(f"[DEBUG] 連携解除成功: user_number={user_number}, open_id={open_id}, 削除された行数: {result.rowcount}")
                return True
            else:
                print(f"[WARNING] 連携解除対象が見つかりませんでした: user_number={user_number}, open_id={open_id}")
                return False
        except Exception as e:
            print(f"[ERROR] disconnect_user_account エラー: {str(e)}")
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
            # まずuser_idからuser_numberを取得
            user_number = await self.get_user_id_mapping(connection.user_id)
            if not user_number:
                print(f"[ERROR] ユーザーID {connection.user_id} のマッピングが見つかりません")
                return False
                
            print(f"[DEBUG] ユーザーマッピング: user_id={connection.user_id} -> user_number={user_number}")
            
            conn = get_db_connection()
            
            # users_tiktok_accountsテーブルに保存
            query = text("""
                INSERT INTO users_tiktok_accounts (
                    user_number, open_id, access_token, 
                    refresh_token, expires_at, display_name
                ) VALUES (:user_number, :open_id, :access_token, :refresh_token, :expires_at, :display_name)
                ON DUPLICATE KEY UPDATE
                    access_token = VALUES(access_token),
                    refresh_token = VALUES(refresh_token),
                    expires_at = VALUES(expires_at),
                    display_name = VALUES(display_name),
                    linked_at = NOW()
            """)
            
            print(f"[DEBUG] SQLクエリ実行: {query.text.strip()}")
            conn.execute(query, {
                "user_number": user_number,
                "open_id": connection.tiktok_open_id,
                "access_token": connection.tiktok_access_token,
                "refresh_token": connection.tiktok_refresh_token,
                "expires_at": connection.expires_at,
                "display_name": "TikTok User"  # デフォルトの表示名（後で更新可能）
            })
            
            conn.commit()
            print(f"[DEBUG] 連携情報保存成功: user_number={user_number}, open_id={connection.tiktok_open_id}")
            return True
        except Exception as e:
            print(f"[ERROR] save_user_connection エラー: {str(e)}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()
