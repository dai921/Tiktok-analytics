sound_daily_summary_top150 テーブル

## 概要
該当BGMを使用してるTiktok動画の投稿数、10万以上動画数、再生増加数をBGMごとに管理するテーブルです。各指標を更新毎に保存します。
フロントエンドには上位60件を表示しますが、テーブルには事前に収集日のTOP150件を保存しその中から期間中のTOP60を取得します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| fetch_date | DATE | NO | - | 更新日 |
| sound_name | VARCHAR(255) | NO | - | BGM名|
| plays_increase | INT unsigned | NO | 0 | 再生増加数 |
| over_100k | INT | NO | 0 | 10万以上動画数 |
| post_count | INT | NO | 0 | 投稿数 |
| parent_account_type | VARCHAR(50) | NO | 0 | 親アカウントタイプ |



## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id,fetch_date | 主キー | 関連付けの一意識別子 |
| UNIQUE | fetch_date, bgm, parent_accpunt_type | ユニーク | BGMと更新日と親アカウントタイプの組み合わせは一意 |


