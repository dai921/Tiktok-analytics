# filter_presets テーブル

## 概要
ユーザーごとのフィルター/ソート状態（プリセット）を保存するテーブルです。`preset_id` によりURLから復元でき、`context_key` により画面スコープ（例: `dashboard:v1:affiliate`）を区別します。論理削除（`deleted_at`）を採用します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID（主キー） |
| preset_id | VARCHAR(255) | NO |  | UNIQUE | プリセットの一意識別子（URL解決用） |
| user_number | INT | NO |  | INDEX, FOREIGN KEY | ユーザー番号（`users.user_number` 参照） |
| name | VARCHAR(255) | NO |  | - | プリセット名 |
| context_key | VARCHAR(255) | NO |  | INDEX | スコープキー（例: `dashboard:v1:affiliate`） |
| payload | JSON | NO |  | - | フィルター状態のJSON（下記参照） |
| schema_version | INT | NO | 1 | - | ペイロードスキーマのバージョン |
| is_default | TINYINT(1) | NO | 0 | - | デフォルトフラグ |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | - | 更新日時 |
| deleted_at | TIMESTAMP | YES | NULL | - | 論理削除日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| uq_preset_id | preset_id | UNIQUE | URL解決を高速化 |
| idx_ws_ctx | user_number, context_key | INDEX | ユーザー×コンテキストでの検索最適化 |
| uq_default_per_context | user_number, default_ctx | UNIQUE | デフォルトの一意制約（コンテキストごと、生成列を利用） |

- 備考: `default_ctx` は生成列（仮想列）で、`CASE WHEN is_default = 1 THEN context_key ELSE NULL END` を格納します（下記参照）。

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| fk_filter_presets_user_number | users.user_number | CASCADE | ユーザー削除時に関連プリセットも削除 |

- 事前条件: `users.user_number` に一意制約が必要（`UNIQUE KEY uq_users_user_number (user_number)`）。

## payload のスキーマ方針
- 保存するのは「APIに渡す実フィルタ本体」である `currentFilters` を中核とし、タブ状態（どのデータ種別か）を `tab` に分離します。
- UIの「ソート優先1/2」など完全復元が必要な場合のみ、`sortMeta` を任意で保持します。
- `hasActiveFilters` や `columnFilters` は派生可能なため保存不要です。

例（schema_version=1）:
```json
{
  "schema_version": 1,
  "tab": { "isPrOnly": false, "isCorporateOnly": true, "isInfluencerOnly": false },
  "currentFilters": {
    "views": { "field": "views", "type": "between", "value": [1000, 10000], "active": true },
    "sort_primary": { "field": "views", "type": "sort", "value": "desc", "isPrimarySort": true, "timestamp": 1730612345678 }
  },
  "sortMeta": {
    "primary": { "field": "views", "direction": "desc" },
    "secondary": null
  }
}
```

## コンテキストキーの例
- `dashboard:v1:all`
- `dashboard:v1:affiliate`
- `dashboard:v1:corporate`
- `dashboard:v1:influencer`

## 実装メモ（ユニーク制約の実現）
- 非デフォルト（`is_default=0`）は無制限、デフォルト（`is_default=1`）は「ユーザー×コンテキストで1件」を満たすため、生成列＋ユニークキーで実装します。

```sql
-- 既存 (user_number, is_default) のユニークを置き換える
ALTER TABLE filter_presets
  DROP INDEX uq_default_per_scope,
  ADD COLUMN default_ctx varchar(255)
    GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN context_key ELSE NULL END) VIRTUAL,
  ADD UNIQUE KEY uq_default_per_context (user_number, default_ctx);
```

## 関連Function
- TBD（保存/取得API 実装予定）

## 備考
- `preset_id` は論理削除後も再利用不可（グローバルに一意）。
- `updated_at` は必要に応じて `ON UPDATE CURRENT_TIMESTAMP` を付与しても良いです（他テーブルとの整合性次第）。
- `users.user_number` に一意制約を付けた上で外部キーを設定してください。