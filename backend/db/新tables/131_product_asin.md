product_asin テーブル

## 概要
収集商品のasinを管理するテーブル

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| amazon_product_name | VARCHAR(50) | YES | NULL | 商品名 |
| product_name | VARCHAR(50) | NO | - | ツール上での商品名 |
| asin | DATE | YES | NULL | ASIN |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| idx_amazon_product_name | amazon_product_name | インデックス | 商品名検索の高速化 |
| idx_product_name | product_name | インデックス | 商品名検索の高速化 |
| idx_asin | asin | インデックス | asin検索の高速化 |


