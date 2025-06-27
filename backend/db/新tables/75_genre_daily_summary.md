genre_daily_summary テーブル

## 概要
Tiktok動画の再生増加数、投稿数、10万以上動画数を動画ジャンルごとに管理するテーブルです。各商品の指標を更新毎に保存します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| fetch_date | DATE | NO | - | 更新日 |
| video_genre | VARCHAR(50) | NO | - | 動画のジャンル名|
| plays_increase | INT unsigned | NO | 0 | 再生増加数 |
| over_100k | TINYINT | NO | 0 | 10万以上動画数 |
| post_count | INT | NO | 0 | 投稿数 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id,fetch_date | 主キー | 関連付けの一意識別子 |
| UNIQUE | fetch_date, video_genre | ユニーク | 商品と更新日の組み合わせは一意 |

## 関連テーブル

作成予定

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| genre_stats | get_genre_stats | 64~70 | 収集日の一覧を取得 |
| genre_stats | get_genre_stats | 95~106 | 動画ジャンルトレンドのデータを取得 |
| genre_stats | get_genre_trends | 214~220 | 収集日の一覧を取得 |
| genre_stats | get_ganre_trends | 245~254 | トップ10動画を取得 |
| genre_stats | get_ganre_trends | 272~283 | 動画ジャンルの日次（収集日）データ |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| summary_table_sync| update_genre_daily_summary | 127~159 | 動画ジャンルの日次データをテーブルに共有する |
| manual_summary_sync| process_ganre_summary | 193~225 | 動画ジャンルの日次データをテーブルに共有する |

## 備考
- genre-stats、genre-trendsエンドポイントの処理を高速化するためのサブテーブル
