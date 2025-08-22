# music_info テーブル

## 概要
アプリケーションを使用しているユーザーの情報を管理するテーブルです。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | BIGINT UNSIGNED | NO | AUTO_INCREMENT | PRIMARY | BGMの一意識別子（主キー） |
| music_title | VARCHAR(255) | NO | | - | BGM名 |


## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| ux_music_title | music_title | UNIQUE | BGM名は一つ |

## 関連Function
### バックエンドAPI
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| video_master_sync | get_current_user | 34~37 | 現在のユーザー情報を取得 |


