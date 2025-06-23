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
| watchlist | add_video_to_watchlist | 62~68 | テーブルにデータを更新 |
| watchlist | add_video_to_watchlist | 76~81 | テーブルにデータを挿入 |
| watchlist | remove_video_from_watchlist | 128 | ビデオウォッチリストにデータ存在するかチェック |
| watchlist | remove_video_from_watchlist | 138~140 | ビデオウォッチリストから削除 |
| watchlist | get_video_watchlist | 167 | ビデオウォッチリストの一覧を取得 |
| watchlist | get_video_watchlist_with_details | 234~249 | ウォッチリストの動画情報を結合して取得 |
| watchlist | get_video_watchlist_trends | 388~392 | ウォッチリストの動画のエンゲージメントの推移を取得 |

## 特徴

1. **ウォッチリストに登録した動画の一元管理**
   - ユーザー情報、ウォッチリスト名、動画情報を管理

2. **柔軟な動画情報の管理**
   - 動画の追加・変更が容易

