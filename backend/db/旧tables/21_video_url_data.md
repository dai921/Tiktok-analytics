# video_url_data テーブル

## 概要
TikTok動画のURLデータを管理するテーブルです。クローリング対象の動画URLと基本情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| video_url | VARCHAR(255) | NO | - | 動画のURL |
| video_id | BIGINT | NO | - | TikTokの動画ID |
| username | VARCHAR(50) | NO | - | 投稿者のユーザー名 |
| is_new_video | TINYINT(1) | YES | 1 | 新規動画フラグ |
| needs_update | TINYINT(1) | YES | 1 | 更新必要フラグ |
| content_type | VARCHAR(10) | YES | NULL | コンテンツタイプ |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| video_url | video_url | ユニーク | 動画URLは一意 |
| video_id | video_id | ユニーク | 動画IDは一意 |
| idx_is_new_account | is_new_video | インデックス | 新規動画検索用 |
| idx_needs_update | needs_update | インデックス | 更新必要動画検索用 |

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやvideo_urlを通じて他のテーブルと関連付けられます。

## 備考
- クローリング対象の動画URLを管理するテーブルです
- is_new_videoフラグが1の場合、まだ詳細情報が取得されていない新規動画です
- needs_updateフラグが1の場合、データの更新が必要な動画です
