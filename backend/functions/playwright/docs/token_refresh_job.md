# トークン更新ジョブ設計メモ

## ゴール

- Playwright (Chromium) を起動して TikTok にアクセスし、最新の `msToken` を取得する。
- 取得したトークンを Secret Manager（または Firestore）に保存し、アプリ側が参照できるようにする。
- Cloud Run Jobs と Cloud Scheduler を使って **60 分おき** に自動実行する。

## ジョブ構成

| 項目 | 値 (案) |
| ---- | ------- |
| ベースイメージ | `mcr.microsoft.com/playwright/python:v1.48.0-jammy` |
| エントリポイント | `python main.py`（Playwright で `https://www.tiktok.com/` を開き cookie を取得） |
| 倍率 | 単一インスタンス / 実行ごとに終了 |
| リソース | 1 vCPU / 2 GB RAM で開始（必要に応じて調整） |
| 環境変数 | `PROJECT_ID`, `MS_TOKEN_SECRET_ID`, `TARGET_URL`(任意), `USER_AGENT`(任意) |
| 認証 | Cloud Run ジョブのサービスアカウントに Secret Manager への `roles/secretmanager.admin` 権限を付与 |

## 処理フロー

1. ジョブ起動（Cloud Scheduler → Cloud Run Jobs）。
2. Playwright でヘッドレス Chromium を起動し `https://www.tiktok.com/` を訪問。
3. `context.cookies()` から `msToken` を抽出。
4. Secret Manager に JSON (`{"msToken": ..., "updated_at": ...}`) として新バージョンを追加。必要に応じて Firestore にも平文保存。
5. 正常終了ログを Cloud Logging に出力。

## スケジューリング

- Cloud Scheduler で 60 分間隔の cron (`0 * * * *`) を設定し、`run.jobs.run` API を叩いてジョブを起動。
- エラー発生時は Cloud Logging → Error Reporting で通知、再実行は次のスケジュールに任せる（必要ならリトライ）。

## TODO

- `token_refresh_job/` に Terraform / gcloud スクリプトを追加し、CI/CD パイプラインでデプロイできるようにする。
- Secret Manager への保存方式を決定（バージョン追加 or 既存バージョン上書き）。
- Firestore にも書き込む場合の権限・スキーマ案を検討。

