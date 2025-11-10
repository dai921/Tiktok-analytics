# account_list テーブル

## 概要
TikTokアカウントのリストを管理するテーブルです。クローリング対象のアカウント情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | アカウントの一意識別子（主キー） |
| account_url | VARCHAR(255) | YES | NULL | アカウントのURL |
| favorite_user_username | VARCHAR(255) | YES | NULL | ユーザー名 |
| is_new_account | TINYINT | YES | NULL | 新規アカウントフラグ |
| last_crawled_at | DATETIME | YES | NULL | 最終クロール日時 |
| account_type | VARCHAR(255) | YES | NULL | アカウントタイプ |
| favorite_user_is_alive | TINYINT | NO | 1 | アカウント有効フラグ |
| delete_flag | TINYINT | NO | 1 | ダッシュボードのアカウントを削除するためのフラグ |
| crawler_account_id | INT | YES | NULL | クローラーアカウントID（外部キー） |
| video_crawler_id | INT | YES | NULL | 動画クローラーID |
| crawl_priority | INT | NO | 10 | クロール優先度 |
| parent_account_type | VARCHAR(255) | YES | NULL | 親タイプ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |
| play_count_crawler_id | NT | YES | NULL | play_countのクローラーアカウントID（外部キー） |
| all_video_flag | TINYINT | YES | NULL | 全ビデオ取得の必要性チェック |

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

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| watchlist | get_account_bookmarks_with_details | 675~691 | アカウントウォッチリストに追加したデータの静的データを同期する |

### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| creare_tables | - | 23~50 | テーブルの作成クエリ |
| repositories | get_favorite_users | 124~139 | クロール対象のアカウントを取得する |
| repositories | get_favorite_users_by_play_count_crawler_id | 161~176 | 再生数のクロール対象のアカウントを取得する |
| repositories | save_favorite_user_nickname | 198~203 | アカウントリストにニックネームを保存する |
| repositories | update_favorite_user_last_crawled | 208~212 | 最終クロール時間をDBに更新する |
| repositories | update_favorite_user_is_alive | 222~226 | アカウントが削除されていたらフラグ付けする |
| repositories | update_favorite_user_is_new_account | 236~240 | 新規追加アカウントをクロールし終わったらフラグを削除する |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_account_list | process_account_list | 197~211 | スプレッドシートのアカウントデータをDBに同期する |
| video_master_sync | sync_video_data | 377~382 | アカウントタイプの取得 |


## 備考
- TikTokアカウントのクローリング対象を管理するテーブルです
- クロール優先度によって処理順序が決まります
- 最終クロール日時を基に定期的なデータ収集が行われます
