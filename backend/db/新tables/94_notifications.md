# notifications テーブル

## 概要
管理者が作成する通知コンテンツと配信状態を保持するマスターテーブル。下書き・予約・送信・アーカイブのライフサイクルを管理する。

## テーブル定義

| カラム名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|---------|---------|------|-----------|------------|------|
| id | INT | NO | AUTO_INCREMENT | PRIMARY | 通知ID（PK） |
| title | VARCHAR(255) | NO | - | - | 通知タイトル |
| body | TEXT | NO | - | - | 通知本文 |
| target_scope | ENUM('all') | NO | 'all' | - | 配信対象範囲（現状は全員固定。将来セグメント配信拡張前提） |
| status | ENUM('draft','scheduled','sent','archived') | NO | 'draft' | INDEX | 配信状態 |
| scheduled_at | DATETIME | YES | NULL | - | 予約配信時刻 |
| sent_at | DATETIME | YES | NULL | INDEX | 実際の配信時刻 |
| created_by | VARCHAR(255) | NO | - | INDEX | 作成者（users.id） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | PRIMARY | PK |
| idx_status | status | INDEX | 状態での検索用 |
| idx_sent_at | sent_at | INDEX | 配信日時ソート/検索用 |
| idx_created_by | created_by | INDEX | 作成者別検索用 |

## 関連テーブル

| 対象テーブル | カラム | 関係 | 説明 |
|-----------|-----------|------|------|
| users | users.id | 参照 | created_by が参照する作成者 |
| notification_receipts | notification_receipts.notification_id | 1対多 | 通知ごとの配信・既読明細 |

## 想定利用フロー
1. 下書き保存時に status='draft' で INSERT。
2. 配信確定時に status='sent', sent_at=NOW() に更新。
3. 上記と同時に notification_receipts へ全ユーザー分を一括 INSERT（配信対象が全体の場合）。

## 備考
- 全体配信のみ対応だが、target_scope を拡張すれば将来のセグメント配信にも対応可能。
- 予約配信は scheduled_at に時刻を入れ、ジョブが到達時に送信処理を行う。
