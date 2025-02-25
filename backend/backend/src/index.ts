import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pubsubClient, TOPICS, publishMessage } from './config/pubsub';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ヘルスチェックエンドポイント
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// PubSubの動作確認用エンドポイント
app.post('/api/test/publish', async (req, res) => {
  try {
    const messageId = await publishMessage(TOPICS.ACCOUNT_CRAWLER, {
      data: {
        test: 'Hello PubSub!',
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ success: true, messageId });
  } catch (error) {
    console.error('Failed to publish message:', error);
    res.status(500).json({ success: false, error: 'Failed to publish message' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
