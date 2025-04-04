from google.cloud import pubsub_v1
import json
import os

def test_pubsub_connection():
    print("=== Pub/Subエミュレーター接続テスト ===")
    
    # 環境変数の設定
    os.environ['PUBSUB_EMULATOR_HOST'] = '127.0.0.1:8681'
    project_id = 'local-project'
    topic_name = 'process-account-list'  # 既存のトピック名を使用
    
    try:
        # パブリッシャークライアントの作成
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, topic_name)
        
        print(f"接続設定:")
        print(f"- エミュレーターホスト: {os.getenv('PUBSUB_EMULATOR_HOST')}")
        print(f"- トピックパス: {topic_path}")
        
        # テストメッセージの送信
        data = json.dumps({"test": "message"}).encode("utf-8")
        future = publisher.publish(topic_path, data)
        
        print("メッセージ送信中...")
        message_id = future.result(timeout=30)
        
        print(f"送信成功！ Message ID: {message_id}")
        return True
        
    except Exception as e:
        print(f"エラー発生: {type(e).__name__}")
        print(f"エラー内容: {str(e)}")
        return False

if __name__ == "__main__":
    test_pubsub_connection() 