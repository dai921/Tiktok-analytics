# product_alias テーブル

## 概要
商品の別名を管理するテーブルです。TikTok動画内で使用される商品の別名や略称を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| alias_id | INT | NO | AUTO_INCREMENT | 別名の一意識別子（主キー） |
| alias_name | VARCHAR(255) | NO | - | 別名 |
| alias_priority | TINYINT | YES | NULL | 別名の優先度 |
| product_name | VARCHAR(255) | NO | - | 関連する商品名 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | alias_id | 主キー | 別名の一意識別子 |
| alias_name_uq | alias_name | ユニーク | 別名は一意 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| product_master | product_name -> product_name | 多対一 | 各別名は一つの商品に属する |
| product_alias_keywords | alias_id -> alias_id | 一対多 | 一つの別名は複数のキーワードを持つことができる |

## 備考
- TikTok動画内で使用される商品の別名を管理するテーブルです
- 同じ別名は一度だけ登録可能です（重複不可）
- alias_priorityで別名の優先順位を設定できます
