# tiktok_account_features_tiktok_account_category テーブル

## 概要
TikTokアカウントとアカウントカテゴリの多対多関係を管理する中間テーブルです。一つのアカウントが複数のカテゴリを持つことを可能にします。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| tiktok_account_id | INT | NO | - | TikTokアカウントID（外部キー: tiktok_accounts.id） |
| tiktok_account_category_id | INT | NO | - | アカウントカテゴリID（外部キー: tiktok_account_categories.id） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| idx_tiktok_account_id_and_tiktok_account_category_id | tiktok_account_id, tiktok_account_category_id | ユニーク | アカウントとカテゴリの組み合わせは一意 |
| idx_tiktok_account_id | tiktok_account_id | インデックス | TikTokアカウントによる検索用 |
| idx_tiktok_account_category_id | tiktok_account_category_id | インデックス | アカウントカテゴリによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連カテゴリ | 説明 |
|-----------|-----------|-----------|------|
| tiktok_account_id | tiktok_accounts.id | 多対多の中間テーブル | 各関連付けは一つのTikTokアカウントに属する |
| tiktok_account_category_id | tiktok_account_categorys.id | 多対多の中間テーブル | 各関連付けは一つのアカウントカテゴリに関連する |

## 特徴

1. **多対多関係の実現**
   - 一つのTikTokアカウントが複数のアカウントカテゴリを持つことが可能
   - 一つのアカウントカテゴリは複数のTikTokアカウントに関連付けられる

2. **柔軟な分類**
   - アカウントを複数の観点から分類可能（例：「アーティスト」かつ「グルメ」）
   - 新しいアカウントカテゴリの追加が容易

## 変更点
0. 既存テーブルとの関係
   - 新`tiktok_account_categories`テーブルと合わさることで、旧`account_list`テーブルのうち`account_type`列に相当。

## マイグレーション計画
既存の`account_type`カラムからのマイグレーション手順：
1. `account_cateogries`テーブルに既存のアカウントカテゴリ値を挿入
2. 各TikTokアカウントに対して、既存の`account_type`値に基づいて関連付けを作成
3. 複数カテゴリを持つアカウントについては、追加の関連付けを手動で設定

## 備考
- このテーブルは既存のシステムには存在せず、リファクタリングの一環として新規に追加されるものです
- 既存の`account_list`のうち`account_type`列の値を分析して、初期データを作成する必要があります
- 検索APIでは、このテーブルを使用して複数のアカウントカテゴリによるフィルタリングが可能になります
- アカウントタイプの追加や変更は管理画面から行えるようにすることを推奨します
