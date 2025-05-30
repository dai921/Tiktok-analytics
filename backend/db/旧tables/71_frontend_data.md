# frontend_data テーブル

## 概要
非正規テーブルです。
フロントエンド表示用のTikTok動画データを、ダッシュボードやUI表示に最適化された形式で格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| url | VARCHAR(255) | NO | - | 動画のURL |
| video_id | VARCHAR(50) | YES | NULL | TikTokの動画ID |
| thumbnail_url | VARCHAR(255) | YES | NULL | サムネイル画像URL |
| created_at | DATE | YES | NULL | 投稿日 |
| play_count | INT UNSIGNED | YES | NULL | 再生数 |
| play_count_increase | INT UNSIGNED | YES | NULL | 再生数増加 |
| ten_days_increase | INT | YES | NULL | 10日間の再生数増加 |
| account_name | VARCHAR(50) | YES | NULL | アカウント名 |
| display_name | VARCHAR(255) | YES | NULL | 表示名 |
| content_type | VARCHAR(50) | YES | NULL | コンテンツタイプ |
| likes_count | INT UNSIGNED | YES | NULL | いいね数 |
| comment_count | INT UNSIGNED | YES | NULL | コメント数 |
| likes_count_increase | INT | YES | NULL | いいね数増加 |
| ten_days_likes_increase | INT | YES | NULL | 10日間のいいね数増加 |
| comment_count_increase | INT | YES | NULL | コメント数増加 |
| ten_days_comment_increase | INT | YES | NULL | 10日間のコメント数増加 |
| save_count | INT UNSIGNED | YES | NULL | 保存数 |
| save_count_increase | INT | YES | NULL | 保存数増加 |
| ten_days_save_increase | INT | YES | NULL | 10日間の保存数増加 |
| account_type | VARCHAR(50) | YES | NULL | アカウントタイプ |
| hashtags | TEXT | YES | NULL | ハッシュタグ |
| music_info | TEXT | YES | NULL | 音楽情報 |
| caption | TEXT | YES | NULL | キャプション |
| category | VARCHAR(255) | YES | NULL | カテゴリ |
| product | VARCHAR(255) | YES | NULL | 関連商品 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| url | url | ユニーク | 動画URLは一意 |
| idx_play_count | play_count | インデックス | 再生数検索用 |
| idx_play_count_increase | play_count_increase | インデックス | 再生数増加検索用 |
| idx_ten_days_increase | ten_days_increase | インデックス | 10日間再生数増加検索用 |
| idx_account_name | account_name | インデックス | アカウント名検索用 |
| idx_content_type | content_type | インデックス | コンテンツタイプ検索用 |
| idx_likes_count | likes_count | インデックス | いいね数検索用 |
| idx_comment_count | comment_count | インデックス | コメント数検索用 |
| idx_likes_count_increase | likes_count_increase | インデックス | いいね数増加検索用 |
| idx_ten_days_likes_increase | ten_days_likes_increase | インデックス | 10日間いいね数増加検索用 |
| idx_comment_count_increase | comment_count_increase | インデックス | コメント数増加検索用 |
| idx_ten_days_comment_increase | ten_days_comment_increase | インデックス | 10日間コメント数増加検索用 |
| idx_account_type | account_type | インデックス | アカウントタイプ検索用 |
| idx_category | category | インデックス | カテゴリ検索用 |
| idx_product | product | インデックス | 商品検索用 |
| idx_created_at | created_at | インデックス | 投稿日検索用 |

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやurlを通じて他のテーブルと関連付けられます。

## 備考
- フロントエンド表示に最適化されたデータを格納するテーブルです
- ダッシュボードやUIコンポーネントで直接使用されるデータ形式です
- video_masterテーブルのデータを整形・加工して格納されます
