# video_light_raw_data テーブル

## 概要
動画の軽量な生データを管理するテーブルです。クローリングで取得した動画の基本情報を保存します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | レコードの一意識別子（主キー） |
| video_url | TEXT | NO | | - | 動画のURL |
| video_id | VARCHAR(255) | NO | | UNIQUE | 動画の一意識別子 |
| user_username | VARCHAR(255) | NO | | INDEX | 投稿者のユーザー名 |
| video_thumbnail_url | TEXT | YES | NULL | - | 動画のサムネイルURL |
| video_alt_info_text | TEXT | YES | NULL | - | 動画の代替情報テキスト |
| play_count_text | VARCHAR(255) | YES | NULL | - | 再生数のテキスト形式 |
| play_count | INT | YES | NULL | - | 再生数（数値） |
| like_count_text | VARCHAR(255) | YES | NULL | - | いいね数のテキスト形式 |
| like_count | INT | YES | NULL | - | いいね数（数値） |
| crawled_at | DATETIME | NO | | INDEX | クロール実行日時 |
| crawling_algorithm | VARCHAR(50) | NO | | INDEX | 使用したクローリングアルゴリズム |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | - | レコード作成日時 |
| needs_update | TINYINT | NO | 1 | INDEX | 更新が必要かどうかのフラグ |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| uq_video_id | video_id | UNIQUE | 動画IDの一意性 |
| idx_user_username | user_username | INDEX | ユーザー名検索用 |
| idx_crawled_at | crawled_at | INDEX | クロール日時検索用 |
| idx_algorithm | crawling_algorithm | INDEX | アルゴリズム検索用 |
| idx_needs_update | needs_update | INDEX | 更新フラグ検索用 |

## 関連Function
### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| creare_tables | - | 90~109 | テーブルの作成クエリ |
| repositories | save_video_light_data | 295~313 | 軽いデータを保存 |
| repositories | update_crawler_account_last_crawled | 357~362| 更新対象の動画を抽出 |
| seed_data | insert_sample_video_data | 242~264 | サンプルデータを挿入 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| update_needs_flags | update_needs_flags | 45~51 | 更新対象の動画をフラグ付け |

## 備考
- 動画の基本情報を軽量に保存するためのテーブルです
- クローリングで取得した生データをそのまま保存します
- テキスト形式と数値形式の両方でカウント情報を保持します
- 更新フラグにより、再クロールが必要な動画を識別できます
- クローリングアルゴリズムを記録することで、データ取得方法を追跡できます
- 動画IDは一意である必要があります
