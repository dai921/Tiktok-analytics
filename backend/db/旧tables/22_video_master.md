# video_master テーブル

## 概要
TikTok動画をクロールした時の生データを保管するテーブルです。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| url | VARCHAR(255) | NO | - | 動画のURL |
| video_id | VARCHAR(50) | YES | NULL | TikTokの動画ID |
| username | VARCHAR(50) | NO | - | 投稿者のユーザー名 |
| cover_image_url | VARCHAR(255) | YES | NULL | サムネイル画像URL |
| display_name | VARCHAR(50) | YES | NULL | 表示名 |
| description | TEXT | YES | NULL | 動画の説明文 |
| likes_count | INT UNSIGNED | YES | NULL | いいね数 |
| play_count | INT UNSIGNED | YES | NULL | 再生数 |
| comment_count | INT UNSIGNED | YES | NULL | コメント数 |
| share_count | INT UNSIGNED | YES | NULL | シェア数 |
| save_count | INT UNSIGNED | YES | NULL | 保存数 |
| created_at | DATE | YES | NULL | 投稿日 |
| hashtags | TEXT | YES | NULL | ハッシュタグ |
| duration | INT UNSIGNED | YES | NULL | 動画の長さ（秒） |
| isViral | TINYINT(1) | YES | NULL | バイラルフラグ |
| prevFetchDate | DATE | YES | NULL | 前回取得日 |
| currentFetchDate | DATE | YES | NULL | 現在取得日 |
| prevPlayCount | INT UNSIGNED | YES | NULL | 前回取得時の再生数 |
| playCountIncrease | INT UNSIGNED | YES | NULL | 再生数増加 |
| ten_days_increase | INT | YES | NULL | 10日間の再生数増加 |
| prevLikesCount | INT UNSIGNED | YES | NULL | 前回取得時のいいね数 |
| likesCountIncrease | INT | YES | NULL | いいね数増加 |
| ten_days_likes_increase | INT | YES | NULL | 10日間のいいね数増加 |
| prevCommentCount | INT UNSIGNED | YES | NULL | 前回取得時のコメント数 |
| commentCountIncrease | INT | YES | NULL | コメント数増加 |
| ten_days_comment_increase | INT | YES | NULL | 10日間のコメント数増加 |
| prevSaveCount | INT UNSIGNED | YES | NULL | 前回取得時の保存数 |
| saveCountIncrease | INT | YES | NULL | 保存数増加 |
| ten_days_save_increase | INT | YES | NULL | 10日間の保存数増加 |
| product | VARCHAR(255) | YES | NULL | 関連商品 |
| category | VARCHAR(255) | YES | NULL | カテゴリ |
| music_id | VARCHAR(50) | YES | NULL | 使用BGMのID |
| music_title | VARCHAR(255) | YES | NULL | 使用BGMのタイトル |
| music_artist | VARCHAR(255) | YES | NULL | 使用BGMのアーティスト |
| status | VARCHAR(20) | YES | 'unknown' | ステータス |
| content_type | VARCHAR(20) | YES | 'video' | コンテンツタイプ |
| file_path | VARCHAR(255) | YES | NULL | ファイルパス |
| folder_path | VARCHAR(255) | YES | NULL | フォルダパス |
| image_count | INT | YES | 0 | 画像数（スライドショーの場合） |
| front_needs_update | TINYINT | YES | 0 | フロントエンド更新フラグ |
| play_needs_update | TINYINT | YES | 0 | 再生数更新フラグ |
| is_new_video | INTEGER | YES | 1 | 新規動画フラグ |
| is_delay | TINYINT | YES | 0 | 遅延フラグ |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| url | url | ユニーク | 動画URLは一意 |
| video_id | video_id | ユニーク | 動画IDは一意 |
| idx_url | url | インデックス | URL検索用 |
| idx_play_count | play_count | インデックス | 再生数検索用 |
| idx_created_at | created_at | インデックス | 投稿日検索用 |
| idx_playCountIncrease | playCountIncrease | インデックス | 再生数増加検索用 |
| idx_ten_days_likes_increase | ten_days_likes_increase | インデックス | 10日間いいね数増加検索用 |
| idx_commentCountIncrease | commentCountIncrease | インデックス | コメント数増加検索用 |
| idx_ten_days_comment_increase | ten_days_comment_increase | インデックス | 10日間コメント数増加検索用 |
| idx_currentFetchDate | currentFetchDate | インデックス | 現在取得日検索用 |
| idx_front_needs_update | front_needs_update | インデックス | フロントエンド更新フラグ検索用 |
| idx_is_new_video | is_new_video | インデックス | 新規動画フラグ検索用 |

## 関連テーブル
このテーブルは他のテーブルとの直接的な外部キー関連はありませんが、video_idやurlを通じて他のテーブルと関連付けられます。

## 備考
- TikTok動画の詳細情報と統計データを格納するマスターテーブルです
- 再生数、いいね数、コメント数などの増加率を追跡します
- 商品やカテゴリの情報も格納し、分析に利用します
