# Playwright連携サンドボックス

既存の Cloud Function に影響を与えずに、Playwright ベースの TikTok 動画ダウンロード基盤を検証するための作業用ディレクトリです。ここで検証・整備した内容を最終的に本番フローへ取り込む想定です。

## ディレクトリ構成（2025-09-29 時点）

- `token_refresh_job/`
  - Cloud Run Jobs で Playwright を起動し、最新の `msToken` を取得して Secret Manager に保存するための実装。`Dockerfile` / `requirements.txt` / `main.py` が揃っており、環境変数 `PROJECT_ID`, `MS_TOKEN_SECRET_ID`, `TARGET_URL`, `USER_AGENT` を設定して実行してください。
  - 詳細設計は `docs/token_refresh_job.md` を参照。
- `mobile_api_client/`
  - モバイル API を呼び出して動画 URL を取得する Python パッケージの雛形。`TikTokMobileClient` が最新のトークンを Secret Manager から読み込み、API を叩くまでのフローを含みます。
  - `signature.generate_x_bogus` はプレースホルダのため、実運用前に実装を差し替えてください。設計メモは `docs/mobile_api_client.md` に記載しています。
- `docs/`
  - 設計メモ、シーケンス図、デプロイ手順などをまとめる場所です。現状は `token_refresh_job.md` と `mobile_api_client.md` を配置しています。

## 今後の進め方

1. `token_refresh_job/` をベースに、Cloud Run Jobs と Cloud Scheduler のデプロイ設定を整備する（Terraform もしくは `gcloud` スクリプト）。
2. `mobile_api_client/` のプレースホルダ実装を段階的に実装：
   - X-Bogus 生成ロジックの導入
   - トークン失効時の Cloud Run Job トリガー実装
   - レスポンスのバリデーションと例外処理の拡充
3. 単体テスト・統合テストを追加して動作を確認。
4. 既存の Cloud Function から新クライアントを呼び出す形に差し替え。

当面ここに置くコード・ドキュメントは検証目的であり、本番フローに組み込む前に十分なテストとレビューを実施してください。
