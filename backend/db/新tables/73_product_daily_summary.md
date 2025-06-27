product_daily_summary テーブル

## 概要
Tiktok動画の再生増加数、投稿数、10万以上動画数を商品ごとに管理するテーブルです。各商品の指標を更新毎に保存します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| fetch_date | DATE | NO | - | 更新日 |
| product | VARCHAR(50) | NO | - | 商品名 |
| product_category | VARCHAR(50) | NO | - | 商品のジャンル名|
| plays_increase | INT unsigned | NO | 0 | 再生増加数 |
| over_100k | TINYINT | NO | 0 | 10万以上動画数 |
| post_count | INT | NO | 0 | 投稿数 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id,fetch_date | 主キー | 関連付けの一意識別子 |
| UNIQUE | fetch_date, product | ユニーク | 商品と更新日の組み合わせは一意 |

## 関連テーブル

作成予定

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product_stats | get_product_stats | 90~97 | 収集日の一覧を取得 |
| product_stats | get_product_stats | 145~101 | 商品トレンドのデータを取得 |
| product_stats | get_product_trends | 279~285 | 収集日の一覧を取得 |
| product_stats | get_product_trends | 337~347 | トップ10動画を取得 |
| product_stats | get_product_trends | 365~378 | 商品の日次（収集日）データ |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| summary_table_sync| update_product_daily_summary | 50~79 | 商品の日次データをテーブルに共有する |
| manual_summary_sync| process_product_summary | 155~184 | 商品の日次データをテーブルに共有する |

## 備考
- product-stats、product-trendsエンドポイントの処理を高速化するためのサブテーブル
