users_account_daily_metrics テーブル

## 概要
TikTokアカウントの日次指標（フォロワー数、いいね数、動画数、総再生数）を保存します。`users_tiktok_accounts` と紐づき、時系列分析やダッシュボード表示に利用します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 一意のID（主キー） |
| user_number | INT | NO | - | ユーザー番号（`users.user_number` 参照） |
| open_id | VARCHAR(255) | NO | - | TikTokのOpenID（`users_tiktok_accounts.open_id`） |
| collection_date | DATE | NO | - | 収集日（UTCの基準日） |
| followers | INT unsigned | YES | NULL | フォロワー数（欠損時はNULL） |
| likes | INT unsigned | YES | NULL | いいね数（欠損時はNULL） |
| videos_count | INT unsigned | YES | NULL | 投稿動画数（欠損時はNULL） |
| total_play_count | BIGINT unsigned | YES | NULL | 総再生数（欠損時はNULL） |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | サロゲートキー |
| fk_adm_account | user_number, open_id | INDEX | アカウント特定のための複合インデックス |
| uq_open_id_date | open_id, collection_date | UNIQUE | アカウント×日付の一意性を保証 |

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| fk_adm_account | users_tiktok_accounts.user_number, users_tiktok_accounts.open_id | CASCADE | 連携アカウント削除時に関連日次指標も削除 |

## 関連テーブル

- users_tiktok_accounts（`user_number`, `open_id`）

## 関連Function

- TBD（定期収集・再集計API 実装予定）

## 備考
- 一意性: `(open_id, collection_date)` にユニーク制約（`uq_open_id_date`）を設定済み。1日1行を保証します。追加前に既存重複がある場合は解消が必要です。
- 欠損値: 収集できなかった指標は `NULL`。差分・集計時は `COALESCE` での補完を想定。
- タイムゾーン: `collection_date` は `DATE`。収集基準はUTCに統一し、表示時にローカライズします。
- パフォーマンス: 期間指定の時系列取得は `open_id, collection_date` の複合インデックス（`uq_open_id_date`）を活用。ユーザー単位の集計が多い場合は `user_number, collection_date` の複合インデックス追加を検討してください。
- データ保全: 参照元 `users_tiktok_accounts` の削除に伴い、本テーブルの関連行は `CASCADE` で削除されます。