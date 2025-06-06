video_transcription テーブル

## 概要
Tiktok動画の文字起こしデータを管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(50) | NO | - | ビデオid |
| file_path | VARCHAR(255)  | NO | - | 保存先のURL |
| transcription | TEXT | NO | - | 動画の文字起こしデータ|

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| UNIQUE | video_id | ユニーク | video_idは一個 |
