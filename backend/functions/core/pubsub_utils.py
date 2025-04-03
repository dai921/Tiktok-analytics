import os
from google.cloud import pubsub_v1
import logging
from typing import Optional
import json

logger = logging.getLogger(__name__)

def get_pubsub_client() -> pubsub_v1.PublisherClient:
    """環境に応じたPub/Subクライアントを取得"""
    if os.getenv('ENVIRONMENT') == 'production':
        # 本番環境: GCPのPub/Subを使用
        logger.info("本番環境: GCP Pub/Subを使用")
    else:      # 開発環境: エミュレータを使用
        os.environ['PUBSUB_EMULATOR_HOST'] = os.getenv('PUBSUB_EMULATOR_HOST', '127.0.0.1:8681')
        logger.info(f"開発環境: Pub/Subエミュレータを使用")
    
    return pubsub_v1.PublisherClient()

def publish_message(topic_name: str, message: dict) -> Optional[str]:
    """メッセージをPub/Subに発行"""
    try:
        publisher = get_pubsub_client()
        topic_path = publisher.topic_path(os.getenv('PROJECT_ID'), topic_name)
        
        future = publisher.publish(topic_path, data=json.dumps(message).encode('utf-8'))
        message_id = future.result()
        logger.info(f"メッセージを発行しました: {message_id}")
        return message_id
    except Exception as e:
        logger.error(f"メッセージ発行エラー: {e}")
        raise
