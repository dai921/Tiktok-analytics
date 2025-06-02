# play_count_history テーブル

## 概要
TikTok動画の再生数履歴データを管理するテーブルです。日付ごとの再生数、いいね数、コメント数などの増加データを格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | BIGINT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| video_id | VARCHAR(50) | NO | - | TikTokの動画ID |
| video_url | VARCHAR(255) | NO | - | 動画のURL |
| collection_date | DATE | NO | - | データ収集日 |
| play_count_increase | INT UNSIGNED | YES | NULL | 再生数増加 |
| likes_count_increase | INT UNSIGNED | YES | NULL | いいね数増加 |
| comment_count_increase | INT UNSIGNED | YES | NULL | コメント数増加 |
| save_count_increase | INT UNSIGNED | YES | NULL | 保存数増加 |
| likes_count | INT UNSIGNED | YES | NULL | いいね数 |
| play_count | INT UNSIGNED | YES | NULL | 再生数 |
| comment_count | INT UNSIGNED | YES | NULL | コメント数 |
| save_count | INT UNSIGNED | YES | NULL | 保存数 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | 作成日時 |
| post_time | DATE | YES | NULL | 投稿日 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id, collection_date | 主キー | レコードの一意識別子と収集日の組み合わせ |
| idx_video_date | video_id, collection_date | インデックス | 動画IDと収集日による検索用 |
| idx_post_time | post_time | インデックス | 投稿日検索用 |
| idx_pch_collection_post | collection_date, post_time, video_id | インデックス | 収集日、投稿日、動画IDによる検索用 |
| unique_video_date | video_id, collection_date | ユニーク | 動画IDと収集日の組み合わせは一意 |

## パーティション
RANGE パーティション（TO_DAYS(collection_date)による）
- p_current: TO_DAYS('2025-05-01')未満
- p_future: MAXVALUE未満

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやvideo_urlを通じて他のテーブルと関連付けられます。

## 備考
- 動画の再生数などの増加データを日付ごとに格納するテーブルです
- パーティショニングによりデータアクセスが最適化されています
- 時系列分析やトレンド分析に使用されるデータを提供します
