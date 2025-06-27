product_daily_top100_videos テーブル

## 概要
Tiktok動画の商品ごとの再生数増加ランキングTOP100動画を日次で管理するテーブルです。これにより、ウィンドウ関数を作成する必要がなく、処理を高速化できます。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(100) | NO | - | 動画id |
| fetch_date | DATE | NO | - | 更新日 |
| product | VARCHAR(50) | NO | - | 商品名 |
| product_category | VARCHAR(50) | NO | - | 商品のジャンル名|
| plays_increase | INT unsigned | NO | 0 | 再生増加数 |
| likes_increase | INT unsigned | NO | 0 | いいね増加数 |
| post_time | DATE | NO | - | 投稿日 |
| thumbnail_url | VARCHAR(100) | NO | - | サムネイルURL |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id,fetch_date | 主キー | 関連付けの一意識別子 |
| idx_day_prod_post | fetch_date, product,video_id | インデックス | 特定日・商品・動画での検索を高速化 |
| idx_plays_desc | fetch_date, product,plays_increase(DESC) | インデックス | 再生数順でのソート・検索を高速化 |

## 関連テーブル

作成予定

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product_stats | get_product_stats | 185~206 | 商品の集計期間のTOP10動画を取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| top100_videos_sync | update_product_top100_by_date | 99~102 | 更新する場合既存のデータを削除 |
| top100_videos_sync | process_product_summary | 106~128 | 商品のTOP100動画をテーブルに共有する |
| manual_top100_sync | process_product_top100 | 160~163 | 更新する場合既存のデータを削除 |
| manual_top100_sync | process_product_summary | 167~191 | 商品のTOP100動画をテーブルに共有する |

## 備考
- product-statsにて各商材の関連動画Top10の取得を高速化するためのテーブル
