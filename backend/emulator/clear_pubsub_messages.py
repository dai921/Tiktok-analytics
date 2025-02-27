from google.cloud import pubsub_v1
import os
import json
from datetime import datetime
import signal
import sys
import threading

def clear_pubsub_messages():
    """Pub/Subのテストメッセージをクリーンアップする"""
    print("=== Pub/Subメッセージのクリーンアップ開始 ===")
    
    # 環境変数の設定
    os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
    project_id = 'local-project'
    topic_name = 'process-account-list'
    cleanup_subscription_name = 'temp-cleanup-subscription'  # 一時的なサブスクリプション名
    
    # 終了フラグ
    running = threading.Event()
    running.set()
    
    def signal_handler(signum, frame):
        print("\n終了シグナルを受信しました。クリーンアップを停止します...")
        running.clear()
        sys.exit(0)
    
    # シグナルハンドラーの設定
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # メッセージカウンター
    message_count = 0
    
    try:
        publisher = pubsub_v1.PublisherClient()
        subscriber = pubsub_v1.SubscriberClient()
        
        topic_path = publisher.topic_path(project_id, topic_name)
        subscription_path = subscriber.subscription_path(project_id, cleanup_subscription_name)
        
        print(f"トピック: {topic_path}")
        print(f"クリーンアップ用サブスクリプション: {subscription_path}")
        
        # クリーンアップ用の一時的なサブスクリプションを作成
        try:
            subscriber.create_subscription(
                request={
                    "name": subscription_path,
                    "topic": topic_path,
                    "ack_deadline_seconds": 60
                }
            )
            print("クリーンアップ用サブスクリプションを作成しました")
        except Exception as e:
            if 'AlreadyExists' in str(e):
                print("クリーンアップ用サブスクリプションは既に存在します")
            else:
                raise e
        
        # テストメッセージを再送信
        test_data = {"test": "cleanup_check"}
        future = publisher.publish(
            topic_path, 
            json.dumps(test_data).encode('utf-8')
        )
        message_id = future.result(timeout=30)
        print(f"テストメッセージを送信しました（ID: {message_id}）")
        
        def callback(message):
            if not running.is_set():
                return
                
            nonlocal message_count
            message_count += 1
            
            try:
                data = json.loads(message.data.decode('utf-8'))
                print(f"\n=== メッセージ {message_count} ===")
                print(f"メッセージID: {message.message_id}")
                print(f"公開時刻: {message.publish_time}")
                print(f"データ概要: {len(data.get('accounts', []))}件のアカウント情報")
                
            except json.JSONDecodeError:
                print(f"\n=== メッセージ {message_count} ===")
                print(f"メッセージID: {message.message_id}")
                print(f"データ: {message.data.decode('utf-8')}")
            
            message.ack()
            print(f"メッセージを削除しました（合計: {message_count}件）")
        
        print("\nメッセージのクリーンアップを開始します...")
        print("各メッセージの詳細を表示します")
        print("Ctrl+C で停止してください\n")
        
        # フロー制御の設定
        flow_control = pubsub_v1.types.FlowControl(
            max_messages=1,
            max_bytes=10485760,
            max_lease_duration=60
        )
        
        # サブスクリプションの開始
        streaming_pull_future = subscriber.subscribe(
            subscription_path,
            callback=callback,
            flow_control=flow_control
        )
        
        # メッセージを待機（タイムアウト付き）
        while running.is_set():
            try:
                streaming_pull_future.result(timeout=1.0)
            except Exception as e:
                if running.is_set():
                    if "DeadlineExceeded" in str(e) or isinstance(e, TimeoutError):
                        print("待機中...新しいメッセージがあれば処理します", end='\r')
                    else:
                        print(f"\nエラーの詳細:")
                        print(f"- タイプ: {type(e).__name__}")
                        print(f"- メッセージ: {str(e)}")
                
    except Exception as e:
        print(f"\nエラー発生: {type(e).__name__}")
        print(f"エラー内容: {str(e)}")
        import traceback
        print("スタックトレース:")
        print(traceback.format_exc())
    finally:
        running.clear()
        if 'streaming_pull_future' in locals():
            try:
                streaming_pull_future.cancel()
                print("ストリーミングをキャンセルしました")
            except Exception as e:
                print(f"ストリーミングのキャンセルに失敗: {str(e)}")
        
        # クリーンアップ用サブスクリプションの削除
        try:
            subscriber.delete_subscription(request={"subscription": subscription_path})
            print("クリーンアップ用サブスクリプションを削除しました")
        except Exception as e:
            print(f"サブスクリプション削除エラー: {str(e)}")
        
        print(f"\nクリーンアップを終了します（処理済み: {message_count}件）")
        try:
            subscriber.close()
            print("サブスクライバーを正常にクローズしました")
        except Exception as e:
            print(f"サブスクライバーのクローズに失敗: {str(e)}")

if __name__ == "__main__":
    clear_pubsub_messages() 