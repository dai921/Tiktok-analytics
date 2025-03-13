from google.cloud import pubsub_v1
import os

def publish_test_message():
    """テスト用のクロール要求を送信"""
    publisher = pubsub_v1.PublisherClient()
    
    project_id = "local-project"
    topic_id = "account-crawl-requests"
    
    topic_path = publisher.topic_path(project_id, topic_id)
    
    # 実在するアカウントのURL
    test_data = {
        'account_url': 'https://www.tiktok.com/@deanjcouqtr'  # TikTok公式アカウント
    }
    
    # メッセージをパブリッシュ
    future = publisher.publish(
        topic_path, 
        str(test_data).encode('utf-8')
    )
    
    print(f"Published message ID: {future.result()}")

if __name__ == "__main__":
    os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8085'
    publish_test_message() 