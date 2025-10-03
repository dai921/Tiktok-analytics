# このファイルは当ブランチでどのようなタスクを行うか明示的にしたものであり、主にcodexが参照することを目的とする。

## プロジェクト概要
- my-reportページを中心にTikTokアカウントの自動取得データと手入力データを統合し、レポート出力までを一貫して提供する。

## ゴール
- my-reportページを完成させ、ユーザーが自アカウントの最新指標と推移を確認・出力できる状態にする。

## 現状
- TikTok公式APIの連携処理は完了済み。バックグラウンドでの動画データ同期（Pub/Sub → Cloud Functions）と12時間ごとのトークン更新が稼働しており、`users_videos` / `users_video_daily_metrics_new` / `users_account_daily_metrics` に最新データが蓄積できる状態になった。
- フロントエンドとレポート系機能は引き続き実装・改善が必要。

## 残タスク（優先度順）
1. フロントエンド（my-reportページ）での最新データ表示・手入力データ統合UIの整備。
2. CSV / PowerPoint 出力仕様およびテンプレート設計。
3. 手入力データとの整合性チェックとバリデーションの実装。
4. 連携解除フロー（トークン削除、関連データクリーンアップ）の整備。

## 次アクション
- CSVエクスポート機能（期間指定ダウンロード）の実装を開始する。
- PowerPointレポート出力機能（テンプレートとロゴ差し替え対応）の実装を開始する。

## データ同期フロー
1. 初回連携時は `/api/auth/tiktok/complete` 成功後に初期同期タスクを起動し、TikTok API (`video.list`, `user.info.*`) から取得したデータを `users_videos` と `users_video_daily_metrics_new` に保存。アクセストークン／リフレッシュトークンは `users_tiktok_accounts` と `tiktok_tokens` に暗号化保存する。
2. 日次バッチ（Cloud Scheduler → Pub/Sub → Cloud Function `mode=sync`）で全連携アカウントの動画指標を更新し、`users_account_daily_metrics` / `users_video_daily_metrics_new` を最新化する。
3. 12時間ごとのトークン更新バッチ（Cloud Scheduler → Pub/Sub → Cloud Function `mode=token_refresh`）で全アカウントの `refresh_token` と `access_token` を更新し、期限切れを防止する。
4. 連携解除リクエスト時は `users_tiktok_accounts` / `tiktok_tokens` を削除し、必要に応じて関連テーブルをクリーニングする。
