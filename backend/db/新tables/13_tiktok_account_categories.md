# tiktok_account_categories テーブル

## 概要
TikTokアカウントのカテゴリを管理するマスターテーブルです。アカウントの分類や検索に使用されます。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | タイプの一意識別子（主キー） |
| name | VARCHAR(50) | NO | - | アカウントカテゴリ名（ユニーク） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | カテゴリの一意識別子 |
| idx_name | name | ユニーク | カテゴリ名は一意 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| id | tiktok_account_features_tiktok_account_category.tiktok_account_category_id | 多対多の中間テーブル | 一つのアカウントカテゴリは複数のアカウントに関連付けられる |

## 初期データ例

| id | name |
|----|------|
| 1 | アーティスト |
| 2 | アニメ・ショートドラマ |
| 3 | アフィリエイト |
| 4 | エンタメ・おもしろ |
| 5 | グルメ |

## 変更点
0. 既存テーブルとの関係
   - 新`tiktok_account_features_tiktok_account_category`テーブルと合わさることで、旧`account_list`テーブルのうち`account_type`列に相当。

## マイグレーション計画
既存の`account_type`カラムからのマイグレーション手順：
1. `account_cateogries`テーブルに既存のアカウントカテゴリ値を挿入
2. 各TikTokアカウントに対して、既存の`account_type`値に基づいて関連付けを作成
3. 複数カテゴリを持つアカウントについては、追加の関連付けを手動で設定

## 備考
- このテーブルは既存のシステムには存在せず、リファクタリングの一環として新規に追加されるものです
- 既存の`account_list`のうち`account_type`列の値を分析して、初期データを作成する必要があります