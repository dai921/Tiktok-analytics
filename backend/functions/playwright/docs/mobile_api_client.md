# モバイルAPIクライアント設計メモ

## 目的

- Secret Manager / Firestore に保存された `msToken` を利用して TikTok モバイル API を呼び出し、動画の `play_addr` / `download_addr` を取得。
- 取得した URL を既存の Cloud Function（ダウンローダー）に返すためのスタンドアロンライブラリとして実装。
- トークンの期限切れや TikTok 側のレスポンス変化に備え、失敗時は即座にトークン再取得フローへフォールバック。

## 実装方針

1. **構成**
   - Python モジュールとして `mobile_api_client/` に実装。
   - エントリポイント：`fetch_video_sources(video_id: str) -> dict`
     - 戻り値例：`{"play_addr": "...", "download_addr": "...", "metadata": {...}}`
   - 依存ライブラリ：`httpx`, `google-cloud-secret-manager` など（`requirements.txt` に定義済み）。

2. **トークン取得**
   - 初期リクエストでは Secret Manager から最新バージョンの `msToken` を取得。
   - 環境変数 `PROJECT_ID`, `MS_TOKEN_SECRET_ID` で対象を指定。必要があれば Firestore による複数トークン管理を拡張。

3. **API コール**
   - エンドポイント案：`https://m.tiktok.com/api/item/detail/?itemId={video_id}&aid=1988&app_name=tiktok_web` 等。
   - クエリパラメータには `device_platform=webapp`, `browser_language=en`, `region=JP` などを含める。
   - `User-Agent` と `Referer` を browser 相当に固定（ENV `TIKTOK_MOBILE_USER_AGENT` で上書き可能）。
   - `X-Bogus` の生成が必要。現在は `signature.generate_x_bogus` がプレースホルダを返すため、実装差し替えが前提。

4. **レスポンス解析**
   - JSON 内 `itemInfo.itemStruct.video` から `playAddr`, `downloadAddr`, `ratio`, `duration` 等を抽出。
   - 必要に応じて `play_addr.url_list[0]` のようなリストを扱う。

5. **フォールバック戦略**
   - エラーステータス or `video` 要素欠落の場合：
     1. トークン失効と判断 → トークン更新ジョブを同期呼び出し（Cloud Run Jobs API）もしくは Pub/Sub にメッセージ発行。
     2. ジョブ完了後、新トークンでリトライ（最大 1 回）。
   - 実装例では `TOKEN_REFRESH_TRIGGER_URL`（Cloud Run Job を叩く HTTPS エンドポイント）を env で受け取り、POST を投げるプレースホルダを用意。

6. **ロギング / 監視**
   - Cloud Logging へ `video_id`, `status`, `retry_count`, `token_version` を出力。
   - エラー率が一定以上の場合にアラートを発報できるようにする。

7. **将来拡張**
   - `msToken` 以外に `ttwid`, `s_v_web_id`, `tt_chain_token` などが必要になった場合、Secret Manager のスキーマを拡張して対応。
   - PC API への切り替えや、動画以外（音源、サムネイル）取得への拡張も同モジュール内で対応できるよう汎用的な構造を意識する。

## TODO

- `signature.generate_x_bogus` を実装 or 既存 OSS を組み込む。
- フォールバックで Cloud Run Jobs をトリガーする具体的な API 呼び出し手順（IAM 含む）を整理。
- Firestore へも保存する場合の構造設計。
- 単体テスト／統合テスト戦略を記述（モックレスポンス、ステージング用トークン）。

