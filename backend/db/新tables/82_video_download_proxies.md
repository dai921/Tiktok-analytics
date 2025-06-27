video_download_proxies テーブル

## 概要
Tiktokの動画をダウンロードする時のプロキシデータを管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| proxy | VARCHAR(255) | NO | - | プロキシのIP |
| is_alive | TINYINT  | NO | 1 | ブロックされていなければ1 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| transcription\repositories | get_active_proxy | 79 | 動画ダウンロード用のプロキシを取得 |



### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| tiktok-video-downloader | get_active_proxy | 267 | 動画のパスを取得 |

