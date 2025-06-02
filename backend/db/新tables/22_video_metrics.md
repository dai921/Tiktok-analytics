# video_metrics テーブル

## 概要
TikTok動画の時系列メトリクスデータを管理するテーブルです。再生数、いいね数、コメント数などの時間経過による変化を追跡します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| video_id | INT | NO | - | 動画ID（外部キー: videos.id） |
| fetch_date | DATE | NO | - | 何日時点のデータかを表す日付 |
| plays_count | INT UNSIGNED | NO | 0 | 再生数 |
| likes_count | INT UNSIGNED | NO | 0 | いいね数 |
| comments_count | INT UNSIGNED | NO | 0 | コメント数 |
| shares_count | INT UNSIGNED | YES | 0 | シェア数 |
| saves_count | INT UNSIGNED | YES | 0 | 保存数 |
| plays_increase_2d | INT | YES | NULL | 2日前からの再生数増加 |
| likes_increase_2d | INT | YES | NULL | 2日前からのいいね数増加 |
| comments_increase_2d | INT | YES | NULL | 2日前からのコメント数増加 |
| shares_increase_2d | INT | YES | NULL | 2日前からのシェア数増加 |
| saves_increase_2d | INT | YES | NULL | 2日前からの保存数増加 |
| plays_increase_10d | INT | YES | NULL | 10日前からの再生数増加 |
| likes_increase_10d | INT | YES | NULL | 10日前からのいいね数増加 |
| comments_increase_10d | INT | YES | NULL | 10日前からのコメント数増加 |
| shares_increase_10d | INT | YES | NULL | 10日前からのシェア数増加 |
| saves_increase_10d | INT | YES | NULL | 10日前からの保存数増加 |
| is_viral | TINYINT(1) | NO | 0 | 伸びた動画かを表す独自フラグ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

今後クロール頻度が1日ごとになった場合、`plays_increase_1d`などの列を追加。

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| idx_video_id | video_id | インデックス | 動画IDによる検索用 |
| idx_fetch_date | fetch_date | インデックス | 取得日時による検索用 |
| idx_video_id_and_fetch_date | video_id, fetch_date | ユニーク | 動画と取得日時の組み合わせは一意 |
| idx_plays_count | plays_count | インデックス | 再生数による検索用 |
| idx_likes_count | likes_count | インデックス | いいね数による検索用 |
| idx_comments_count | comments_count | インデックス | コメント数による検索用 |
| idx_plays_increase_2d | plays_increase_2d | インデックス | 2日前からの再生数増加による検索用 |
| idx_likes_increase_2d | likes_increase_2d | インデックス | 2日前からのいいね数増加による検索用 |
| idx_comments_increase_2d | comments_increase_2d | インデックス | 2日前からのコメント数増加による検索用 |
| idx_plays_increase_10d | plays_increase_10d | インデックス | 10日前からの再生数増加による検索用 |
| idx_likes_increase_10d | likes_increase_10d | インデックス | 10日前からのいいね数増加による検索用 |
| idx_comments_increase_10d | comments_increase_10d | インデックス | 10日前からのコメント数増加による検索用 |
| idx_is_viral | is_viral | インデックス | 伸びた動画検索用 |

現在多くの列にインデックスが設定されているが、検索クエリとして用いない列のインデックスは不要。 !TODO よく確認して追加削除してね。
さらに、今後高速化のために、サービスユーザーによる検索用に「video_metricsにservice_user_id列を含めた非正規DB」を構築する可能性大。その場合、`video_id`, `fetch_date`, `video_id_and_fetch_date`以外のインデックスは不要になる。

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| video_id | videos.id | 多対一 | 各メトリクスレコードは一つの動画に属する |

## 特徴

1. **時系列データの管理**
   - 同一動画の異なる時点でのメトリクスを複数レコードとして保存
   - 時間経過による変化を追跡可能

2. **増加量の計算**
   - 2日間、10日間の増加量も記録。これにより短期的な勢い・中期的な勢いを把握。検索クエリとしても用いる。


## 変更点
1. **テーブル名やカラムの整理などの大きな変更**
この新テーブルは概ね旧`video_master`に近い役割だが、他のテーブルとまとめて大きな変更が入っている。
詳しくは`20_README_videos系テーブルの大きな変更.md`を参照。

2. **データ構造の最適化**
   - 各種メトリクスと増加量を一貫した命名規則で整理

## 備考
- 定期的なクローリングで取得したメトリクスデータを時系列で保存
- 分析やレポート生成時には、特定期間のデータを集計して利用
- 長期保存データは別テーブルに移動するアーカイブ戦略も検討可能
