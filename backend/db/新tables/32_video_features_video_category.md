# video_features_video_category テーブル

## 概要
TikTok動画とカテゴリの関連付けを管理する中間テーブルです。どの動画がどのカテゴリに属しているかを記録します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | INT | NO | - | 動画ID（外部キー: videos.id） |
| video_category_id | INT | NO | - | カテゴリID（外部キー: video_categories.id） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| idx_video_id_and_video_category_id | video_id, video_category_id | ユニーク | 動画とカテゴリの組み合わせは一意 |
| idx_video_id | video_id | インデックス | 動画IDによる検索用 |
| idx_video_category_id | video_category_id | インデックス | カテゴリIDによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| video_id | videos.id | 多対一 | 各関連付けは一つの動画に属する |
| video_category_id | video_categories.id | 多対一 | 各関連付けは一つのカテゴリに関連する |

## 特徴

1. **多対多関係の実現**
   - 一つの動画が複数のカテゴリに関連付けられる
   - 一つのカテゴリが複数の動画に関連付けられる

## 変更点
1. **テーブルの新設**
   - 従来の`video_master`テーブルの`category`カラムを分離
   - 多対多関係を正規化して管理

## 備考
- 動画とカテゴリの関連付けを多対多で管理するための中間テーブル
- カテゴリ分析やレポート生成時に、関連動画の統計を集計するために使用
