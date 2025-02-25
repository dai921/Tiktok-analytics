import os
from google.cloud import pubsub_v1
import time
import traceback

def setup_pubsub():
    """Pub/Subのトピックとサブスクリプションを設定"""
    print("Pub/Subトピックとサブスクリプションを作成しています...")
    
    # 環境変数設定
    if not os.getenv('PUBSUB_EMULATOR_HOST'):
        os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'  # 8086から8681に修正
    
    project_id = os.getenv('PROJECT_ID', 'local-project')
    print(f"Pub/Sub Emulator: {os.environ['PUBSUB_EMULATOR_HOST']}")
    print(f"Project ID: {project_id}")
    
    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()
    
    # 必要なトピックとサブスクリプションをディクショナリで定義
    # 'トピック名': 'サブスクリプション名'
    topics_and_subs = {
        'process-account-list': 'process-account-list',
        'crawl-complete': 'process-crawl-complete-sub'  # 新しいトピックを追加
    }
    
    # 各トピックとサブスクリプションを作成
    for topic_id, sub_id in topics_and_subs.items():
        topic_path = publisher.topic_path(project_id, topic_id)
        subscription_path = subscriber.subscription_path(project_id, sub_id)
        
        print(f"\nトピック設定: {topic_id}")
        print(f"トピックパス: {topic_path}")
        
        # トピックの作成（タイムアウト処理付き）
        try:
            topic = publisher.create_topic(request={"name": topic_path})
            print(f"トピック作成完了: {topic_id}")
        except Exception as e:
            print(f"トピック '{topic_id}' は既に存在するか、エラーが発生しました: {e}")
            # 詳細なエラー情報（デバッグ目的）
            if os.getenv('DEBUG'):
                print(traceback.format_exc())
        
        # サブスクリプションの作成
        try:
            subscription = subscriber.create_subscription(
                request={"name": subscription_path, "topic": topic_path}
            )
            print(f"サブスクリプション作成完了: {sub_id}")
        except Exception as e:
            print(f"サブスクリプション '{sub_id}' は既に存在するか、エラーが発生しました: {e}")
            # 詳細なエラー情報（デバッグ目的）
            if os.getenv('DEBUG'):
                print(traceback.format_exc())
    
    print("\nPub/Sub設定完了!")
    return True

if __name__ == "__main__":
    # スクリプト単体実行時
    start_time = time.time()
    success = setup_pubsub()
    end_time = time.time()
    print(f"処理時間: {end_time - start_time:.2f}秒")
    print("ステータス:", "成功" if success else "失敗") 