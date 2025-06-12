# tiktok_accounts テーブル

## 概要
TikTokアカウントの基本情報とクローリング設定を管理するテーブルです。アナリティクスツールの分析対象となるアカウント情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | アカウントの一意識別子（主キー） |
| account_url | VARCHAR(255) | NO | - | アカウントのURL（ユニーク） |
| username | VARCHAR(255) | NO | - | TikTokユーザー名 |
| display_name | VARCHAR(255) | YES | NULL | 表示名 |
| is_alive | TINYINT(1) | NO | 1 | アカウント有効フラグ |
| last_crawled_at | DATETIME | YES | NULL | 最終クロール日時 |
| crawl_priority | INT | NO | 10 | クロール優先度（低い数字＝高優先度） |
| crawler_account_id | INT | YES | NULL | クローラーアカウントID（外部キー） |
| last_video_count | INT | YES | 0 | 最終クロール時の動画数 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | アカウントの一意識別子 |
| idx_account_url | account_url | ユニーク | アカウントURLは一意 |
| idx_username | username | インデックス | ユーザー名検索用 |
| idx_is_alive | is_alive | インデックス | 有効アカウント検索用 |
| idx_crawler_account | crawler_account_id | インデックス | クローラーアカウント検索用 |
| idx_priority_last_crawled | crawl_priority, last_crawled_at | インデックス | 優先度と最終クロール日時による検索用 |
## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| id | service_user_tracks_tiktok_account.tiktok_account_id | 多対多の中間テーブル | 各アカウントは複数のサービスユーザーに追跡される |
| id | tiktok_account_features_tiktok_account_category.tiktok_account_id | 多対多の中間テーブル | 各アカウントは複数のアカウントカテゴリを持つ |
| id | tiktok_videos.tiktok_account_id | 一対多 | 各アカウントは複数の動画を持つ |
| crawler_account_id | crawler_accounts.id | 多対一 | 各アカウントは一つのクローラーアカウントに関連付けられる |

## 変更点
0. 既存テーブルとの関係
   - 旧`account_list`テーブルを移行したもの。`account_type`列は別テーブルに分割。
1. 列名の整理と統一
   - `favorite_user_username` → `username`
   - `favorite_user_is_alive` → `is_alive`
2. 不要な列の削除
   - `video_crawler_id`
   - `parent_type`
3. 新規列の追加
   - `display_name` - ユーザー名とは別の表示名
   - `needs_update` - 更新が必要かどうかのフラグ（既存コードで使用されていた） !TODO この列は既存コードで定義されていないけど利用はされているという謎の状態。リファクタリングの際、この列が必要なのか関連コードが不要なのか要確認。
   - `last_video_count` - 最終クロール時の動画数 !TODO この列は既存コードで定義されていないけど利用はされているという謎の状態。リファクタリングの際、この列が必要なのか関連コードが不要なのか要確認。

## 備考
- TikTokアカウントのクローリング対象を管理するテーブルです
- クロール優先度によって処理順序が決まります
- 最終クロール日時を基に定期的なデータ収集が行われます
- 既存の`account_list`テーブルからのマイグレーション時に、データの整合性を確保する必要があります
