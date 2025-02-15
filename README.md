# TikTok Analytics Tool

TikTok動画の分析・可視化ツール。再生数、いいね数、コメント数などの指標を分析し、効果的なコンテンツ戦略の立案を支援します。

## 技術スタック

- **フロントエンド**
  - Next.js 14
  - TypeScript
  - Tailwind CSS
  - shadcn/ui

- **バックエンド**
  - Google Sheets API (スプレッドシートをデータベースとして使用)

## 必要要件

- Node.js 18.17以上
- npm or pnpm
- Google Cloud Platform アカウント

## 環境構築

1. **リポジトリのクローン**

git clone https://github.com/[your-username]/tiktok-analytics.git
cd tiktok-analytics

2. **依存パッケージのインストール**

pnpm install

3. **環境変数の設定**
`.env.local`ファイルをプロジェクトルートに作成：

GOOGLE_SHEET_ID=your-sheet-id
GOOGLE_CLIENT_EMAIL=your-service-account-email
GOOGLE_PRIVATE_KEY=your-private-key

4. **Google Sheets APIの設定**
- Google Cloud Platformでプロジェクトを作成
- Google Sheets APIを有効化
- サービスアカウントを作成し、キーを取得
- スプレッドシートをサービスアカウントと共有

5. **開発サーバーの起動**

pnpm dev

アプリケーションは `http://localhost:3000` で実行されます。

## プロジェクト構造

src/
├── app/               # Next.js App Router
│   ├── api/          # APIルート
│   ├── login/        # ログインページ
│   └── register/     # 登録ページ
├── components/        # Reactコンポーネント
│   ├── auth/         # 認証関連
│   └── ui/           # UIコンポーネント
└── lib/              # ユーティリティ

## 主な機能

- ユーザー認証（Google Spreadsheetsベース）
- TikTok動画データの表示
- 各種メトリクスによるフィルタリング/ソート
- データの可視化
- CSV形式でのエクスポート

## 開発ワークフロー

1. 新機能の開発は新しいブランチを作成

git checkout -b feature/new-feature

2. 変更をコミット

git add .
git commit -m "feat: add new feature"

3. プルリクエストを作成

git push origin feature/new-feature

## デプロイ

Vercelを使用してデプロイ：

1. [Vercel](https://vercel.com)でアカウントを作成
2. プロジェクトをインポート
3. 環境変数を設定
4. デプロイを実行

## トラブルシューティング

**Q: `pnpm install`が失敗する**
A: Node.jsのバージョンが18.17以上であることを確認

**Q: APIエラーが発生する**
A: 環境変数が正しく設定されているか確認

## ライセンス

MIT

## コントリビューション

1. Forkを作成
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチをPush (`git push origin feature/amazing-feature`)
5. Pull Requestを作成



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
- **docs**: ドキュメントのみの変更
- **style**: コードの動作に影響しない、見た目の変更（スペース、フォーマット、欠落の修正、セミコロンなど）
- **refactor**: バグ修正や機能追加のないコードの変更
- **perf**: パフォーマンスを向上させるコードの変更
- **test**: 不足しているテストの追加や既存のテストの修正
- **chore**: ビルドプロセスやドキュメント生成などの補助ツールやライブラリの変更

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

## 例

```
feat: add login form component

- Implement login form with email and password fields
- Add form validation
- Connect with Google Sheets API for authentication

Resolves: #123
```

```
fix: correct navigation header alignment

Center align the navigation items and adjust spacing
```

```
docs: update README with deployment instructions
```

```
style: format auth components with prettier
```

```
refactor: simplify filter logic in dashboard
```

これらのルールに従うことで：
- 変更履歴の可読性向上
- レビューの効率化
- 自動化ツールとの連携が容易に