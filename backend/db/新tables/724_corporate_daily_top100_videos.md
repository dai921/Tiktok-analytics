corporate_daily_top100_videos テーブル

## 概要
企業系動画の再生数増加ランキングTOP100動画を日次で管理するテーブルです。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(100) | NO | - | 動画id |
| fetch_date | DATE | NO | - | 更新日 |
| account_type | VARCHAR(50) | NO | - | アカウントタイプ |
| second_account_type | VARCHAR(50) | YES | - | 採用or集客 |
| plays_increase | INT unsigned | NO | 0 | 再生増加数 |
| likes_increase | INT | NO | 0 | いいね増加数 |
| comments_increase | INT | NO | 0 | コメント増加数 |
| saves_increase | INT | NO | 0 | 保存増加数 |
| post_time | DATE | NO | - | 投稿日 |
| thumbnail_url | VARCHAR(100) | NO | - | サムネイルURL |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| UNIQUE | video_id,fetch_date | 主キー | 動画は収集日に対して必ず一つ |
| idx_day_accounttype_post | fetch_date, account_type, second_account_type, video_id | インデックス | 特定日・アカウントタイプ・セカンドタイプでの検索を高速化 |
| idx_plays_desc | fetch_date, account_type,second_account_type, plays_increase(DESC) | インデックス | 再生数順でのソート・検索を高速化 |
| uq_fetch_video | fetch_date, video_id | ユニーク | 同一日付、動画データは必ず一つ |


