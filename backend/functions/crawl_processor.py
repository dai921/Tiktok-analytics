import os
import json
import logging
import pymysql
from datetime import datetime
import time
import sys

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ホットリロード防止のための設定（追加）

def get_db_connection():
    """データベース接続を取得する"""
    host = "127.0.0.1"  # 明示的IPアドレスを使用
    port = int(os.environ.get("MYSQL_PORT", 3306))
    user = os.environ.get("MYSQL_USER", "tiktok_user")
    password = os.environ.get("MYSQL_PASSWORD", "tiktok_pass")
    database = os.environ.get("MYSQL_DATABASE", "tiktok_data")
    
    try:
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        logger.info(f"データベース接続成功: {host}:{port}/{database}")
        return connection
    except Exception as e:
        logger.error(f"データベース接続エラー: {e}")
        raise

def process_crawl_complete(data, context=None):
    """Pub/Subトピックからクロール完了メッセージを処理する"""
    start_time = time.time()
    logger.info(f"====== process_crawl_complete 開始：{datetime.now().isoformat()} ======")
    
    try:
        # Pub/Subメッセージからデータを取得
        if isinstance(data, dict) and 'data' in data:
            # Base64デコードが必要な場合
            import base64
            pubsub_message = base64.b64decode(data['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
        else:
            # テスト用：データが直接含まれている場合
            message_data = data
        
        logger.info(f"受信したメッセージ: {message_data}")
        
        # メッセージデータをパース
        account_url = message_data.get('account_url')
        status = message_data.get('status')
        is_new_account = message_data.get('is_new_account', False)
        video_count = message_data.get('video_count', 0)
        timestamp = message_data.get('timestamp', datetime.now().timestamp())
        
        if not account_url or not status:
            logger.error("必須フィールドがありません: account_url または status")
            return
        
        # データベースに結果を保存
        connection = get_db_connection()
        try:
            with connection:
                with connection.cursor() as cursor:
                    # クロール結果をcrawl_resultsテーブルに保存
                    database_name = os.environ.get("MYSQL_DATABASE", "tiktok_data")
                    sql = f"""
                    CREATE TABLE IF NOT EXISTS {database_name}.crawl_results (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        account_url VARCHAR(255) NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        video_count INT DEFAULT 0,
                        timestamp DOUBLE NOT NULL,
                        UNIQUE KEY (account_url)
                    )
                    """
                    cursor.execute(sql)
                    
                    # クロール結果を保存
                    sql = f"""
                    INSERT INTO {database_name}.crawl_results 
                    (account_url, status, video_count, timestamp) 
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE 
                    status = %s, video_count = %s, timestamp = %s
                    """
                    
                    cursor.execute(
                        sql, 
                        (account_url, status, video_count, timestamp,
                         status, video_count, timestamp)
                    )
                    
                    # 新アカウントフラグの更新
                    if status == "completed" and is_new_account:
                        # is_new_accountフラグをfalseに更新
                        update_sql = f"""
                        UPDATE {database_name}.account_list 
                        SET is_new_account = FALSE, 
                            needs_update = FALSE,
                            latest_video_date = %s 
                        WHERE account_url = %s
                        """
                        
                        cursor.execute(update_sql, (
                            datetime.now().strftime('%Y-%m-%d'),
                            account_url
                        ))
                        
                        affected_rows = cursor.rowcount
                        logger.info(f"アカウント {account_url} のis_new_accountをFalseに更新しました（影響行数: {affected_rows}）")
                    elif status == "completed":
                        # 既存アカウントの場合はneeds_updateのみ更新
                        update_sql = f"""
                        UPDATE {database_name}.account_list 
                        SET needs_update = FALSE,
                            latest_video_date = %s 
                        WHERE account_url = %s
                        """
                        
                        cursor.execute(update_sql, (
                            datetime.now().strftime('%Y-%m-%d'),
                            account_url
                        ))
                        
                        affected_rows = cursor.rowcount
                        logger.info(f"アカウント {account_url} のneeds_updateをFalseに更新しました（影響行数: {affected_rows}）")
                    
                    connection.commit()
                    logger.info(f"データベースに保存・更新しました: account_url={account_url}, status={status}")
        finally:
            connection.close()
        
        # 処理完了
        total_time = time.time() - start_time
        logger.info(f"処理が完了しました （合計時間: {total_time:.2f}秒）")
        return {"success": True, "execution_time": total_time}
        
    except Exception as e:
        logger.error(f"処理中にエラーが発生しました: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
    finally:
        total_time = time.time() - start_time
        logger.info(f"====== process_crawl_complete 終了: {total_time:.2f}秒 ======")

# スタンドアロン実行用
def setup_subscription():
    """Pub/Subサブスクリプションを設定する"""
    try:
        # Pub/Subクライアント
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        project_id = os.environ.get("PROJECT_ID", "local-project")
        subscription_name = "process-crawl-complete-sub"
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        logger.info(f"Pub/Subサブスクリプション: {subscription_path}")
        
        # コールバック関数
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                # メッセージデータを取得
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                # process_crawl_complete関数を呼び出し
                process_crawl_complete(data)
                logger.info("メッセージ処理完了")
            except Exception as e:
                logger.error(f"メッセージ処理エラー: {e}")
                import traceback
                logger.error(traceback.format_exc())
            finally:
                # メッセージを確認応答
                message.ack()
        
        # メッセージハンドラ設定
        streaming_pull_future = subscriber.subscribe(subscription_path, callback)
        logger.info(f"サブスクリプションを開始しました: {subscription_path}")
        
        # バックグラウンドで実行
        return streaming_pull_future
        
    except Exception as e:
        logger.error(f"サブスクリプション設定エラー: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

# メイン実行部分
if __name__ == "__main__":
    # スタンドアロンモードとして起動
    logger.info("スタンドアロンモードでクロール完了プロセッサーを起動しています...")
    
    try:
        # データベース接続テスト
        connection = get_db_connection()
        logger.info("データベース接続テスト成功")
        
        # サブスクリプション設定
        future = setup_subscription()
        
        if future:
            try:
                # 処理が継続するよう結果を待機
                logger.info("メッセージを待機中...")
                future.result()  # このコールはブロッキング
            except KeyboardInterrupt:
                future.cancel()
                logger.info("キーボード割り込みにより停止しました")
            except Exception as e:
                future.cancel()
                logger.error(f"エラーが発生しました: {e}")
        else:
            logger.error("サブスクリプションの設定に失敗しました")
            
    except Exception as e:
        logger.error(f"初期化中にエラーが発生: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
else:
    # Cloud Functions Frameworkによって呼び出される場合の準備
    logger.info("Functions Frameworkモードで準備完了") 