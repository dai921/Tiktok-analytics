# influencer_pr_product

## 概要
インフルエンサー系動画のPR動画商品の一覧を管理するデータ、

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| product_id | INT | NO | AUTO_INCREMENT | 商品の一意識別子（主キー） |
| product_brand | VARCHAR(255) | NO | - | 商品ブランド |
| product_name | VARCHAR(255) | NO | - | 商品名 |
| product_category | VARCHAR(255) | NO | - | 商品カテゴリー |
| is_pr | TINYINT | NO | 0 | PR商品なのかの判定 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | product_id | 主キー | 商品の一意識別子 |
| product_burand | インデックス |  | 商品ブランド検索用 |
| product_name | product_name | ユニーク | 商品名は一意 |
| idx_product_category | product_category | インデックス | 商品カテゴリー検索用 |
| idx_is_pr | is_pr | インデックス | 最新追加商材の判定検索用 |


## 備考
- TikTok動画のインフルエンサー系に関連する商品のマスターテーブルです
- 商品名は一意であり、重複は許可されません
- 商品カテゴリーによって商品をグループ化できます
