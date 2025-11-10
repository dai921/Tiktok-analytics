users_video_view_rates テーブル

## 概要
TikTok 動画ごとの視聴率（手入力値）を保存するためのテーブル。  
`users_videos` のレコードに対して、ユーザー単位で 2 秒／6 秒／完了視聴率を保持する。

## テーブル構造

| 列名             | 型            | NULL | デフォルト | 説明                           |
|------------------|---------------|------|------------|--------------------------------|
| video_id         | VARCHAR(64)   | NO   | -          | TikTok 動画 ID                 |
| user_number      | INT           | NO   | -          | users テーブルの user_number   |
| two_second_rate  | DECIMAL(5,2)  | YES  | NULL       | 2 秒視聴率（%）                |
| six_second_rate  | DECIMAL(5,2)  | YES  | NULL       | 6 秒視聴率（%）                |
| full_view_rate   | DECIMAL(5,2)  | YES  | NULL       | 完了視聴率（%）                |
| created_at       | DATETIME      | NO   | CURRENT_TIMESTAMP | 作成日時                     |
| updated_at       | DATETIME      | NO   | CURRENT_TIMESTAMP | 更新日時（自動更新）       |

## インデックス

| インデックス名                           | カラム                     | 備考                      |
|------------------------------------------|----------------------------|---------------------------|
| PRIMARY                                  | video_id, user_number      | 主キー（複合）            |
| idx_users_video_view_rates_user_number   | user_number                | ユーザー単位の抽出を高速化 |

## サンプル DDL

```sql
CREATE TABLE users_video_view_rates (
  video_id        VARCHAR(64)  NOT NULL,
  user_number     INT          NOT NULL,
  two_second_rate DECIMAL(5,2) NULL,
  six_second_rate DECIMAL(5,2) NULL,
  full_view_rate  DECIMAL(5,2) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (video_id, user_number),
  INDEX idx_users_video_view_rates_user_number (user_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
