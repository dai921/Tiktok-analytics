# TikTok Analytics バックエンド 本番環境設定メモ

## 1. 環境変数設定

### 必須環境変数
- `PROJECT_ID`: GCPプロジェクトID
- `MYSQL_USER`: データベースユーザー名
- `MYSQL_PASSWORD`: データベースパスワード
- `MYSQL_DATABASE`: データベース名

### 開発環境固有の変数（本番では不要）
- `PUBSUB_EMULATOR_HOST`: 本番環境では削除または設定しない

### 本番環境固有の変数
- `MYSQL_HOST`: Cloud SQLのIPアドレス（127.0.0.1ではなく）
- `MYSQL_PORT`: データベースポート（通常は3306）

## 2. IAM権限設定

### サービスアカウント権限
- Pub/Sub Publisher (`roles/pubsub.publisher`)
- Pub/Sub Subscriber (`roles/pubsub.subscriber`)
- Cloud SQL Client (`roles/cloudsql.client`)

### Workload Identity設定（GKE使用時）

bash
gcloud iam service-accounts add-iam-policy-binding \
--role roles/iam.workloadIdentityUser \
--member "serviceAccount:PROJECT_ID.svc.id.goog[NAMESPACE/KSA_NAME]" \
GSA_NAME@PROJECT_ID.iam.gserviceaccount.com

## 3. Pub/Sub設定

### トピック作成

bash
gcloud pubsub topics create process-account-list
gcloud pubsub topics create crawl-complete

### サブスクリプション作成
bash
gcloud pubsub subscriptions create process-account-list --topic=process-account-list


### デッドレターキュー設定（オプション）
bash
gcloud pubsub topics create process-account-list-dlq
gcloud pubsub subscriptions create process-account-list --topic=process-account-list \
--dead-letter-topic=process-account-list-dlq \
--max-delivery-attempts=5


## 4. データベース設定

### Cloud SQL接続
- プライベートIPを使用（推奨）
- または、Cloud SQL Proxyを使用

### データベースマイグレーション

bash
マイグレーションスクリプトを実行
python db/migrations/run_migrations.py


## 5. コンテナ化とデプロイ

### Dockerイメージのビルド
bash
docker build -t gcr.io/PROJECT_ID/account-crawler:latest .

### イメージのプッシュ

bash
docker push gcr.io/PROJECT_ID/account-crawler:latest
### GKEへのデプロイ

bash
kubectl apply -f k8s/account-crawler-deployment.yaml


### Cloud Runへのデプロイ（代替手段）

bash
gcloud run deploy account-crawler \
--image gcr.io/PROJECT_ID/account-crawler:latest \
--platform managed \
--region asia-northeast1 \
--service-account=SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com

## 6. スケーリング設定

### GKE HPA設定

yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
name: account-crawler-hpa
spec:
scaleTargetRef:
apiVersion: apps/v1
kind: Deployment
name: account-crawler
minReplicas: 1
maxReplicas: 10
metrics:
type: Resource
resource:
name: cpu
target:
type: Utilization
averageUtilization: 70


## 7. モニタリングとロギング

### Cloud Loggingの設定
- ログレベルを`INFO`に設定（本番環境では`DEBUG`は避ける）
- 構造化ロギングの使用を検討

### Cloud Monitoringアラート
- Pub/Subの未処理メッセージ数
- クローラーのエラー率
- データベース接続エラー

## 8. セキュリティ設定

### シークレット管理
- Secret Managerの使用を検討

bash
gcloud secrets create mysql-password --replication-policy="automatic"
gcloud secrets versions add mysql-password --data-file="/path/to/password.txt"


### ネットワークセキュリティ
- VPCの使用
- ファイアウォールルールの設定
- Cloud SQLへのプライベート接続

## 9. 障害対策

### リトライ戦略
- 指数バックオフの実装
- デッドレターキューの監視

### バックアップ
- データベースの定期バックアップ
- 重要な設定のバージョン管理

## 10. コスト最適化

### リソース使用量の監視
- 不要なインスタンスの停止
- 自動スケーリングの適切な設定

### ストレージ最適化
- 古いログの削除ポリシー
- 不要なデータの定期的なクリーンアップ