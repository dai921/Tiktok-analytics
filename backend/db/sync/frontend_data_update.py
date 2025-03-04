import mysql.connector
from mysql.connector import Error
from datetime import datetime
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FrontendDataUpdater:
    def __init__(self):
        # MySQL接続設定
        self.config = {
            'host': os.environ.get('MYSQL_HOST', 'localhost'),
            'user': os.environ.get('MYSQL_USER', 'tiktok_user'),
            'password': os.environ.get('MYSQL_PASSWORD', 'tiktok_pass'),
            'database': os.environ.get('MYSQL_DATABASE', 'tiktok_data'),
            'port': int(os.environ.get('MYSQL_PORT', 3306))
        }
        self.conn = None
        self.cursor = None

    def connect(self):
        """データベース接続を確立"""
        try:
            self.conn = mysql.connector.connect(**self.config)
            self.cursor = self.conn.cursor(dictionary=True)
            logger.info("MySQLデータベースに接続しました")
        except Error as e:
            logger.error(f"MySQL接続エラー: {str(e)}")
            raise

    def close(self):
        """データベース接続を閉じる"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("MySQLデータベース接続を閉じました")

    def update_frontend_from_master(self) -> Dict[str, Any]:
        """
        video_masterからfrontend_dataを更新
        """
        try:
            self.connect()
            logger.info("video_masterからfrontend_dataの更新を開始")
            
            # 更新が必要なレコードを取得するクエリ
            select_query = """
            SELECT 
                vm.id,
                vm.url,
                vm.cover_image_url as thumbnail_url,
                vm.created_at,
                vm.play_count,
                vm.playCountIncrease as play_count_increase,
                vm.username as account_name,
                vm.likes_count,
                vm.comment_count,
                vm.hashtags,
                vm.music_title as music_info,
                vm.description as caption
            FROM 
                video_master vm
            LEFT JOIN frontend_data fd ON vm.id = fd.id
            WHERE 
                vm.currentFetchDate > COALESCE(fd.created_at, '1970-01-01')
                OR fd.id IS NULL
            """
            
            self.cursor.execute(select_query)
            rows_to_update = self.cursor.fetchall()
            
            if not rows_to_update:
                logger.info("更新が必要なデータはありません")
                return {
                    "status": "success",
                    "updated_count": 0,
                    "execution_time": datetime.now().isoformat()
                }

            # REPLACE文を使用してUPSERT操作を実行
            update_query = """
            REPLACE INTO frontend_data (
                id,
                url,
                thumbnail_url,
                created_at,
                play_count,
                play_count_increase,
                account_name,
                likes_count,
                comment_count,
                hashtags,
                music_info,
                caption
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """
            
            updated_count = 0
            for row in rows_to_update:
                try:
                    params = (
                        row['id'],
                        row['url'],
                        row['thumbnail_url'],
                        row['created_at'],
                        row['play_count'],
                        row['play_count_increase'],
                        row['account_name'],
                        row['likes_count'],
                        row['comment_count'],
                        row['hashtags'],
                        row['music_info'],
                        row['caption']
                    )
                    
                    self.cursor.execute(update_query, params)
                    updated_count += 1
                    
                except Error as e:
                    logger.error(f"レコード更新エラー (id: {row['id']}): {str(e)}")
                    continue

            self.conn.commit()
            logger.info(f"更新完了: {updated_count}件のレコードを更新")
            
            return {
                "status": "success",
                "updated_count": updated_count,
                "execution_time": datetime.now().isoformat()
            }
            
        except Exception as e:
            if self.conn:
                self.conn.rollback()
            logger.error(f"更新処理中にエラーが発生: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "execution_time": datetime.now().isoformat()
            }
            
        finally:
            self.close()

if __name__ == "__main__":
    try:
        updater = FrontendDataUpdater()
        result = updater.update_frontend_from_master()
        print("実行結果:", result)
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
