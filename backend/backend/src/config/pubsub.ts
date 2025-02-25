import { PubSub } from '@google-cloud/pubsub';

// 環境変数の設定
const pubsubHost = process.env.PUBSUB_EMULATOR_HOST || 'localhost:8085';

// PubSubクライアントの設定
export const pubsubClient = new PubSub({
  projectId: 'tiktok-project',
  apiEndpoint: pubsubHost,
});

// トピック名の定義
export const TOPICS = {
  ACCOUNT_CRAWLER: 'account-crawler',
  VIDEO_CRAWLER: 'video-crawler',
  DATA_PROCESSOR: 'data-processor',
} as const;

// サブスクリプション名の定義
export const SUBSCRIPTIONS = {
  ACCOUNT_CRAWLER: 'account-crawler-sub',
  VIDEO_CRAWLER: 'video-crawler-sub',
  DATA_PROCESSOR: 'data-processor-sub',
} as const;

// PubSubに関する型定義
export interface PubSubMessage<T> {
  data: T;
  attributes?: Record<string, string>;
}

// メッセージ送信用のヘルパー関数
export async function publishMessage<T>(
  topicName: keyof typeof TOPICS,
  message: PubSubMessage<T>
): Promise<string> {
  const topic = pubsubClient.topic(TOPICS[topicName]);
  const messageBuffer = Buffer.from(JSON.stringify(message.data));
  const messageId = await topic.publish(messageBuffer, message.attributes);
  return messageId;
} 