# video_heavy_raw_data テーブル

## 概要
動画の詳細な生データを管理するテーブルです。クローリングで取得した動画の包括的な情報を保存します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | レコードの一意識別子（主キー） |
| video_url | TEXT | NO | | - | 動画のURL |
| video_id | VARCHAR(255) | NO | | UNIQUE | 動画の一意識別子 |
| user_username | VARCHAR(255) | NO | | INDEX | 投稿者のユーザー名 |
| user_nickname | VARCHAR(255) | NO | | - | 投稿者のニックネーム |
| video_thumbnail_url | TEXT | NO | | - | 動画のサムネイルURL |
| video_title | TEXT | NO | | - | 動画のタイトル |
| post_time_text | VARCHAR(255) | YES | NULL | - | 投稿日時のテキスト形式 |
| post_time | DATETIME | YES | NULL | INDEX | 投稿日時（日時型） |
| audio_url | TEXT | YES | NULL | - | 音声のURL |
| audio_info_text | VARCHAR(255) | YES | NULL | - | 音声情報のテキスト |
| audio_id | VARCHAR(255) | YES | NULL | - | 音声のID |
| audio_title | VARCHAR(255) | YES | NULL | - | 音声のタイトル |
| audio_author_name | VARCHAR(255) | YES | NULL | - | 音声の作者名 |
| play_count_text | VARCHAR(255) | YES | NULL | - | 再生数のテキスト形式 |
| play_count | INT | YES | NULL | - | 再生数（数値） |
| like_count_text | VARCHAR(255) | YES | NULL | - | いいね数のテキスト形式 |
| like_count | INT | YES | NULL | - | いいね数（数値） |
| comment_count_text | VARCHAR(255) | YES | NULL | - | コメント数のテキスト形式 |
| comment_count | INT | YES | NULL | - | コメント数（数値） |
| collect_count_text | VARCHAR(255) | YES | NULL | - | 保存数のテキスト形式 |
| collect_count | INT | YES | NULL | - | 保存数（数値） |
| share_count_text | VARCHAR(255) | YES | NULL | - | シェア数のテキスト形式 |
| share_count | INT | YES | NULL | - | シェア数（数値） |
| crawled_at | DATETIME | NO | | INDEX | クロール実行日時 |
| crawling_algorithm | VARCHAR(50) | NO | | INDEX | 使用したクローリングアルゴリズム |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | - | レコード作成日時 |
| needs_update | TINYINT | NO | 1 | INDEX | 更新が必要かどうかのフラグ |
| manual_update | TINYINT | YES | 0 | - | 手動更新フラグ |
| video_title_light | TEXT | YES | NULL | - | 軽量版の動画タイトル |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| uq_video_id | video_id | UNIQUE | 動画IDの一意性 |
| idx_user_username | user_username | INDEX | ユーザー名検索用 |
| idx_post_time | post_time | INDEX | 投稿日時検索用 |
| idx_crawled_at | crawled_at | INDEX | クロール日時検索用 |
| idx_algorithm | crawling_algorithm | INDEX | アルゴリズム検索用 |
| idx_needs_update | needs_update | INDEX | 更新フラグ検索用 |

## 関連Function
### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| creare_tables | - | 54~88 | テーブルの作成クエリ |
| repositories | save_video_heavy_data | 251~283 | 軽いデータを保存 |
| repositories | get_existing_heavy_data_video_ids | 342| 過去取得した動画データを取得 |
| seed_data | insert_sample_video_data | 168~208 | サンプルデータを挿入 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| manual_sync_master | get_video_data_batch | 344~348 | 更新対象の動画をフラグ付け |
| manual_sync_master | get_video_data_batch | 376~381 | 更新対象の残りの動画数をチェック |
| manual_sync_master | get_video_data_batch | 386~405 | バッチデータの取得 |

## 備考
- 動画の詳細情報を包括的に保存するためのテーブルです
- 音声情報、投稿者情報、各種カウント情報を詳細に記録します
- テキスト形式と数値形式の両方でカウント情報を保持します
- 手動更新フラグにより、手動でのデータ更新を管理できます
- 投稿日時のインデックスにより、時系列での検索が効率的です
- 動画IDは一意である必要があります
- 軽量版のタイトルフィールドにより、検索パフォーマンスを最適化できます
