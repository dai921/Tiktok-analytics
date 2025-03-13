from google.cloud import pubsub_v1
import os
import json
import time

# 環境変数設定
os.environ["PUBSUB_EMULATOR_HOST"] = "localhost:8086"
os.environ["PROJECT_ID"] = "local-project"

# Pub/Subクライアント
publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path("local-project", "crawl-complete")

# 完了通知を送信したいアカウント
accounts = [
    {
        "account_url": "https://www.tiktok.com/@test_user1",
        "video_count": 42,
        "is_new_account": True
    },
    {
        "account_url": "https://www.tiktok.com/@test_user2",
        "video_count": 8,
        "is_new_account": False 
    },
    {
        "account_url": "https://www.tiktok.com/@test_user3",
        "video_count": 65,
        "is_new_account": True
    }
]

print("クローリング完了通知を送信します...")

# 各アカウントの完了通知を送信
for account in accounts:
    # 完了メッセージ作成
    completion_message = {
        "account_url": account["account_url"],
        "status": "success",
        "video_count": account["video_count"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    print(f"アカウント {account['account_url']} の完了通知を送信中...")
    
    # Pub/Subにメッセージ送信
    data = json.dumps(completion_message).encode("utf-8")
    future = publisher.publish(topic_path, data)
    message_id = future.result()
    
    print(f"  送信成功: {message_id}")
    print(f"  送信データ: {json.dumps(completion_message, indent=2)}")
    
    # 少し待機（連続送信による問題を避けるため）
    time.sleep(0.5)

print("\nすべての完了通知が送信されました")
print("process_crawl_complete関数のログを確認してください") 