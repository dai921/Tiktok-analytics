# scheduler_job_info テーブル

## 概要
スケジュールジョブの実行履歴を管理するテーブルです。各ジョブの最後の実行日時を記録し、スケジュール管理を支援します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| job_name | VARCHAR(255) | NO | | PRIMARY | ジョブ名（主キー） |
| last_run | DATETIME | NO | CURRENT_TIMESTAMP | - | 最後の実行日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | job_name | PRIMARY | 主キー（ジョブ名） |

## 関連Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_account_list | check_last_execution | 236~240 | 前回の実行時間を取得 |
| sync_account_list | check_last_execution | 245~248 | データが無かったら作成 |
| sync_account_list | check_last_execution | 260~264 | 前回から36時間以上経っていた場合更新 |
| sync_category_spreadsheet | check_last_execution | 29~33 | 前回の実行時間を取得 |
| sync_category_spreadsheet | check_last_execution | 38~41 | データが無かったら作成 |
| sync_category_spreadsheet | check_last_execution | 53~57 | 前回から36時間以上経っていた場合更新 |
| frontend_data_trigger | check_last_execution | 23~27 | 前回の実行時間を取得 |
| frontend_data_trigger | check_last_execution | 32~35 | データが無かったら作成 |
| frontend_data_trigger | check_last_execution | 47~51 | 前回から36時間以上経っていた場合更新 |


## 備考
- スケジュールジョブの実行履歴を簡潔に管理します
- ジョブ名を主キーとして、各ジョブの最後実行日時を記録します
- スケジューラーが次回の実行タイミングを判断する際に使用されます
- シンプルな構造により、高速なアクセスが可能です
- ジョブの実行間隔や頻度の監視に活用できます
- デフォルトで現在時刻が設定されるため、新規ジョブの初期化が容易です
