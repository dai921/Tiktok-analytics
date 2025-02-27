from google.cloud import pubsub_v1
import os
import json

def send_test_message():
    print("=== テストメッセージ送信 ===")
    
    # 環境変数の設定
    os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
    project_id = 'local-project'
    topic_name = 'process-account-list'
    
    try:
        # パブリッシャーの作成
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, topic_name)
        
        # テストメッセージの作成
        test_data = {
            "accounts": [
                {"account_url": "test_url", "account_name": "test_name", "is_new_account": True}
            ]
        }
        
        # メッセージ送信
        future = publisher.publish(
            topic_path, 
            json.dumps(test_data).encode('utf-8')
        )
        message_id = future.result(timeout=30)
        
        print(f"テストメッセージを送信しました（ID: {message_id}）")
        
    except Exception as e:
        print(f"エラー発生: {type(e).__name__}")
        print(f"エラー内容: {str(e)}")
        raise e

if __name__ == "__main__":
    send_test_message() 