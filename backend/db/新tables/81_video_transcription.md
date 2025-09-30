video_transcription テーブル

## 概要
Tiktok動画の文字起こしデータを管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| video_id | VARCHAR(50) | NO | - | ビデオid |
| file_path | VARCHAR(255)  | NO | - | 保存先のURL |
| transcription | TEXT | NO | - | 動画の文字起こしデータ|
| user_number | INT | YES | NULL | 初回実行ユーザーの番号（初回のみ保存） |
| account_name | VARCHAR(100) | YES | NULL | TikTokのアカウント名 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| UNIQUE | video_id | ユニーク | video_idは一個 |
| idx_file_path | file_path | INDEX | URLでの検索も高速化 |
| idx_user_number | user_number | INDEX | 実行ユーザーで絞り込み |
| idx_account_name | account_name | INDEX | 対象アカウントで絞り込み |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| transcription\repositories | find_transcription_by_video_id | 29 | 文字起こしデータがテーブルにないか確認|
| transcription\repositories | save_transcription | 40~43 | 文字起こし結果をUPDATE|
| transcription\repositories | save_transcription | 47~50 | 文字起こし結果を挿入|
| transcription\repositories | save_video_file_path | 56~59 | 動画ファイルパスを保存|
| transcription\repositories | get_video_file_path | 64 | 動画ファイルパスを取得|
| transcription\repositories | update_transcription | 72 | 文字起こしデータを更新|



### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| tiktok-video-downloader | find_transcription_by_video_id | 233 | 動画のパスを取得 |
| tiktok-video-downloader | save_video_file_path | 244~254 | 動画のファイルパスを更新/挿入 |
| tiktok-video-downloader | get_video_file_path | 260 | 動画のファイルパスを取得 |
| video-transcription-processor | find_transcription_by_video_id | 116 | 動画のパスを取得 |
| video-transcription-processor | save_video_file_path | 123 | 動画のファイルパスを挿入 |
| video-transcription-processor | get_video_file_path | 130 | 動画のファイルパスを取得 |
| video-transcription-processor | update_transcription | 138 | 文字起こし結果を更新 |