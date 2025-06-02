# videos テーブル

## 概要
TikTok動画の基本情報を管理するマスターテーブルです。動画の識別情報、メタデータ、コンテンツ情報を格納します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | レコードの一意識別子（主キー） |
| tiktok_account_id | INT | NO | - | 投稿アカウントID（外部キー: tiktok_accounts.id） |
| official_id | VARCHAR(50) | NO | - | TikTok公式の動画ID（ユニーク） |
| video_url | VARCHAR(255) | NO | - | 動画のURL（ユニーク） |
| description | TEXT | YES | NULL | 動画の説明文 |
| cover_image_url | VARCHAR(255) | YES | NULL | サムネイル画像URL |
| duration | INT UNSIGNED | YES | NULL | 動画の長さ（秒） |
| post_time | DATETIME | YES | NULL | 投稿日時 |
| hashtags | TEXT | YES | NULL | ハッシュタグ（JSON形式） |
| music_id | VARCHAR(50) | YES | NULL | 使用BGMのID |
| music_title | VARCHAR(255) | YES | NULL | 使用BGMのタイトル |
| music_artist | VARCHAR(255) | YES | NULL | 使用BGMのアーティスト |
| content_type | VARCHAR(20) | NO | '動画' | コンテンツタイプ（動画、写真等） |
| is_new | TINYINT(1) | NO | 1 | 新規動画フラグ |
| needs_update | TINYINT(1) | NO | 1 | 更新必要フラグ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 登録日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | レコードの一意識別子 |
| idx_official_id | official_id | ユニーク | 動画IDは一意 |
| idx_tiktok_account_id | tiktok_account_id | インデックス | アカウントによる検索用 |
| idx_post_time | post_time | インデックス | 投稿日時による検索用 |
| idx_content_type | content_type | インデックス | コンテンツタイプによる検索用 |
| idx_is_new | is_new | インデックス | 新規動画フラグによる検索用 |
| idx_needs_update | needs_update | インデックス | 更新必要フラグによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| tiktok_account_id | tiktok_accounts.id | 多対一 | 各動画は一つのTikTokアカウントに属する |
| id | video_metrics.video_id | 一対多 | 一つの動画は複数の時系列メトリクスを持つ |
| id | video_features_video_category.video_id | 多対多の中間テーブル | 一つの動画は複数のカテゴリに関連付けられる可能性がある |
| id | video_promotes_product.video_id | 多対多の中間テーブル | 一つの動画は複数の商品に関連付けられる可能性がある |

## 変更点
1. **テーブル名やカラムの整理などの大きな変更**
この新テーブルは概ね旧`video_url_data`に近い役割だが、他のテーブルとまとめて大きな変更が入っている。
詳しくは`20_videos系テーブルの大きな変更.md`を参照。
   
2. **カラム構造の最適化**
   - `tiktok_account_id`を追加して正規化
   - `video_id`を`official_id`に変更(混乱を防ぐため)
     - BIGINTからVARCHAR(50)に統一（tiktokの動画IDは文字列なので）
   - `created_at`を`post_time`に変更(投稿日時を表すカラムなのに誤って`created_at`という名前になっていた)
   - 使ってないカラムを削除
      - `file_path`と`folder_path`と`image_count`は使ってない。AIが勝手に作った列だよね？
   - その他重複するメタデータを整理
   - その他命名規則の統一（snake_case）



## 備考
- 動画の基本情報とメタデータを格納するマスターテーブル
- 時系列で変化するメトリクス（再生数、いいね数など）は別テーブルに分離
- 商品やカテゴリの関連付けも別テーブルで管理し、多対多関係を実現
