# asin_estimate_data

## 概要
Amazon商品の販売データを管理するテーブル。ASINごとの日次売上推定値、価格、クロール日時を記録する。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| asin | VARCHAR(10) | NO | | INDEX | Amazon商品識別子 |
| sales_estimate | INT | YES | NULL | - | 推定販売数 |
| price | INT | YES | NULL | - | 商品価格（円） |
| sales_date | DATE | NO | | INDEX | 販売日 |
| crawled_at | DATETIME | NO | CURRENT_TIMESTAMP | | データ取得日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_asin | asin | INDEX | ASIN別データ検索の最適化 |
| idx_sales_date | sales_date | INDEX | 日付範囲検索の最適化 |

## 備考
- `sales_estimate`と`price`は取得できない場合にNULLを許可
- `asin`は標準的な10文字のAmazon商品コード
- `sales_date`と`crawled_at`を分けることで、過去データの遡及登録にも対応