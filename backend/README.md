# TikTok Analytics Backend

TikTokアカウントからの動画データを自動収集・管理するシステム

## 機能概要

- TikTokアカウントからの動画データ自動収集
- 収集データの効率的な管理と分析
- カテゴリ分類による動画の整理
- エミュレータ機能による開発・検証環境

## システム構成

- クラウドプラットフォーム: Google Cloud Platform
- 実行環境: Google Kubernetes Engine (GKE)
- データベース: Cloud SQL
- メッセージング: Cloud Pub/Sub
- スケジューラ: Cloud Functions

## 開発環境のセットアップ

### 必要条件

- Python 3.11.9
- Docker Desktop
- Google Cloud SDK
- Node.js
- Tiktok API 7.0.0以上

### インストール手順

1. リポジトリのクローン:
git clone https://github.com/your-username/tiktok-analytics-backend.git

2. 仮想環境の作成:
python -m venv venv


3. 依存パッケージのインストール:
pip install -r requirements.txt

4. 環境変数の設定:
cp .env.example .env


5. エミュレータの起動:
docker-compose -f docker-compose.dev.yml up -d


## 開発ガイドライン

- コードスタイル: PEP 8に準拠
- 型ヒント: 必須
- テスト: 新機能追加時はテストも追加

## ディレクトリ構造

tiktok-analytics-backend/
├── functions/ # Cloud Functions
├── crawlers/ # クローラー実装
├── db/ # データベース関連
├── emulator/ # エミュレータ環境
├── k8s/ # Kubernetes設定
└── storage_data/ # 収集データの保存先
