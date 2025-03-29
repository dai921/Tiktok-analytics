import os
import time
import threading
from google.cloud import pubsub_v1
from kubernetes import client, config

# Kubernetes設定のロード
config.load_incluster_config()
v1 = client.CoreV1Api()
batch_v1 = client.BatchV1Api()

# Pub/Sub設定
PROJECT_ID = os.environ.get('PROJECT_ID')
VIDEO_SUBSCRIPTION = os.environ.get('VIDEO_PUBSUB_SUBSCRIPTION')
ACCOUNT_SUBSCRIPTION = os.environ.get('ACCOUNT_PUBSUB_SUBSCRIPTION')
POLLING_INTERVAL = int(os.environ.get('PUBSUB_POLLING_INTERVAL', '30'))

# Pub/Subクライアント初期化
subscriber = pubsub_v1.SubscriberClient()
video_subscription_path = subscriber.subscription_path(PROJECT_ID, VIDEO_SUBSCRIPTION)
account_subscription_path = subscriber.subscription_path(PROJECT_ID, ACCOUNT_SUBSCRIPTION)

def process_video_message(message):
    """ビデオクローラー用のメッセージ処理"""
    try:
        data = message.data.decode('utf-8')
        attributes = message.attributes
        
        # ここでビデオクローラージョブを作成
        create_video_crawler_job(data, attributes)
        
        # メッセージを確認（処理完了をPub/Subに通知）
        subscriber.acknowledge(
            request={
                "subscription": video_subscription_path,
                "ack_ids": [message.ack_id]
            }
        )
        print(f"Video message processed: {data}")
    except Exception as e:
        # エラー時にはメッセージを確認せず、再処理されるようにする
        print(f"Error processing video message: {e}")

def process_account_message(message):
    """アカウントクローラー用のメッセージ処理"""
    try:
        data = message.data.decode('utf-8')
        attributes = message.attributes
        
        # ここでアカウントクローラージョブを作成
        create_account_crawler_job(data, attributes)
        
        # メッセージを確認（process_video_messageと同じ方法で実装）
        subscriber.acknowledge(
            request={
                "subscription": account_subscription_path,
                "ack_ids": [message.ack_id]
            }
        )
        print(f"Account message processed: {data}")
    except Exception as e:
        # エラー時にはメッセージを確認せず、再処理されるようにする
        print(f"Error processing account message: {e}")

def poll_video_subscription():
    """ビデオサブスクリプションのポーリング"""
    while True:
        try:
            # 最大5メッセージを取得（必要に応じて調整）
            response = subscriber.pull(
                request={"subscription": video_subscription_path, "max_messages": 5}
            )
            
            for msg in response.received_messages:
                process_video_message(msg.message)
            
        except Exception as e:
            print(f"Error polling video subscription: {e}")
        
        # 次のポーリングまで待機
        time.sleep(POLLING_INTERVAL)

def poll_account_subscription():
    """アカウントサブスクリプションのポーリング"""
    while True:
        try:
            response = subscriber.pull(
                request={"subscription": account_subscription_path, "max_messages": 5}
            )
            
            for msg in response.received_messages:
                process_account_message(msg.message)
                
        except Exception as e:
            print(f"Error polling account subscription: {e}")
        
        time.sleep(POLLING_INTERVAL)

def create_video_crawler_job(data, attributes):
    """ビデオクローラーのジョブを作成"""
    namespace = os.environ.get('VIDEO_CRAWLER_NAMESPACE')
    image = os.environ.get('VIDEO_CRAWLER_IMAGE')
    
    import json
    params = json.loads(data)
    
    # シンプルに変更
    create_job(namespace, "video-crawler", image, params)

def create_account_crawler_job(data, attributes):
    """アカウントクローラーのジョブを作成"""
    namespace = os.environ.get('ACCOUNT_CRAWLER_NAMESPACE')
    image = os.environ.get('ACCOUNT_CRAWLER_IMAGE')
    
    import json
    params = json.loads(data)
    
    # シンプルに変更
    create_job(namespace, "account-crawler", image, params)

def create_job(namespace, name, image, params):
    """Kubernetes Jobの作成（コマンドとパラメータを指定可能）"""
    import uuid
    
    env_vars = [{"name": k, "value": str(v)} for k, v in params.items()]
    
    job_manifest = {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": f"{name}-{uuid.uuid4().hex[:8]}"},
        "spec": {
            "template": {
                "metadata": {
                    "labels": {"app": name}
                },
                "spec": {
                    "containers": [{
                        "name": name,
                        "image": image,
                        "env": env_vars
                    }],
                    "restartPolicy": "Never",
                    "serviceAccountName": f"{name}-ksa"  # 各クローラー専用のサービスアカウントを使用
                }
            },
            "backoffLimit": 2,
            "ttlSecondsAfterFinished": 3600
        }
    }
    
    try:
        batch_v1.create_namespaced_job(namespace=namespace, body=job_manifest)
        print(f"Created job in namespace {namespace}: {job_manifest['metadata']['name']}")
    except Exception as e:
        print(f"Error creating job in namespace {namespace}: {e}")

# メインアプリケーション起動
def main():
    # バックグラウンドスレッドでPub/Subポーリングを開始
    video_thread = threading.Thread(target=poll_video_subscription, daemon=True)
    account_thread = threading.Thread(target=poll_account_subscription, daemon=True)
    
    video_thread.start()
    account_thread.start()
    
    # HTTPサーバーを起動（ヘルスチェック用）
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/health')
    def health():
        return 'OK', 200
    
    app.run(host='0.0.0.0', port=8080)

if __name__ == '__main__':
    main()
