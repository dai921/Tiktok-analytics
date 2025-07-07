# play_count_history テーブル

## 概要
TikTok動画の再生数履歴データを管理するテーブルです。日付ごとの再生数、いいね数、コメント数などの増加データを格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | BIGINT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| video_id | VARCHAR(50) | NO | - | TikTokの動画ID |
| video_url | VARCHAR(255) | NO | - | 動画のURL |
| collection_date | DATE | NO | - | データ収集日 |
| play_count_increase | INT UNSIGNED | YES | NULL | 再生数増加 |
| likes_count_increase | INT UNSIGNED | YES | NULL | いいね数増加 |
| comment_count_increase | INT UNSIGNED | YES | NULL | コメント数増加 |
| save_count_increase | INT UNSIGNED | YES | NULL | 保存数増加 |
| likes_count | INT UNSIGNED | YES | NULL | いいね数 |
| play_count | INT UNSIGNED | YES | NULL | 再生数 |
| comment_count | INT UNSIGNED | YES | NULL | コメント数 |
| save_count | INT UNSIGNED | YES | NULL | 保存数 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | 作成日時 |
| post_time | DATE | YES | NULL | 投稿日 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id, collection_date | 主キー | レコードの一意識別子と収集日の組み合わせ |
| idx_video_date | video_id, collection_date | インデックス | 動画IDと収集日による検索用 |
| idx_post_time | post_time | インデックス | 投稿日検索用 |
| idx_pch_collection_post | collection_date, post_time, video_id | インデックス | 収集日、投稿日、動画IDによる検索用 |
| unique_video_date | video_id, collection_date | ユニーク | 動画IDと収集日の組み合わせは一意 |

## パーティション
RANGE パーティション（TO_DAYS(collection_date)による）
- p_current: TO_DAYS('2025-05-01')未満
- p_future: MAXVALUE未満


## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやvideo_urlを通じて他のテーブルと関連付けられます。

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| main | get_video_play_count_history | 1034~1043 | 保存している収集日を取得 |
| watchlist | get_video_watchlist_with_details | 207~213 | 保存している収集日を取得  |
| watchlist | get_video_watchlist_with_details | 234~248 | ウォッチリストの動画の集計データを取得 |
| watchlist | get_video_watchlist_trends | 363~369 | 保存している収集日を取得  |
| watchlist | get_video_watchlist_trends | 411~431 | ウォッチリストの日別データを取得  |
| watchlist | get_account_bookmarks_with_details | 648~654 | 保存している収集日を取得 |
| watchlist | get_account_bookmarks_with_details | 675~691 | アカウントのエンゲージメントデータを取得 |
| watchlist | get_account_trends | 763~770 | 保存している収集日を取得 |
| watchlist | get_account_trends | 811~831 | 各アカウントのトレンドデータを取得 |
| watchlist | get_account_videos | 913~928 | 各アカウントの動画を取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| summary_table_sync | update_product_daily_summary | 50~79 | 商品ごとの集計を行うクエリ |
| summary_table_sync | update_genre_daily_summary | 127~159 | 動画ジャンルごとの集計を行うクエリ |
| video_history_sync | sync_video_history | 51~83 | 動画のエンゲージメントデータ（更新日）の集計 |
| video_history_sync | sync_video_history | 91~146 | エンゲージメントの10日間増加数（更新日）の集計 |
| manual_summary_sync | process_data_range | 86~91 | 保存している収集日を取得 |
| manual_summary_sync | process_all_dates | 109~114 | 保存している収集日を取得 |
| manual_summary_sync | process_product_summary | 155~184 | 動画ジャンルごとの集計を行うクエリ |
| manual_summary_sync | process_genre_summary | 193~225 | 動画ジャンルごとの集計を行うクエリ |
| manual_top100_sync | process_top100_data | 82~87 | 保存している収集日を取得 |
| manual_top100_sync | process_product_top100 | 167~191 | 商品ごとのTOP100(更新日)集計を行うクエリ |
| manual_top100_sync | process_genre_top100 | 262~291 | 動画ジャンルごとのTOP100(更新日)集計を行うクエリ |

## 備考
- 動画の再生数などの増加データを日付ごとに格納するテーブルです
- パーティショニングによりデータアクセスが最適化されています
- 時系列分析やトレンド分析に使用されるデータを提供します
