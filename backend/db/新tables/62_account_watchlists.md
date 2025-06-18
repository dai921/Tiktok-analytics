# account_watchlists.md

## 概要
アカウントウォッチリストの管理ページ。ユーザーがウォッチリストに追加したアカウントとユーザーの組み合わせを管理する

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| email | VARCHAR(255) | NO | | - | 登録ユーザーのメールアドレス |
| account_name | VARCHAR(100) | NO | - | アカウント名 |
| account_watchlist_name | VARCHAR(100) | NO | - | ウォッチリストの名称 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| unique_user_account | email,account_name | UNIQUE | 各ユーザーごとにウォッチしているアカウントは一意 |
| idx_email | email | インデックス | emailによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| account_name | account_lists.account_name | 多対1の中間テーブル | 各動アカウント複数のユーザーにウォッチリストに追加される可能性がある |
| email | users.email | 多対1の中間テーブル | 1ユーザーに対して複数のアカウントがウォッチリストに追加される可能性がある |

## 特徴

1. **ウォッチリストに登録した動画の一元管理**
   - ユーザー情報、ウォッチリスト名、アカウント情報を管理

2. **柔軟な動画情報の管理**
   - アカウントの追加・変更が容易