# product_alias_keywords テーブル

## 概要
商品別名に関連するキーワードを管理するテーブルです。TikTok動画の商品別名自動識別に使用されるキーワード情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| keyword_id | INT | NO | AUTO_INCREMENT | キーワードの一意識別子（主キー） |
| alias_id | INT | NO | - | 関連する別名ID |
| keyword | VARCHAR(255) | NO | - | キーワード |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | keyword_id | 主キー | キーワードの一意識別子 |
| keyword_id | keyword_id | ユニーク | キーワードIDは一意 |
| idx_keyword | keyword | インデックス | キーワード検索用 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| product_alias | alias_id -> alias_id | 多対一 | 各キーワードは一つの商品別名に属する |

## 関連Function

| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product-scoring | get_alias_keywords | 78~86 | シリーズが複数ある商品のキーワードマッピングに使用 |
| sync_category_spreadsheet | sync_category_spreadsheet | 353~358 | スプシ上の商品キーワードを挿入/更新 |
| video_master_sync | analyze_title | 78~87 | シリーズ商品のキーワード、優先順位を取得 |
| manual_sync_master | analyze_title | 75~84 | 商品、動画ジャンル、キーワードの一括取得 |
| update_all_categories | analyze_title | 416~425 | 商品、動画ジャンル、キーワードの一括取得 |

## 備考
- TikTok動画の商品別名自動識別に使用されるキーワードを管理するテーブルです
- 動画の説明文やハッシュタグにこれらのキーワードが含まれていると、対応する商品別名に関連付けられます
