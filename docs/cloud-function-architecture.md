# Cloud Function分離アーキテクチャ設計

## 現在の課題
- 動画ダウンロード（Selenium + yt-dlp）が重い処理
- 文字起こし（Gemini API）が時間がかかる
- FastAPIアプリケーションのリソース消費が大きい
- タイムアウトリスクが高い

## 提案アーキテクチャ

### 1. 全体構成
```
[Frontend] 
    ↓ HTTP Request
[FastAPI Backend] 
    ↓ Cloud Tasks/Pub/Sub
[Cloud Function: Video Processor] 
    ↓ Cloud Storage Upload
[Cloud Function: Transcription Processor]
    ↓ Database Update
[Database]
```

### 2. Cloud Function分離

#### 2.1 Video Download Function
**名前**: `tiktok-video-downloader`
**トリガー**: HTTP Trigger または Cloud Tasks
**処理内容**:
- TikTok動画のダウンロード（Selenium + yt-dlp）
- Cloud Storageへのアップロード
- 文字起こしFunction呼び出し

**入力**:
```json
{
  "video_id": "string",
  "url": "string",
  "callback_url": "string" // Optional: 完了通知用
}
```

**出力**:
```json
{
  "success": true,
  "video_id": "string",
  "storage_url": "string",
  "transcription_task_id": "string"
}
```

#### 2.2 Transcription Function
**名前**: `video-transcription-processor`
**トリガー**: HTTP Trigger または Pub/Sub
**処理内容**:
- Cloud Storageから動画取得
- Gemini APIによる文字起こし
- データベースへの結果保存

**入力**:
```json
{
  "video_id": "string",
  "storage_url": "string",
  "callback_url": "string" // Optional: 完了通知用
}
```

**出力**:
```json
{
  "success": true,
  "video_id": "string",
  "transcription": "string"
}
```

### 3. FastAPI Backend変更点

#### 3.1 新しいエンドポイント設計
```python
@router.post("")
async def transcribe_video(request: TranscriptionRequest):
    """非同期でTikTok動画の文字起こしを開始"""
    # 1. バリデーション（既存の処理）
    # 2. Cloud Taskでvideo download functionを呼び出し
    # 3. ジョブIDを返す（ポーリング用）
    
@router.get("/status/{job_id}")
async def get_transcription_status(job_id: str):
    """文字起こしの進行状況を取得"""
    
@router.get("/result/{video_id}")
async def get_transcription_result(video_id: str):
    """完了した文字起こし結果を取得"""
```

#### 3.2 ジョブ管理テーブル
```sql
CREATE TABLE transcription_jobs (
    id VARCHAR(255) PRIMARY KEY,
    video_id VARCHAR(255) NOT NULL,
    status ENUM('pending', 'downloading', 'transcribing', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 4. 通信方法

#### 4.1 Cloud Tasks（推奨）
- 確実な配信保証
- リトライ機能
- スケジューリング
- バックプレッシャー制御

#### 4.2 Pub/Sub（代替案）
- 高いスループット
- 非同期メッセージング
- イベント駆動アーキテクチャ

### 5. エラーハンドリング戦略

#### 5.1 リトライポリシー
- ダウンロード失敗: 最大3回リトライ
- 文字起こし失敗: 最大2回リトライ
- ネットワークエラー: 指数バックオフ

#### 5.2 デッドレターキュー
- 処理不可能なタスクの管理
- 手動介入が必要なケースの特定

### 6. 実装フェーズ

#### Phase 1: Cloud Function作成
1. `tiktok-video-downloader` Function
2. `video-transcription-processor` Function
3. 基本的なHTTPトリガー実装

#### Phase 2: FastAPI統合
1. Cloud Tasks統合
2. ジョブ管理機能追加
3. 既存エンドポイントの非同期化

#### Phase 3: 監視・ログ強化
1. Cloud Monitoring統合
2. 詳細ログ設定
3. アラート設定

### 7. 設定・環境変数

#### Cloud Function環境変数
```
GOOGLE_CLOUD_PROJECT=your-project
CLOUD_STORAGE_BUCKET=tiktok-videos-storage
GEMINI_API_KEY=your-gemini-key
DATABASE_URL=your-database-url
DOWNLOAD_PROXY=optional-proxy-url
```

#### 必要なIAMロール
- Cloud Storage Object Admin
- Cloud SQL Client
- Cloud Tasks Enqueuer

### 8. 利点

1. **スケーラビリティ**: 各処理が独立してスケール
2. **信頼性**: タイムアウトリスクの軽減
3. **保守性**: 処理の分離による管理容易性
4. **コスト効率**: 使用時のみリソース消費
5. **監視**: 個別の処理監視が可能

この設計について、どの部分から実装を始めたいか、または修正点があれば教えてください。 