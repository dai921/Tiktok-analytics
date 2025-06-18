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

## 関連Function

| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| product-scoring | update_product_in_db | 223 | Geminiで判定したprodut情報を更新 |
| frontend_data_update | update_frontend_from_master | 43~49 | 更新対象外の動画の増加数を0にする |
| frontend_data_update | update_frontend_from_master | 60~66 | 新アカウントの場合は直近2日間以外の動画の増加数を0にする |
| frontend_data_update | update_frontend_from_master | 83~88 | ずれていた場合の調整、2日以内に投稿されていたデータは再生数=再生増加数にする |
| frontend_data_update | update_frontend_from_master | 102~145 | frontend_dataテーブルにvideo_masterテーブルのデータを同期 |
| frontend_data_update | update_frontend_from_master | 162~174 | 残りの更新対象動画数を取得 |
| update_needs_flags | update_needs_flags | 44~51 | video_light_raw_dataの更新フラグを設定 |
| update_needs_flags | update_needs_flags | 76~87 | 前回更新時に使用した更新フラグを全て0にする |
| update_needs_flags | update_needs_flags | 96~100 | 新規追加ビデオフラグを全て0にする |
| video_master_sync | sync_video_data | 321~331 | 増加数を計算するために前回更新時の数値データを取得する |
| video_master_sync | sync_video_data | 442~474 | クロールした動画データをvideo_masterに挿入/更新 |
| video_master_sync | sync_play_count | 523~527 | 再生増加数を計算するために前回更新時の再生数を取得する |
| video_master_sync | sync_play_count | 545~555 | クロールした再生数データをvideo_masterに挿入/更新 |
| manual_sync_master | sync_video_data | 456~466 | 増加数を計算するために前回更新時の数値データを取得する |
| manual_sync_master | sync_video_data | 547~581 | クロールした動画データをvideo_masterに挿入/更新 |
| manual_sync_video_play_count | sync_play_count | 215~221 | 再生増加数を計算するために前回更新時の再生数を取得する |
| manual_sync_video_play_count | sync_play_count | 545~555 | クロールした再生数データをvideo_masterに挿入/更新 |
| update_all_categories | process_update_all_categories | 116~123 | 分析用のビデオタイトルデータを取得 |
| update_all_categories | process_update_all_categories | 166~172 | update後のアカウントタイプ、動画ジャンル、商品名を更新 |
| update_all_categories | process_update_all_categories | 194~199 | 残りの更新対象動画数を取得 |


## 備考
- TikTok動画の詳細情報と統計データを格納するマスターテーブルです
- 再生数、いいね数、コメント数などの増加率を追跡します
- 商品やカテゴリの情報も格納し、分析に利用します
