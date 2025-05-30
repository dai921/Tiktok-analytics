# video_promotes_product テーブル

## 概要
TikTok動画と商品の関連付けを管理する中間テーブルです。どの動画がどの商品を広告しているかを記録します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | INT | NO | - | 動画ID（外部キー: videos.id） |
| product_id | INT | NO | - | 商品ID（外部キー: products.id） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| idx_video_product | video_id, product_id | ユニーク | 動画と商品の組み合わせは一意 |
| idx_video_id | video_id | インデックス | 動画IDによる検索用 |
| idx_product_id | product_id | インデックス | 商品IDによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| video_id | videos.id | 多対一 | 各関連付けは一つの動画に属する |
| product_id | products.id | 多対一 | 各関連付けは一つの商品に関連する |

## 特徴

1. **多対多関係の実現**
   - 一つの動画が複数の商品に関連付けられる
   - 一つの商品が複数の動画に関連付けられる

## 変更点
1. **テーブルの新設**
   - 従来の`video_master`テーブルの`product`カラムを分離
   - 多対多関係を正規化して管理

## 備考
- 動画と商品の関連付けを多対多で管理するための中間テーブル
