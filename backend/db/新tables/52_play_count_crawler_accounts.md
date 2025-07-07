# play_count_crawler_accounts

## 概要
スクレイピング時に使用するアカウント情報を管理するテーブル。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | BIGINT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| username | VARCHAR(255) | NO | | - | ログインに使用するユーザー名(email) |
| password | VARCHAR(255) | NO | | - | ログインに使用するパスワード |
| proxy | VARCHAR(255) | NULL | | - | プロキシのIP |
| is_alive | TINYINT | 1 | - | アカウントがTiktokにブロックされていないか |
| last_crawled_at | DATETIME | NO | CURRENT_TIMESTAMP | | 最終更新日時 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_is_alive | is_alive | INDEX | ブロックされていないアカウントを優先 |
| idx_last_crawled_at | last_crawled_at | INDEX | 更新日時が古いアカウントを優先 |

## 関連Function

### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| repositories | update_play_count_crawler_account_last_crawled | 54~58 | 最終クロール時間をDBに更新する |
| repositories | get_play_count_crawler_account | 95~101 | 指定されたIDのクローラーアカウントを取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_crawler_accounts | process_crawler_accounts | 128~132 | スプレッドシートのアカウントデータをDBに同期する |

