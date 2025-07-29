hashtags_daily_top100_videos テーブル

## 概要
該当ハッシュタグを使用しているTiktok動画の再生数増加ランキングTOP100動画を日次で管理するテーブルです。これにより、ウィンドウ関数を作成する必要がなく、処理を高速化できます。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(100) | NO | - | 動画id |
| fetch_date | DATE | NO | - | 更新日 |
| hashtags | VARCHAR(50) | NO | - | ハッシュタグ名 |
| plays_increase | INT unsigned | NO | 0 | 再生増加数BGM |
| likes_increase | INT unsigned | NO | 0 | いいね増加数 |
| post_time | DATE | NO | - | 投稿日 |
| thumbnail_url | VARCHAR(100) | NO | - | サムネイルURL |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id,fetch_date | 主キー | 関連付けの一意識別子 |
| idx_day_sound_post | fetch_date, hashtags,video_id | インデックス | 特定日・ハッシュタグ・動画での検索を高速化 |
| idx_plays_desc | fetch_date, hashtags ,plays_increase(DESC) | インデックス | 再生数順でのソート・検索を高速化 |

