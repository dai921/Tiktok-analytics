users_video_daily_metrics_new テーブル

## 概要
TikTok動画の「日次」指標を保存します。動画IDごと・収集日ごとに、再生数/いいね数/コメント数/シェア数/保存数を保持します。将来のデータ量増加に備え、日付パーティションを採用します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| video_id | VARCHAR(255) | NO | - | TikTok動画の一意識別子 |
| collection_date | DATE | NO | - | 収集日（UTCの基準日） |
| play_cnt | INT unsigned | YES | NULL | 再生数（欠損時はNULL） |
| like_cnt | INT unsigned | YES | NULL | いいね数（欠損時はNULL） |
| comment_cnt | INT unsigned | YES | NULL | コメント数（欠損時はNULL） |
| share_cnt | INT unsigned | YES | NULL | シェア数（欠損時はNULL） |
| save_cnt | INT unsigned | YES | NULL | 保存数（欠損時はNULL） |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | video_id, collection_date | 主キー | 動画×日付の複合主キー |
| ix_vdm_date | collection_date | INDEX | 日付での範囲検索を最適化（パーティションプルーニングと相性良） |

## パーティション

MySQL 5.7 互換の書式で `RANGE COLUMNS(collection_date)` により年単位パーティションを設定します。

| パーティション名 | 範囲（LESS THAN） |
|----------------|------------------|
| p2024 | '2025-01-01' |
| p2025 | '2026-01-01' |

（例: 2024年分は `p2024`、2025年分は `p2025` に格納）

## 関連テーブル

- 直接の外部キーはなし（必要に応じて動画マスターと論理的に関連付け）

## 関連Function

- TBD（定期収集・再集計API 実装予定）

## 備考
- 一意性: 主キーにより `video_id` × `collection_date` を1日1行に制約。
- 欠損値: 収集できなかった指標は `NULL`。差分・集計時は `COALESCE` で補完可能。
- タイムゾーン: 日付はUTC基準。表示はローカライズ。
- パーティション運用: 年度追加時は `ALTER TABLE ... REORGANIZE PARTITION` または `ADD PARTITION` を使用。古い年のアーカイブ/削除方針に留意。

