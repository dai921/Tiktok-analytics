# account_list テーブル

## 概要
TikTokアカウントのリストを管理するテーブルです。クローリング対象のアカウント情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | アカウントの一意識別子（主キー） |
| account_url | VARCHAR(255) | YES | NULL | アカウントのURL |
| favorite_user_username | VARCHAR(255) | YES | NULL | ユーザー名 |
| is_new_account | TINYINT(1) | YES | NULL | 新規アカウントフラグ |
| last_crawled_at | DATETIME | YES | NULL | 最終クロール日時 |
| account_type | VARCHAR(255) | YES | NULL | アカウントタイプ |
| favorite_user_is_alive | TINYINT(1) | NO | 1 | アカウント有効フラグ |
| crawler_account_id | INT | YES | NULL | クローラーアカウントID（外部キー） |
| video_crawler_id | INT | YES | NULL | 動画クローラーID |
| crawl_priority | INT | NO | 10 | クロール優先度 |
| parent_type | VARCHAR(255) | YES | NULL | 親タイプ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | アカウントの一意識別子 |
| account_url | account_url | ユニーク | アカウントURLは一意 |
| idx_account_url | account_url | インデックス | アカウントURL検索用 |
| idx_is_new_account | is_new_account | インデックス | 新規アカウント検索用 |
| idx_username | favorite_user_username | インデックス | ユーザー名検索用 |
| idx_crawler_account | crawler_account_id | インデックス | クローラーアカウント検索用 |
| idx_is_alive | favorite_user_is_alive | インデックス | 有効アカウント検索用 |
| idx_priority_last_crawled | crawl_priority, last_crawled_at | インデックス | 優先度と最終クロール日時による検索用 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| crawler_accounts | crawler_account_id -> id | 多対一 | 各アカウントは一つのクローラーアカウントに関連付けられる |

## 備考
- TikTokアカウントのクローリング対象を管理するテーブルです
- クロール優先度によって処理順序が決まります
- 最終クロール日時を基に定期的なデータ収集が行われます
