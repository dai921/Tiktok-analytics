# category_keywords テーブル

## 概要
カテゴリーに関連するキーワードを管理するテーブルです。TikTok動画の自動分類に使用されるキーワード情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| keyword_id | INT | NO | AUTO_INCREMENT | キーワードの一意識別子（主キー） |
| category_id | INT | YES | NULL | 関連するカテゴリーID |
| keyword | VARCHAR(255) | NO | - | キーワード |
| is_product | TINYINT(1) | YES | 0 | 商品フラグ |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | keyword_id | 主キー | キーワードの一意識別子 |
| keyword_id | keyword_id | ユニーク | キーワードIDは一意 |
| idx_keyword | keyword | インデックス | キーワード検索用 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| category_master | category_id -> category_id | 多対一 | 各キーワードは一つのカテゴリーに属する |

| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_category_spreadsheet | sync_category_spreadsheet | 205 | 既存の動画ジャンルキーワードリストを取得 |
| sync_category_spreadsheet | sync_category_spreadsheet | 221~225 | 新たな動画ジャンルキーワードを挿入 |
| sync_category_spreadsheet | sync_category_spreadsheet | 239~243 | 新たな動画ジャンルキーワード(商品名)を挿入 |
| video_master_sync | analyze_title | 129~136 | 動画ジャンルとキーワードとのマッピング |
| manual_sync_master | analyze_title | 126~133 | 動画ジャンルとキーワードとのマッピング |
| update_all_categories | process_update_all_categories | 107~111 | 動画ジャンルのキーワードを取得 |
| update_all_categories | analyze_title | 466~473 | 動画ジャンルのキーワードを取得 |

## 備考
- TikTok動画の自動分類に使用されるキーワードを管理するテーブルです
- is_productフラグが1の場合、そのキーワードは商品を表します
- 動画の説明文やハッシュタグにこれらのキーワードが含まれていると、対応するカテゴリーに分類されます
