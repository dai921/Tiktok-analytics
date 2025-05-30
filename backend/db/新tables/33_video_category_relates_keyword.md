# video_category_relates_keyword

## 概要
TikTok動画の自動分類において関連すると判断する、動画カテゴリーとキーワードのペアを管理するテーブル。これらペアたちは関係としては多対多である。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| video_category_id | INT | NO | | INDEX | 動画カテゴリーID (外部キー: video_categories.id) |
| keyword | VARCHAR(255) | NO | | INDEX | キーワード |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| idx_keyword | keyword | INDEX | キーワード検索を高速化 |
| idx_video_category_id | video_category_id | INDEX | カテゴリーによる検索を高速化 |
| idx_video_category_id_and_keyword | video_category_id, keyword | UNIQUE | カテゴリーとキーワードの組み合わせの一意性を保証 |

## 特徴

1. **キーワードベースの自動分類**
   - 動画の説明文やハッシュタグに含まれるキーワードを基に、動画を適切なカテゴリーに自動分類

2. **柔軟なキーワード管理**
   - キーワードの追加・変更・削除が容易
   - 新しいトレンドやテーマに応じてキーワードを更新可能

## 変更点
1. **テーブル名やカラムの整理などの大きな変更**
   - 旧`category_keywords`テーブルから名称変更
   - 列名を標準化し、より明確な命名規則を適用

2. **データ構造の最適化**
   - カテゴリーとキーワードの組み合わせに一意制約を追加し、データの整合性を確保

## 備考
- キーワードは小文字に正規化して保存することを推奨
