# notification_receipts テーブル

## 概要
通知が各ユーザーへ配信された履歴と既読状態を保持する明細テーブル。未読件数の計測や既読率集計に利用する。

## テーブル定義

| カラム名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|---------|---------|------|-----------|------------|------|
| id | BIGINT | NO | AUTO_INCREMENT | PRIMARY | 履歴ID（PK） |
| notification_id | INT | NO | - | FOREIGN | 通知ID（notifications.id） |
| user_id | VARCHAR(255) | NO | - | FOREIGN | 配信先ユーザーID（users.id） |
| delivered_at | DATETIME | NO | - | - | 配信扱い日時（通常は notifications.sent_at を複写） |
| read_at | DATETIME | YES | NULL | INDEX | 既読日時 |
| is_read | TINYINT(1) | NO | 0 | INDEX | 既読フラグ |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | PRIMARY | PK |
| uk_notification_user | notification_id, user_id | UNIQUE | 重複配信の防止 |
| idx_user_is_read | user_id, is_read | INDEX | ユーザー未読件数/一覧取得用 |
| idx_read_at | read_at | INDEX | 既読日時での検索用 |

## 関連テーブル

| 対象テーブル | カラム | 関係 | 説明 |
|-----------|-----------|------|------|
| notifications | notifications.id | 多対1 | 配信元の通知 |
| users | users.id | 多対1 | 配信先ユーザー |

## 想定利用フロー
1. 配信確定後、notifications の1件に対し全ユーザー分を INSERT（delivered_at を配信時刻でセット）。  
2. ユーザーが閲覧したら対象行を UPDATE し is_read=1, read_at=NOW()。  
3. 未読件数/一覧は `WHERE user_id=? AND is_read=0` で取得（idx_user_is_read を使用）。

## 備考
- INSERT はユニークキーにより多重投入を防止。必要に応じて INSERT IGNORE や ON DUPLICATE KEY UPDATE を利用。
- 予約配信時はバッチ/ジョブで notifications.sent_at 反映後に本テーブルへの投入を実施する。
