# product_master テーブル

## 概要
商品のマスターデータを管理するテーブルです。TikTok動画に関連する商品情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| product_id | INT | NO | AUTO_INCREMENT | 商品の一意識別子（主キー） |
| product_name | VARCHAR(255) | NO | - | 商品名 |
| product_category | VARCHAR(255) | NO | - | 商品カテゴリー |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | product_id | 主キー | 商品の一意識別子 |
| product_name | product_name | ユニーク | 商品名は一意 |
| idx_product_category | product_category | インデックス | 商品カテゴリー検索用 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| product_keywords | product_id -> product_id | 一対多 | 一つの商品は複数のキーワードを持つことができる |
| product_alias | product_name -> product_name | 一対多 | 一つの商品は複数の別名を持つことができる |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| main | get_products | 1391~1403 | フィルタに使用する商品名を取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product-scoring | fetch_product_data_from_db | 35~42 | 商品判定に使うキーワードマッピングに使用 |
| product-scoring | get_product_category | 93~97 | 商品の動画ジャンルを取得する |
| sync_category_spreadsheet | sync_category_spreadsheet | 266 | 既存の商品リストを取得 |
| sync_category_spreadsheet | sync_category_spreadsheet | 277~281 | 新たな動画ジャンルリストを挿入 |
| summary_table_sync | update_product_daily_summary | 50~79 | 商品ごとのDaily（更新日）集計 |
| top100_videos_sync | update_product_top100_by_date | 85~89 | 商品ごとのDaily（更新日）TOP100動画集計 |
| video_master_sync | analyze_title | 57~64 | 商品、動画ジャンル、キーワードの一括取得 |
| video_master_sync | analyze_title | 108~112 | 商品名に対応する動画ジャンルに変更 |
| manual_summary_sync | process_product_summary | 155~184 | 商品ごとのDaily（更新日）集計 |
| manual_sync_master | analyze_title | 54~61 | 商品、動画ジャンル、キーワードの一括取得 |
| manual_sync_master | analyze_title | 105~109 | 商品名に対応する動画ジャンルに変更 |
| manual_top100_sync | process_product_top100 | 136~140 | 商品ごとのDaily（更新日）TOP100動画集計 |
| update_all_categories | analyze_title | 395~402 | 商品、動画ジャンル、キーワードの一括取得 |
| update_all_categories | analyze_title | 466~473 | 商品名に対応する動画ジャンルに変更 |

## 備考
- TikTok動画に関連する商品のマスターテーブルです
- 商品名は一意であり、重複は許可されません
- 商品カテゴリーによって商品をグループ化できます
