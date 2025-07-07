# video_play_count_raw_data テーブル

## 概要
動画の再生数に特化した生データを管理するテーブルです。再生数のみに焦点を当てた効率的なデータ収集を行います。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | レコードの一意識別子（主キー） |
| video_url | TEXT | NO | | - | 動画のURL |
| video_id | VARCHAR(255) | NO | | UNIQUE, INDEX | 動画の一意識別子 |
| user_username | VARCHAR(255) | NO | | INDEX | 投稿者のユーザー名 |
| play_count_text | VARCHAR(255) | YES | NULL | - | 再生数のテキスト形式 |
| play_count | INT | YES | NULL | - | 再生数（数値） |
| crawled_at | DATETIME | NO | | INDEX | クロール実行日時 |
| crawling_algorithm | VARCHAR(50) | NO | | INDEX | 使用したクローリングアルゴリズム |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | - | レコード作成日時 |
| manual_update | TINYINT | YES | 0 | - | 手動更新フラグ |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| uc_video_id | video_id | UNIQUE | 動画IDの一意性 |
| idx_video_id | video_id | INDEX | 動画ID検索用 |
| idx_user_username | user_username | INDEX | ユーザー名検索用 |
| idx_crawled_at | crawled_at | INDEX | クロール日時検索用 |
| idx_algorithm | crawling_algorithm | INDEX | アルゴリズム検索用 |

## 関連Function
### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| creare_tables | - | 111~126 | テーブルの作成クエリ |
| repositories | video_play_count_raw_data | 323~333 | 動画の再生数データを保存 |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| manual_sync_video_play_count | manual_sync_video_play_count | 64~80 | 更新対象の動画を取得（バッチ処理） |
| manual_sync_video_play_count | manual_sync_video_play_count | 153~158 | 残りの更新対象の動画を取得（バッチ処理） |

## 備考
- 再生数のみに特化した軽量なデータ収集テーブルです
- 他のカウント情報（いいね数、コメント数など）は含まれません
- 高速な再生数データの取得と更新に最適化されています
- 動画IDに対して重複インデックス（UNIQUE + INDEX）が設定されており、検索性能が向上しています
- 手動更新フラグにより、手動での再生数更新を管理できます
- クローリングアルゴリズムを記録することで、データ取得方法を追跡できます
- 動画IDは一意である必要があります
