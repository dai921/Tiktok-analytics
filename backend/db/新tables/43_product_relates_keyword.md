# product_relates_keyword

## 概要
TikTok動画の自動分類において関連すると判断する、商品とキーワードのペアを管理するテーブル。これらペアたちは関係としては多対一である。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| product_id | INT | NO | | INDEX | 商品ID (外部キー: products.id) |
| keyword | VARCHAR(255) | NO | | INDEX | キーワード |
| priority | TINYINT | YES | NULL | INDEX | 優先度 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_keyword | keyword | INDEX | キーワード検索を高速化 |
| idx_product_id | product_id | INDEX | 商品による検索を高速化 |
| idx_product_id_and_keyword | product_id, keyword | UNIQUE | 商品とキーワードの組み合わせの一意性を保証 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| product_id | products.id | 多対一 | 各商品とキーワードに関連する |

## 特徴

1. **キーワードベースの自動分類**
   - 動画の説明文やハッシュタグに含まれるキーワードを基に、動画を適切なカテゴリーに自動分類

2. **柔軟なキーワード管理**
   - キーワードの追加・変更・削除が容易
   - 新しいトレンドやテーマに応じてキーワードを更新可能

## 変更点
1. **テーブル名やカラムの整理などの大きな変更**
   - 旧`product_keywords`, `product_alias`, `product_alias_keywords`を統合
   - 列名を標準化し、より明確な命名規則を適用

2. **データ構造の最適化**
   - 商品とキーワードの組み合わせに一意制約を追加し、データの整合性を確保

