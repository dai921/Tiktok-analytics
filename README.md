# TikTok Analytics Tool

TikTok動画の分析・可視化ツール。再生数、いいね数、コメント数などの指標を分析し、効果的なコンテンツ戦略の立案を支援します。

## 技術スタック

- **フロントエンド**
  - Next.js 15+
  - React 19
  - TypeScript
  - Tailwind CSS
  - shadcn/ui（Radixベース）
  - Recharts（データ可視化）
  - TanStack Table
  - DnD Kit（ドラッグ＆ドロップ）

- **バックエンド**
  - Next.js API Routes
  - MySQL
  - Prisma ORM
  - NextAuth.js（認証）

- **インフラ・開発環境**
  - Docker / Docker Compose
  - Turbopack
  - Google Cloud Platform（デプロイ環境）

## 必要要件

- Docker および Docker Compose
- （開発のみ）Node.js 20+
- （開発のみ）npm または pnpm

## 環境構築

### Dockerを使用する方法（推奨）

1. **リポジトリのクローン**

```bash
git clone https://github.com/[your-username]/tiktok-analytics.git
cd tiktok-analytics
```
2. **ローカルMySQLデータベースの設定**

MySQLサーバーをインストールし、`tiktok_data`データベースを作成。
dump\tiktok_data_20250508_0906.sql.gzを解凍する


3. **環境変数の設定**
`.env`ファイルをプロジェクトルートに作成：

```
ENVIRONMENT=development
PROJECT_ID=local-project
PUBSUB_EMULATOR_HOST=localhost:8681
STORAGE_EMULATOR_HOST=localhost:4443
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=tiktok_user
MYSQL_PASSWORD=tiktok_pass
MYSQL_DATABASE=tiktok_data

# アプリケーション設定
NODE_ENV=development
PORT=3001

# 関数のポート設定
COLLECT_URLS_PORT=8090
PROCESS_CRAWL_PORT=8091

# プロジェクトルートの設定
PROJECT_ROOT=
NEXT_PUBLIC_API_URL=http://localhost:8080
```

4. **Dockerコンテナの起動**

4-1 フロントエンドのコンテナ起動
プロジェクトルートにて
```bash
docker build  -t tiktok-analytics-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:8080 .
docker run -p 3030:8080 tiktok-analytics-frontend
```

4-2 バックエンドAPIのコンテナ起動
\backend\apiディレクトリにて
```bash
docker build -t tiktok-analytics-api .
docker run -p 8080:8080 --name tiktok-api-container --env-file .env tiktok-analytics-api
```
5. **アプリケーションへのアクセス**

ブラウザで `http://localhost:3030` を開きます。

## プロジェクト構造

```
.
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── api/           # APIルート
│   │   ├── auth/          # 認証関連ページ
│   │   └── dashboard/     # ダッシュボード
│   ├── components/         # Reactコンポーネント
│   │   ├── ui/            # UIコンポーネント（shadcn/ui）
│   │   └── dashboard/     # ダッシュボード専用コンポーネント
│   ├── hooks/              # カスタムReactフック
│   ├── lib/                # ユーティリティ関数
│   ├── middleware.ts       # Next.js ミドルウェア
│   └── types/              # TypeScript型定義
├── backend/               # バックエンド関連
│   ├── api/               # APIエンドポイント
│   ├── crawlers/          # データクローラーロジック
│   ├── functions/         # 関数
│   ├── storage/           # ストレージ関連
│   └── tests/             # バックエンドテスト
├── prisma/                # Prisma ORM
│   └── schema.prisma      # データベーススキーマ
├── public/                # 静的ファイル
├── docker-compose.yml     # Docker設定
└── Dockerfile             # Dockerファイル
```

## 主な機能

- ユーザー認証（NextAuth + Prisma）
- TikTok動画データの表示と分析
- カスタムダッシュボード
- データの可視化（グラフ、チャート）
- ドラッグ＆ドロップによるUIカスタマイズ
- レポート生成とエクスポート

## 開発ワークフロー

1. 新機能の開発は新しいブランチを作成

```bash
git checkout -b feature/new-feature
```

2. 変更をコミット

```bash
git add .
git commit -m "feat: add new feature"
```

3. プルリクエストを作成

```bash
git push origin feature/new-feature
```

## データベース管理

### Prismaの使用方法


## デプロイ

Google Cloud Platform（GCP）を使用してデプロイ：

1. **準備**
   - GCPアカウントとプロジェクトを作成
   - Google Cloud CLIをインストール
   - プロジェクトで必要なAPIを有効化：Cloud Run、Cloud SQL、Cloud Build

2. **Cloud SQLの設定**
   - MySQLインスタンスを作成
   - データベースユーザーを作成
   - 必要なデータベースを作成

```bash
gcloud sql instances create tiktok-analytics-db --database-version=MYSQL_8_0 --tier=db-f1-micro --region=asia-northeast1
gcloud sql users create tiktok-user --instance=tiktok-analytics-db --password=[PASSWORD]
gcloud sql databases create tiktok_analytics --instance=tiktok-analytics-db
```

3. **イメージのビルドとプッシュ**

```bash
# Cloud Buildを使用
gcloud builds submit --tag gcr.io/[PROJECT_ID]/tiktok-analytics
```

4. **Cloud Runへのデプロイ**

```bash
gcloud run deploy tiktok-analytics \
  --image gcr.io/[PROJECT_ID]/tiktok-analytics \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=mysql://tiktok-user:[PASSWORD]@/tiktok_analytics?socket=/cloudsql/[INSTANCE_CONNECTION_NAME],NEXTAUTH_URL=https://[YOUR_SERVICE_URL],NEXTAUTH_SECRET=[YOUR_SECRET]"
```

5. **Cloud SQLとCloud Runの接続**
   - Cloud SQLプロキシを設定
   - サービスアカウントに適切な権限を付与

## トラブルシューティング

**Q: Dockerコンテナが起動しない**
A: ポートの競合がないか確認。`docker-compose logs`でエラーを確認。

**Q: GCPデプロイ後にデータベース接続エラーが発生する**
A: Cloud SQLインスタンス接続名が正しく設定されていることを確認。また、サービスアカウントに適切な権限があるか確認。

# Commit Message Guidelines

コミットメッセージは以下の形式で記述します：

```
<type>: <subject>

[optional body]
[optional footer]
```

## Type一覧

- **feat**: 新機能
- **fix**: バグ修正
- **refactor**: バグ修正や機能追加のないコードの変更


## ルール

1. 件名（subject）
   - 50文字以内
   - 命令形で記述（"Added" → "Add"）
   - 最初の文字は小文字
   - 末尾にピリオドを付けない

2. 本文（body）
   - 72文字で改行
   - 何を、なぜ変更したのかを説明
   - 必要な場合のみ記述