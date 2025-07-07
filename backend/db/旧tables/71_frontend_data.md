# frontend_data テーブル

## 概要
非正規テーブルです。
フロントエンド表示用のTikTok動画データを、ダッシュボードやUI表示に最適化された形式で格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| url | VARCHAR(255) | NO | - | 動画のURL |
| video_id | VARCHAR(50) | YES | NULL | TikTokの動画ID |
| thumbnail_url | VARCHAR(255) | YES | NULL | サムネイル画像URL |
| created_at | DATE | YES | NULL | 投稿日 |
| play_count | INT UNSIGNED | YES | NULL | 再生数 |
| play_count_increase | INT UNSIGNED | YES | NULL | 再生数増加 |
| ten_days_increase | INT | YES | NULL | 10日間の再生数増加 |
| account_name | VARCHAR(50) | YES | NULL | アカウント名 |
| display_name | VARCHAR(255) | YES | NULL | 表示名 |
| content_type | VARCHAR(50) | YES | NULL | コンテンツタイプ |
| likes_count | INT UNSIGNED | YES | NULL | いいね数 |
| comment_count | INT UNSIGNED | YES | NULL | コメント数 |
| likes_count_increase | INT | YES | NULL | いいね数増加 |
| ten_days_likes_increase | INT | YES | NULL | 10日間のいいね数増加 |
| comment_count_increase | INT | YES | NULL | コメント数増加 |
| ten_days_comment_increase | INT | YES | NULL | 10日間のコメント数増加 |
| save_count | INT UNSIGNED | YES | NULL | 保存数 |
| save_count_increase | INT | YES | NULL | 保存数増加 |
| ten_days_save_increase | INT | YES | NULL | 10日間の保存数増加 |
| account_type | VARCHAR(50) | YES | NULL | アカウントタイプ |
| hashtags | TEXT | YES | NULL | ハッシュタグ |
| music_info | TEXT | YES | NULL | 音楽情報 |
| caption | TEXT | YES | NULL | キャプション |
| category | VARCHAR(255) | YES | NULL | カテゴリ |
| product | VARCHAR(255) | YES | NULL | 関連商品 |
| is_pr | TINYINT | YES | 0 | PRフラグ |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| url | url | ユニーク | 動画URLは一意 |
| idx_play_count | play_count | インデックス | 再生数検索用 |
| idx_play_count_increase | play_count_increase | インデックス | 再生数増加検索用 |
| idx_ten_days_increase | ten_days_increase | インデックス | 10日間再生数増加検索用 |
| idx_account_name | account_name | インデックス | アカウント名検索用 |
| idx_content_type | content_type | インデックス | コンテンツタイプ検索用 |
| idx_likes_count | likes_count | インデックス | いいね数検索用 |
| idx_comment_count | comment_count | インデックス | コメント数検索用 |
| idx_likes_count_increase | likes_count_increase | インデックス | いいね数増加検索用 |
| idx_ten_days_likes_increase | ten_days_likes_increase | インデックス | 10日間いいね数増加検索用 |
| idx_comment_count_increase | comment_count_increase | インデックス | コメント数増加検索用 |
| idx_ten_days_comment_increase | ten_days_comment_increase | インデックス | 10日間コメント数増加検索用 |
| idx_account_type | account_type | インデックス | アカウントタイプ検索用 |
| idx_category | category | インデックス | カテゴリ検索用 |
| idx_product | product | インデックス | 商品検索用 |
| idx_created_at | created_at | インデックス | 投稿日検索用 |
| idx_is_pr | is_pr | インデックス | prフラグ検索用 |

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやurlを通じて他のテーブルと関連付けられます。

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| genre_stats| get_genre_stats | 133~153 | 各ジャンルのTOP10動画を取得 |
| main | get_videos | 157~166 | ダッシュボードのデータを取得する基本クエリ |
| main | get_filter_options | 691 | ダッシュボードの動画のカテゴリ一覧を取得 |
| main | get_filter_options | 710 | ダッシュボードの動画のアカウント一覧を取得 |
| main | get_filter_options | 717 | ダッシュボードの動画のハッシュタグ一覧を取得 |
| main | get_filter_options | 759 | ダッシュボードの動画のBGM一覧を取得 |
| main | get_account_types | 1214~1216 | ダッシュボードのアカウントタイプ一覧を取得 |
| product_stats | get_product_stats | 185~206 | 商品別上位10動画を取得 |
| watchlist | get_video_watchlist_with_details | 234~248 | 各動画のデータを取得 |
| watchlist | get_video_watchlist_trends | 411~431 | 各動画のトレンドデータを取得 |
| watchlist | get_account_bookmarks_with_details | 676~691 | 各アカウントの集計データを取得 |
| watchlist | get_account_trends | 811~831 | 各アカウントのトレンドデータを取得 |
| watchlist | get_account_videos | 913~928 | 各アカウントの動画を取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product-scoring\manual-task | get_target_videos_batch | 347~362 | 更新対象の動画一覧を取得（バッチ処理） |
| product-scoring\manual-task | get_remaining_count | 379~388 | 残りの更新対象の動画数を取得 |
| product-scoring\manual-task | process_single_video | 379~388 |動画の文字起こし情報などを取得 |
| frontend_data_update | update_frontend_from_master | 110~155 | video_masterからダッシュボードに移したいデータを取得 |
| frontend_data_update | update_frontend_from_master | 172~184 | 同期すべき残りのデータ数を取得 |
| frontend_data_update | update_frontend_from_master | 252~264 | frontend_dataへ更新するクエリ |
| summary_table_sync | update_product_daily_summary | 50~79 | 商品ごとの集計を行うクエリ |
| summary_table_sync | update_genre_daily_summary | 127~159 | 動画ジャンルごとの集計を行うクエリ |
| top100_videos_sync | update_product_top100_by_date | 106~128 | 商品ごとのTOP100(更新日)集計を行うクエリ |
| top100_videos_sync | update_genre_top100_by_date | 157~171 | 動画ジャンル一覧を取得 |
| top100_videos_sync | update_genre_top100_by_date | 188~215 | 動画ジャンルごとのTOP100(更新日)集計を行うクエリ |
| video_history_sync | sync_video_history | 51~83 | 動画のエンゲージメントデータ（更新日）の集計 |
| video_history_sync | sync_video_history | 91~146 | エンゲージメントの10日間増加数（更新日）の集計 |
| manual_summary_sync | process_product_summary | 155~184 | 商品ごとの集計を行うクエリ |
| manual_summary_sync | process_genre_summary | 193~225 | 動画ジャンルごとの集計を行うクエリ |
| manual_top100_sync | process_product_top100 | 167~191 | 商品ごとのTOP100(更新日)集計を行うクエリ |
| manual_top100_sync | process_genre_top100 | 227~241 | 動画ジャンル一覧を取得 |
| manual_top100_sync | process_genre_top100 | 262~291 | 動画ジャンルごとのTOP100(更新日)集計を行うクエリ |


## 備考
- フロントエンド表示に最適化されたデータを格納するテーブルです
- ダッシュボードやUIコンポーネントで直接使用されるデータ形式です
- video_masterテーブルのデータを整形・加工して格納されます
