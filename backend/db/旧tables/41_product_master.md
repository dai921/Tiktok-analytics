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

## 備考
- TikTok動画に関連する商品のマスターテーブルです
- 商品名は一意であり、重複は許可されません
- 商品カテゴリーによって商品をグループ化できます
