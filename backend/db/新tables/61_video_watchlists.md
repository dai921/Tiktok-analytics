# video_watchlists.md

## 概要
動画ウォッチリストの管理ページ。ユーザーがウォッチリストに追加した動画idとユーザーの組み合わせを管理する

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 一意のID |
| email | VARCHAR(255) | NO | | - | 登録ユーザーのメールアドレス |
| video_id | VARCHAR(255) | NO | - | 動画ID |
| video_watchlist_name | VARCHAR(100) | NO | - | ウォッチリストの名称 |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| unique_user_video | email,video_id | UNIQUE | 各ユーザーごとにウォッチしている動画は一意 |
| idx_email | email | インデックス | emailによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| video_id | frontend_data.video_id | 多対1の中間テーブル | 各動画は複数のユーザーにウォッチリストに追加される可能性がある |
| email | users.email | 多対1の中間テーブル | 1ユーザーに対して複数の動画がウォッチリストに追加される可能性がある |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| watchlist | add_video_to_watchlist | 54~56 | ビデオウォッチリストにデータ存在するかチェック |

### Crawler処理
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| creare_tables | - | 23~50 | テーブルの作成クエリ |
| repositories | get_favorite_users | 124~139 | クロール対象のアカウントを取得する |
| repositories | get_favorite_users_by_play_count_crawler_id | 161~176 | 再生数のクロール対象のアカウントを取得する |
| repositories | save_favorite_user_nickname | 198~203 | アカウントリストにニックネームを保存する |
| repositories | update_favorite_user_last_crawled | 208~212 | 最終クロール時間をDBに更新する |
| repositories | update_favorite_user_is_alive | 222~226 | アカウントが削除されていたらフラグ付けする |
| repositories | update_favorite_user_is_new_account | 236~240 | 新規追加アカウントをクロールし終わったらフラグを削除する |

### その他Cloud Function
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| sync_account_list | process_account_list | 197~211 | スプレッドシートのアカウントデータをDBに同期する |
| video_master_sync | sync_video_data | 377~382 | アカウントタイプの取得 |
## 特徴

1. **ウォッチリストに登録した動画の一元管理**
   - ユーザー情報、ウォッチリスト名、動画情報を管理

2. **柔軟な動画情報の管理**
   - 動画の追加・変更が容易

