import os
import json
from google.cloud import pubsub_v1
from concurrent.futures import TimeoutError
from .crawler import AccountCrawler
from ..common.db import save_video_urls  # パスを修正

def process_account_list(message):
    """アカウントリストのメッセージを処理"""
    try:
        data = json.loads(message.data.decode('utf-8'))
        print(f"Received message data: {data}")  # デバッグ用
        
        account_url = data['account_url']
        username = data.get('username', 'Unknown')  # オプショナル
        is_new_account = data['is_new_account']
        timestamp = data.get('timestamp')  # オプショナル
        
        print(f"Processing account: {username} ({account_url}) (New: {is_new_account})")
        
        # クローラーの実行
        crawler = AccountCrawler()
        video_urls = crawler.collect_video_urls(account_url, is_new_account)
        
        # 動画URL収集完了後のみ完了通知を送信
        if video_urls:
            publisher = pubsub_v1.PublisherClient()
            topic_path = publisher.topic_path(
                os.getenv('PROJECT_ID'),
                'account-crawl-complete'
            )
            
            # DBへの保存が完了してから通知
            try:
                save_video_urls(account_url, video_urls)
                
                # 保存成功後に完了通知
                publisher.publish(
                    topic_path,
                    json.dumps({
                        'account_url': account_url,
                        'status': 'success',
                        'video_count': len(video_urls)
                    }).encode('utf-8')
                )
                print(f"Successfully processed and saved {len(video_urls)} videos for {account_url}")
                
            except Exception as e:
                print(f"Error saving videos: {str(e)}")
                # 保存に失敗した場合は完了通知を送信しない
                
        message.ack()
        
    except Exception as e:
        print(f"Error processing account list: {str(e)}")
        message.ack()  # エラー時も確認応答を送信

def main():
    """メインの実行関数"""
    subscriber = pubsub_v1.SubscriberClient()
    
    subscription_path = subscriber.subscription_path(
        os.getenv('PROJECT_ID'),
        'process-account-list'  # setup_pubsub.pyと同じ名前に
    )
    
    print("Starting account crawler...")
    print(f"Listening for messages on {subscription_path}")
    
    streaming_pull_future = subscriber.subscribe(
        subscription_path,
        callback=process_account_list
    )
    
    try:
        streaming_pull_future.result()
    except TimeoutError:
        streaming_pull_future.cancel()
        streaming_pull_future.result()

if __name__ == "__main__":
    main() 