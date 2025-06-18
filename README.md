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

MySQL 8.0 サーバーをインストールし、以下の手順で`tiktok_data`データベースを作成する（ターミナルを使う場合）

2-1. `root` ユーザーで MySQL にログイン

```cmd
mysql -u root -p
```

2-2. 既存のデータベースを削除（存在する場合）

```sql
mysql> DROP DATABASE IF EXISTS tiktok_data;
```

2-3. 新しいデータベースを作成

```sql
mysql> CREATE DATABASE tiktok_data;
```

2-4. `tiktok_user` ユーザーの作成（存在しない場合）

```sql
mysql> CREATE USER 'tiktok_user'@'%' IDENTIFIED BY 'tiktok_pass';
```

2-5. `tiktok_user` に権限を付与
```sql
mysql> GRANT ALL PRIVILEGES ON tiktok_data.* TO 'tiktok_user'@'%';
mysql> FLUSH PRIVILEGES;
mysql> exit;
```

2-6. `tiktok_user` でデータベースにダンプをインポート

事前にdump\tiktok_data_20250602.sql.gzを解凍しておく

```cmd
mysql -u tiktok_user -p tiktok_data < "(解凍したダンプファイルのパス)"
```

なおPowerShellでは `<` 演算子が使えないため、以下のように `cmd.exe` をフルパス指定して実行する：

```powershell
& "C:\Windows\System32\cmd.exe" /c "mysql -u tiktok_user -p tiktok_data < (解凍したダンプファイルのパス)"
```


&nbsp;  


3. **環境変数の設定**
`.env`ファイルをbackend\apiディレクトリ、backend\functionsディレクトリに作成：

backend\apiディレクトリ
```
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=tiktok_user
MYSQL_PASSWORD=tiktok_pass
MYSQL_DATABASE=tiktok_data

# JWT設定
JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# セッション設定
SESSION_EXPIRE_DAYS=7

# アプリケーション設定
API_HOST=
API_PORT=
DEBUG=

# CORS設定
ALLOWED_ORIGINS=http://localhost:3030,http://localhost:8000

#文字起こし関連の設定
GEMINI_API_KEY=
GOOGLE_CLOUD_PROJECT=local-project
# Cloud Storageバケット名（省略可能、デフォルト値あり）
CLOUD_STORAGE_BUCKET=tiktok-videos-storage
TIKTOK_DOWNLOADER_FUNCTION_URL=
TRANSCRIPTION_FUNCTION_URL=
```

backend\functionsディレクトリ
```
SPREADSHEET_ID=
SPREADSHEET_CATEGORY_ID=
SPREADSHEET_CRAWLER_ID=
GOOGLE_APPLICATION_CREDENTIALS=

# Database設定（ローカルMySQL用）
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=tiktok_user
MYSQL_PASSWORD=tiktok_pass
MYSQL_DATABASE=tiktok_data

# 環境設定
ENVIRONMENT=development 

# Pub/Sub設定
PUBSUB_EMULATOR_HOST=127.0.0.1:8681
PROJECT_ID=local-project
```

4. **Dockerコンテナの起動**

4-1 フロントエンドのコンテナ起動
プロジェクトルートにて
```bash
docker build  -t tiktok-analytics-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:8080 --build-arg NEXT_PUBLIC_GA_ID=G-LP0P4KQ76C.
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

テーブル追加時は`backend\db`に説明文書を残す
さらにmysqldumpでダンプファイルを作成し、圧縮したものを`dump`に保存する
本番環境のCloud SQLにもテーブルを追加する


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
```

3. **イメージのビルドとプッシュ**
3-1.フロントエンド
プロジェクトディレクトリにて
```
docker build \
  --no-cache \
  --build-arg NEXT_PUBLIC_API_URL=https://backend-service-22573532446.asia-northeast1.run.app \
  --build-arg NEXT_PUBLIC_GA_ID=G-LP0P4KQ76C \
  -t asia-northeast1-docker.pkg.dev/tiktok-analytics-prod-451609/frontend-repo/frontend:latest \.

gcloud artifacts repositories create frontend-repo --repository-format=docker --location=asia-northeast1 --description="フロントエンドコンテナ"
docker push asia-northeast1-docker.pkg.dev/tiktok-analytics-prod-451609/frontend-repo/frontend:latest

gcloud run deploy frontend-service \
  --image=asia-northeast1-docker.pkg.dev/tiktok-analytics-prod-451609/frontend-repo/frontend:latest \
  --region=asia-northeast1 \
  --platform=managed \
  --service-account=cloudbuild@tiktok-analytics-prod-451609.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://backend-service-22573532446.asia-northeast1.run.app,NEXT_PUBLIC_GA_ID=G-LP0P4KQ76C"
```

3-2.バックエンド
backend\apiディレクトリにて
```
docker build -t asia-northeast1-docker.pkg.dev/tiktok-analytics-prod-451609/backend-repo/backend:yyyyy .
gcloud artifacts repositories create backend-repo --repository-format=docker --location=asia-northeast1 --description="バックエンドコンテナ"
docker push asia-northeast1-docker.pkg.dev/tiktok-analytics-prod-451609/backend-repo/backend:yyyyy
gcloud run services replace service.yaml --region=asia-northeast1

```

4. **Cloud SQLとCloud Runの接続**
   - Cloud SQLプロキシを設定
   - サービスアカウントに適切な権限を付与


## Gitブランチ命名規則

### ブランチプレフィックス
- `feature/` : 新機能開発
- `fix/` : バグ修正
- `docs/` : ドキュメント関連
- `test/` : テスト関連

### 命名形式
```
<prefix>/<short-description>
```

## Commit Message Guidelines

コミットメッセージは以下の形式で記述します：

```
<type>: <subject>

[optional body]
[optional footer]
```

### Type一覧

- **feat**: 新機能
- **fix**: バグ修正
- **refactor**: バグ修正や機能追加のないコードの変更


### ルール

1. 件名（subject）
   - 50文字以内
   - 命令形で記述（"Added" → "Add"）
   - 最初の文字は小文字
   - 末尾にピリオドを付けない

2. 本文（body）
   - 72文字で改行
   - 何を、なぜ変更したのかを説明
   - 必要な場合のみ記述