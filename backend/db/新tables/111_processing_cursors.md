# processing_cursors テーブル

## 概要
バッチ処理の進行状況を管理するテーブルです。各プロセッサーがどのテーブルのどの位置まで処理したかを記録し、処理の継続性を保証します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | レコードの一意識別子（主キー） |
| processor_name | VARCHAR(50) | NO | | UNIQUE | プロセッサー名 |
| target_table | VARCHAR(50) | NO | | UNIQUE | 処理対象テーブル名 |
| last_cursor_id | INT | NO | 0 | - | 最後に処理したID |
| last_reset_time | TIMESTAMP | NO | CURRENT_TIMESTAMP | - | 最後にリセットした日時 |
| batch_size | INT | NO | 4 | - | バッチ処理サイズ |
| reset_interval | INT | NO | 86400 | - | リセット間隔（秒） |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | TIMESTAMP | YES | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |
| batch_number | INT | NO | 100 | - | バッチ番号 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| uk_processor | processor_name, target_table | UNIQUE | プロセッサー名とテーブル名の組み合わせの一意性 |

## 関連Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product-scoring\manual-tasks | get_or_initialize_cursor | 349~354 | カーソル情報を取得 |
| product-scoring\manual-tasks | get_or_initialize_cursor | 362~366 | 新しいカーソルを作成 |
| product-scoring\manual-tasks | update_cursor | 375~379 | カーソル情報を更新 |
| product-scoring\manual-tasks | reset_cursor | 385~389 | カーソル情報をリセット |
| frontend_data_update | get_or_initialize_cursor | 354~359 | カーソル情報を取得 |
| frontend_data_update | get_or_initialize_cursor | 367~371 | 新しいカーソルを作成 |
| frontend_data_update | update_cursor | 380~384 | カーソル情報を更新 |
| frontend_data_update | reset_cursor | 390~394 | カーソル情報をリセット |
| manual_sync_master | get_video_data_batch | 353~359 | カーソル情報を取得 |
| manual_sync_master | get_video_data_batch | 364~368 | 新しいカーソルを作成 |
| manual_sync_master | get_video_data_batch | 412~418 | カーソル情報を更新 |
| manual_sync_master | sync_video_data_batch | 617~623 | カーソル情報をリセット |
| manual_sync_video_play_count | get_or_initialize_cursor | 271~276 | カーソル情報を取得 |
| manual_sync_video_play_count | get_or_initialize_cursor | 284~288 | 新しいカーソルを作成 |
| manual_sync_video_play_count | update_cursor | 297~301 | カーソル情報を更新 |
| manual_sync_video_play_count | reset_cursor | 307~311 | カーソル情報をリセット |
| update_all_categories | get_or_create_cursor | 265~269 | カーソル情報を取得 |
| update_all_categories | get_or_create_cursor | 281~285 | 新しいカーソルを作成 |
| update_all_categories | update_cursor | 328~334 | カーソル情報を更新 |
| update_all_categories | reset_cursor | 353~360 | カーソル情報をリセット |


## 備考
- バッチ処理の進行状況を追跡し、処理の継続性を保証します
- プロセッサー名とテーブル名の組み合わせで一意性を保証します
- 最後に処理したIDを記録することで、次回の処理開始位置を特定できます
- リセット間隔により、定期的な処理の再開を管理できます
- バッチサイズとバッチ番号により、処理の粒度を制御できます
- 作成日時と更新日時が自動的に記録されます
- デフォルトのリセット間隔は24時間（86400秒）に設定されています
