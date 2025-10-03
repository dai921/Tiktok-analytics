users_tiktok_accounts テーブル

## 概要
my-reportページで公式API連携を行ったTikTokアカウントの連携情報を保持します。アクセストークン、リフレッシュトークン、有効期限、表示名などをユーザー単位で管理します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| user_number | INT | NO | - | ユーザー番号（`users.user_number` 参照） |
| open_id | VARCHAR(255) | NO | - | TikTokのOpenID（アカウント一意識別子） |
| access_token | VARCHAR(255) | NO | - | アクセストークン（API呼び出し用） |
| refresh_token | VARCHAR(255) | NO | - | リフレッシュトークン（トークン再発行用） |
| expires_at | DATETIME | NO | - | `access_token` の有効期限（UTC） |
| display_name | VARCHAR(255) | YES | NULL | TikTok上の表示名（取得できない場合はNULL） |
| linked_at | DATETIME | YES | CURRENT_TIMESTAMP | 連携日時（初回紐付け時、自動設定） |
| account_type | VARCHAR(255) | YES | NULL | アカウント種別（任意、将来的にENUM化を検討） |
| mainly_video_type | VARCHAR(255) | YES | NULL | 主に扱う動画タイプ（任意の分類タグ） |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | user_number, open_id | 主キー | ユーザー×OpenIDの複合主キー |
| ix_open_id | open_id | INDEX | OpenIDによる検索最適化 |

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| fk_ta_user | users.user_number | CASCADE | ユーザー削除時に関連するTikTok連携情報も削除 |

## 関連テーブル

- users（`users.user_number`）

## 関連Function

- TBD（連携／トークン更新API 実装予定）

## 備考
- セキュリティ: `access_token` / `refresh_token` は機微情報。アプリ層での暗号化保存、ログ出力の抑制、最小権限アクセスの徹底を推奨します。
- トークン運用: `expires_at` の数分前に自動更新を試行し、失敗時は再認証を促すフローを想定。
- 制約面: 現行DDLでは `open_id` 単独のユニーク制約はありません（インデックスのみ）。システム全体で一意性が必要な場合は `UNIQUE KEY uq_open_id (open_id)` の追加を検討してください。
- タイムゾーン: 日時は原則UTCで保存し、表示時にローカライズします。
