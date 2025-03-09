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
            
            # 問題のあるレコードを特定するためのデバッグクエリ
            debug_query = """
            SELECT 
                id, created_at
            FROM 
                video_master
            WHERE 
                created_at IS NULL
            LIMIT 5
            """
            
            try:
                self.cursor.execute(debug_query)
                empty_date_records = self.cursor.fetchall()
                logger.info(f"NULL日付を持つレコード数: {len(empty_date_records)}")
                for record in empty_date_records:
                    logger.info(f"NULL日付を持つレコード: id={record['id']}, created_at={record['created_at']}")
            except Exception as e:
                logger.error(f"デバッグクエリの実行中にエラーが発生: {str(e)}")
            
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
                COALESCE(vm.hashtags, '') as hashtags,
                vm.music_title as music_info,
                vm.description as caption,
                vm.category,
                vm.product,
                vm.content_type,
                vm.status
            FROM 
                video_master vm
            LEFT JOIN frontend_data fd ON vm.id = fd.id
            WHERE 
                vm.status != 'deleted'
                AND vm.created_at IS NOT NULL
                AND STR_TO_DATE(vm.created_at, '%Y-%m-%d') IS NOT NULL
                AND vm.created_at >= '2023-12-01'
            """
            
            logger.info(f"実行するSELECTクエリ: {select_query}")
            
            self.cursor.execute(select_query)
            rows_to_update = self.cursor.fetchall()
            
            # 取得したデータの検証
            logger.info(f"取得したレコード数: {len(rows_to_update)}")
            
            # 最初の数件のレコードをログに出力
            for i, row in enumerate(rows_to_update[:5]):
                logger.info(f"レコード{i+1}: id={row['id']}, created_at={row['created_at']}, type={type(row['created_at'])}")
            
            if not rows_to_update:
                logger.info("更新が必要なデータはありません")
                return {
                    "status": "success",
                    "updated_count": 0,
                    "execution_time": datetime.now().isoformat()
                }

            logger.info(f"更新対象のレコード数: {len(rows_to_update)}")

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
                caption,
                category
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """
            
            updated_count = 0
            for row in rows_to_update:
                try:
                    # ハッシュタグの処理
                    hashtags = row['hashtags']
                    if hashtags is None or hashtags == '' or hashtags == '[]':
                        hashtags = ''
                    else:
                        # カンマ区切りの文字列として処理
                        hashtags = ','.join([tag.strip() for tag in hashtags.split(',') if tag.strip()])
                    
                    # created_atの処理 - 確実に有効な日付形式であることを確認
                    created_at = row['created_at']
                    if created_at is None:
                        logger.warning(f"NULLの日付を検出しました (id: {row['id']})")
                        continue  # 日付がNULLのレコードはスキップ
                    
                    # created_atが文字列の場合、日付オブジェクトに変換してから適切な形式に戻す
                    try:
                        if isinstance(created_at, str):
                            # 文字列から日付オブジェクトへ変換
                            date_obj = datetime.strptime(created_at, '%Y-%m-%d')
                            # 日付オブジェクトから適切な形式の文字列へ戻す
                            created_at = date_obj.strftime('%Y-%m-%d')
                    except ValueError as e:
                        logger.warning(f"日付変換エラー (id: {row['id']}): {created_at} - {str(e)}")
                        continue  # 変換できない日付はスキップ
                    
                    params = (
                        row['id'],
                        row['url'],
                        row['thumbnail_url'],
                        created_at,
                        row['play_count'],
                        row['play_count_increase'],
                        row['account_name'],
                        row['likes_count'],
                        row['comment_count'],
                        hashtags,  # 処理済みのハッシュタグ
                        row['music_info'],
                        row['caption'],
                        row['category'],
                    )
                    
                    # パラメータのデバッグ出力
                    logger.debug(f"UPSERTパラメータ: id={row['id']}, created_at={created_at}, type={type(created_at)}")
                    
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
