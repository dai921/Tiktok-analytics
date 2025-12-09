# csv_export_logs テーブル

## 概要
ユーザーのCSV出力履歴を記録するテーブルです。
どのユーザーがいつどのページからどのような条件でCSVを出力したかを追跡します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | 説明 |
|-----|---------|------|----------|------|
| id | INT | NO | AUTO_INCREMENT | 主キー |
| user_id | VARCHAR(255) | NO | | ユーザーID |
| user_email | VARCHAR(255) | NO | | ユーザーメールアドレス |
| exported_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 出力日時 |
| export_source | ENUM | NO | | 出力元ページ（dashboard / trends_product / trends_genre / overall_sounds / overall_hashtags） |
| tab_type | ENUM | YES | NULL | タブ種別（all / affiliate / corporate / influencer） |
| export_params | JSON | YES | NULL | 出力パラメータ |
| export_status | ENUM | NO | 'success' | 出力結果（success / failed） |
| row_count | INT UNSIGNED | YES | NULL | 出力レコード数 |
| file_size_bytes | INT UNSIGNED | YES | NULL | ファイルサイズ（バイト） |
| error_message | VARCHAR(512) | YES | NULL | エラーメッセージ |
| user_agent | VARCHAR(512) | YES | NULL | ブラウザ情報 |
| ip_address | VARCHAR(45) | YES | NULL | IPアドレス |

## インデックス

| インデックス名 | 列名 | 説明 |
|--------------|------|------|
| PRIMARY | id | 主キー |
| idx_user_id | user_id | ユーザーID検索用 |
| idx_user_email | user_email | メールアドレス検索用 |
| idx_exported_at | exported_at | 日時検索用 |
| idx_export_source | export_source | ページ種別検索用 |
| idx_user_source | (user_id, export_source) | 複合検索用 |

## export_source の値

| 値 | 対応ページ |
|----|----------|
| dashboard | ダッシュボード（/dashboard） |
| trends_product | 商材トレンド（/trends/product） |
| trends_genre | ジャンルトレンド（/trends/genre） |
| overall_sounds | BGMトレンド（/overall-trends/sounds） |
| overall_hashtags | ハッシュタグトレンド（/overall-trends/hashtags） |