video_hashtags テーブル

## 概要
Tiktok動画の使用しているハッシュタグを管理するテーブル。
これを用いることでハッシュタグの集計がラクになる。


## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(50) | YES | NULL | TikTokの動画ID |
| hashtag | VARCHAR(50) | NO | - | ハッシュタグ名|
| post_time  | DATE | YES | NULL | 投稿日 |
| created_at | DATETIME | YES | CURRENT_TIMESTAMP | 生成日 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| idx_vid | video_id | インデックス | 動画検索の高速化 |
| idx_hashtag | hashtag | インデックス | ハッシュタグ検索の高速化 |
| idx_post_time | post_time | インデックス | 投稿日検索の高速化 |


