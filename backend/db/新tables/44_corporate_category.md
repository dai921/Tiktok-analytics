# corporate_category

## 概要
TikTok動画の企業アカウントの中ジャンルとaccount_typeを紐づける多対一のテーブル。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| third_account_type | VARCHAR(50) | NO | | INDEX | 中ジャンル |
| account_type | VARCHAR(50) | NO | | INDEX | アカウントタイプ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_third_account_type | third_account_type | INDEX | キーワード検索を高速化 |
| idx_account_type| account_type | INDEX | アカウントタイプ検索を高速化 |
