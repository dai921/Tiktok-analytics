# category_master テーブル

## 概要
カテゴリーのマスターデータを管理するテーブルです。TikTok動画の分類に使用されるカテゴリー情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| category_id | INT | NO | AUTO_INCREMENT | カテゴリーの一意識別子（主キー） |
| category_name | VARCHAR(255) | NO | - | カテゴリー名 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | category_id | 主キー | カテゴリーの一意識別子 |
| category_id | category_id | ユニーク | カテゴリーIDは一意 |
| category_name | category_name | ユニーク | カテゴリー名は一意 |

## 関連テーブル

| テーブル名 | 関連カラム | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| category_keywords | category_id -> category_id | 一対多 | 一つのカテゴリーは複数のキーワードを持つことができる |

### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| main | get_trends_genres | 1179 | 商材トレンド分析ページのフィルタに使用するジャンル一覧を取得 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_category_spreadsheet | sync_category_spreadsheet | 172 | 既存の動画ジャンルリストを取得 |
| sync_category_spreadsheet | sync_category_spreadsheet | 185~188 | 新たな動画ジャンルリストを挿入 |
| video_master_sync | analyze_title | 129~136 | 動画ジャンルとキーワードとのマッピング |
| manual_sync_master | analyze_title | 126~133 | 動画ジャンルとキーワードとのマッピング |
| update_all_categories | process_update_all_categories | 107~111 | 動画ジャンルのキーワードを取得 |
| update_all_categories | analyze_title | 466~473 | 動画ジャンルのキーワードを取得 |

## 備考
- TikTok動画の分類に使用されるカテゴリーのマスターテーブルです
- カテゴリー名は一意であり、重複は許可されません
