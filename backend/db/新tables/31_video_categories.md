# video_categories

## 概要
動画カテゴリーのマスターテーブル。TikTok動画を分類するためのカテゴリー情報を管理する。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| name | VARCHAR(255) | NO | | UNIQUE | カテゴリー名 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_name | name | UNIQUE | カテゴリー名の一意性を保証 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| id | video_features_video_category.video_category_id | 一対多 | 各カテゴリーは複数の動画に関連付けられる |
| id | video_category_relates_keyword.video_category_id | 一対多 | 各カテゴリーは複数のキーワードに関連付けられる |


## 特徴

1. **柔軟なカテゴリー管理**
   - カテゴリーの追加・変更・無効化が容易

## 変更点
1. **テーブル名やカラムの整理などの大きな変更**
   - 旧`category_master`テーブルから名称変更
   - カテゴリー構造をより明確に表現

## 備考
- カテゴリー名の変更は、関連する動画の分類に影響しない
