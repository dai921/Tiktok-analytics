import os
import time
import threading
import datetime
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

# ジョブ管理用の変数を追加
video_job_active = False
video_job_name = None
last_video_message_time = None
VIDEO_JOB_TIMEOUT = 600  # 10分 = 600秒

def process_video_message(message):
    """ビデオクローラー用のメッセージ処理"""
    global video_job_active, last_video_message_time
    
    try:
        data = message.data.decode('utf-8')
        attributes = message.attributes
        
        # 最終メッセージ受信時間を更新
        last_video_message_time = datetime.datetime.now()
        
        # ジョブが既に実行中でなければ新しいジョブを作成
        if not video_job_active:
            # ここでビデオクローラージョブを作成
            create_video_crawler_job(data, attributes)
            video_job_active = True
        else:
            print("Video crawler job already running, ignoring message")
        
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
    global video_job_name
    
    namespace = os.environ.get('VIDEO_CRAWLER_NAMESPACE')
    image = os.environ.get('VIDEO_CRAWLER_IMAGE')
    
    import json
    params = json.loads(data)
    
    # ジョブ名を保存するために変更
    video_job_name = create_job(namespace, "video-crawler", image, params, replicas=6)

def create_account_crawler_job(data, attributes):
    """アカウントクローラーのジョブを作成"""
    namespace = os.environ.get('ACCOUNT_CRAWLER_NAMESPACE')
    image = os.environ.get('ACCOUNT_CRAWLER_IMAGE')
    
    import json
    params = json.loads(data)
    
    # シンプルに変更
    create_job(namespace, "account-crawler", image, params)

def create_job(namespace, name, image, params, replicas=1):
    """Kubernetes Jobの作成（コマンドとパラメータを指定可能）"""
    import uuid
    
    job_id = uuid.uuid4().hex[:8]
    job_name = f"{name}-{job_id}"
    
    env_vars = [{"name": k, "value": str(v)} for k, v in params.items()]
    
    job_manifest = {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": job_name},
        "spec": {
            "parallelism": replicas,  # 同時に実行するPodの数
            "template": {
                "metadata": {
                    "labels": {"app": name}
                },
                "spec": {
                    "nodeSelector": {
                        "cloud.google.com/gke-nodepool": "video-pool"  # 既存のvideo-poolを使用
                    },
                    "containers": [{
                        "name": name,
                        "image": image,
                        "env": env_vars
                    }],
                    "restartPolicy": "Never",
                    "serviceAccountName": f"{name}-ksa"  # 各クローラー専用のサービスアカウント
                }
            },
            "backoffLimit": 2,
            "ttlSecondsAfterFinished": 3600
        }
    }
    
    try:
        batch_v1.create_namespaced_job(namespace=namespace, body=job_manifest)
        print(f"Created job in namespace {namespace}: {job_name}")
        return job_name
    except Exception as e:
        print(f"Error creating job in namespace {namespace}: {e}")
        return None

def check_video_job_timeout():
    """ビデオジョブのタイムアウトをチェックするスレッド"""
    global video_job_active, video_job_name, last_video_message_time
    
    while True:
        try:
            # ジョブがアクティブで、最後のメッセージから10分以上経過している場合
            if (video_job_active and last_video_message_time and 
                (datetime.datetime.now() - last_video_message_time).total_seconds() > VIDEO_JOB_TIMEOUT):
                
                # ジョブを削除
                if video_job_name:
                    namespace = os.environ.get('VIDEO_CRAWLER_NAMESPACE')
                    try:
                        batch_v1.delete_namespaced_job(
                            name=video_job_name,
                            namespace=namespace,
                            body=client.V1DeleteOptions(
                                propagation_policy='Foreground',
                                grace_period_seconds=5
                            )
                        )
                        print(f"Deleted video job {video_job_name} due to timeout")
                    except Exception as e:
                        print(f"Error deleting video job: {e}")
                
                # 状態をリセット
                video_job_active = False
                video_job_name = None
                last_video_message_time = None
        except Exception as e:
            print(f"Error in job timeout checker: {e}")
        
        # 1分ごとにチェック
        time.sleep(60)

# メインアプリケーション起動
def main():
    global last_video_message_time
    
    # 初期化
    last_video_message_time = datetime.datetime.now()
    
    # バックグラウンドスレッドでPub/Subポーリングを開始
    video_thread = threading.Thread(target=poll_video_subscription, daemon=True)
    account_thread = threading.Thread(target=poll_account_subscription, daemon=True)
    
    # ジョブタイムアウトチェッカーを開始
    timeout_checker = threading.Thread(target=check_video_job_timeout, daemon=True)
    
    video_thread.start()
    account_thread.start()
    timeout_checker.start()
    
    # HTTPサーバーを起動（ヘルスチェック用）
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/health')
    def health():
        return 'OK', 200
    
    app.run(host='0.0.0.0', port=8080)

if __name__ == '__main__':
    main()
