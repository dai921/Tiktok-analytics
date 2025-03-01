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

# 環境変数を明示的に設定
os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'  # 明示的に設定
environment = os.getenv('ENVIRONMENT', 'development')
project_id = os.getenv('PROJECT_ID', 'local-project')

# 環境情報をログ出力
logger.info(f"実行環境: {environment}")
logger.info(f"Pub/Subエミュレータ: {os.environ['PUBSUB_EMULATOR_HOST']}")  # 設定した値を確認
logger.info(f"プロジェクトID: {project_id}")

def get_db_connection():
    """データベース接続を取得する"""
    host = os.getenv('MYSQL_HOST')  # 明示的IPアドレスを使用
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

def process_crawl_complete(cloud_event):
    """クロール完了通知を処理"""
    start_time = time.time()
    logger.info(f"====== process_crawl_complete 開始：{datetime.now().isoformat()} ======")
    
    connection = None
    try:
        # Pub/Subメッセージからデータを取得
        if isinstance(cloud_event, dict):
            if 'data' in cloud_event:
                # Cloud Functions形式のメッセージ
                import base64
                pubsub_message = base64.b64decode(cloud_event['data']).decode('utf-8')
                message_data = json.loads(pubsub_message)
            else:
                # 直接のJSONメッセージ
                message_data = cloud_event
        else:
            # CloudEventオブジェクト
            message_data = json.loads(cloud_event.data)
        
        logger.info(f"受信したメッセージ: {message_data}")
        
        # メッセージデータをパース
        account_url = message_data.get('account_url')
        status = message_data.get('status')
        is_new_account = message_data.get('is_new_account', False)
        video_count = message_data.get('video_count', 0)
        timestamp = message_data.get('timestamp', datetime.now().timestamp())
        processing_info = message_data.get('processing_info')  # processing_infoを取得
        
        if not account_url or not status:
            logger.error("必須フィールドがありません: account_url または status")
            return
        
        # データベースに結果を保存
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # アカウントの更新状態を更新
            if status == "deleted_account":
                # 削除済みアカウントの場合のみneeds_updateをFALSEに設定
                update_sql = """
                UPDATE account_list 
                SET is_new_account = FALSE,
                    last_crawl_date = CURRENT_TIMESTAMP,
                    last_video_count = %s,
                    status = %s,
                    needs_update = FALSE
                WHERE account_url = %s
                """
            else:
                # その他のステータスの場合は既存の更新内容のみ
                update_sql = """
                UPDATE account_list 
                SET is_new_account = FALSE,
                    last_crawl_date = CURRENT_TIMESTAMP,
                    last_video_count = %s,
                    status = %s
                WHERE account_url = %s
                """
            
            cursor.execute(update_sql, (video_count, status, account_url))
            connection.commit()
            logger.info(f"アカウント {account_url} の状態を更新しました（ステータス: {status}）")

            # 最後のアカウントの処理が完了した場合、video-url-data-updateトピックにメッセージを送信
            if processing_info and processing_info.get('is_final_batch'):
                logger.info("最後のアカウントの処理が完了しました。video-url-data-updateトリガーを送信します。")
                
                # Pub/Subクライアントを初期化
                from google.cloud import pubsub_v1
                publisher = pubsub_v1.PublisherClient()
                topic_path = publisher.topic_path(project_id, 'video-url-data-update')
                
                # 更新トリガーメッセージを作成
                trigger_message = {
                    'trigger_time': datetime.now().isoformat(),
                    'trigger_type': 'batch_completion',
                    'batch_info': {
                        'batch_number': processing_info.get('batch_number'),
                        'total_needs_update': processing_info.get('total_needs_update')
                    }
                }
                
                # メッセージを送信
                future = publisher.publish(
                    topic_path,
                    json.dumps(trigger_message).encode('utf-8')
                )
                message_id = future.result()
                logger.info(f"video-url-data-update トリガーを送信しました。Message ID: {message_id}")
        
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
        if connection and hasattr(connection, 'close'):
            try:
                connection.close()
                logger.info("データベース接続をクローズしました")
            except Exception as e:
                logger.warning(f"接続クローズ時にエラーが発生: {e}")
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
        logger.info(f"PUBSUB_EMULATOR_HOST: {os.environ.get('PUBSUB_EMULATOR_HOST')}")
        logger.info(f"PROJECT_ID: {project_id}")
        
        # コールバック関数
        def callback(message):
            try:
                logger.info(f"メッセージ受信: {message.message_id}")
                logger.info(f"メッセージデータ: {message.data}")
                pubsub_data = message.data.decode('utf-8')
                data = json.loads(pubsub_data)
                process_crawl_complete(data)  # {"data": data}ではなく、直接dataを渡す
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
    # サブスクリプション設定
    future = setup_subscription()
    if future:
        logger.info("サブスクリプションの設定が完了しました") 