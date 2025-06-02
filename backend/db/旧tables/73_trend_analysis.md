# trend_analysis テーブル

## 概要
TikTokのトレンド分析データを格納するテーブルです。ジャンル別の再生数増加や投稿数などの集計データを日付ごとに管理します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | SERIAL | NO | - | レコードの一意識別子（主キー） |
| collection_date | DATE | NO | - | 集計日 |
| genre | VARCHAR(100) | NO | - | ジャンル |
| view_increase | BIGINT | NO | - | 再生増加数 |
| videos_10k_plus | INT | NO | - | 再生増加数1万以上動画数 |
| videos_100k_plus | INT | NO | - | 再生増加数10万以上動画数 |
| total_posts | INT | NO | - | 投稿数 |
| ratio_10k_plus | FLOAT | NO | - | 再生増加数1万以上割合 |
| ratio_100k_plus | FLOAT | NO | - | 再生増加数10万以上割合 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | 作成日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| idx_collection_date | collection_date | インデックス | 集計日検索用 |
| idx_genre | genre | インデックス | ジャンル検索用 |
| unique_date_genre | collection_date, genre | ユニーク | 集計日とジャンルの組み合わせは一意 |

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありません。

## 備考
- ジャンル別のトレンド分析データを格納するテーブルです
- 日次で集計されるデータを保存します
- ダッシュボードのトレンドグラフやレポート生成に使用されます
