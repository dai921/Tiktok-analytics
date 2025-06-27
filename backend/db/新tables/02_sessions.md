# sessions テーブル

## 概要
ユーザーのセッション情報を管理するテーブルです。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| id | VARCHAR(255) | NO | | PRIMARY | セッションの一意識別子（主キー） |
| user_id | VARCHAR(255) | NO | | INDEX | ユーザーID（外部キー） |
| session_token | VARCHAR(255) | NO | | UNIQUE | セッショントークン |
| expires | DATETIME | NO | | - | セッションの有効期限 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | 作成日時 |
| last_used_at | DATETIME | YES | CURRENT_TIMESTAMP | - | 最終使用日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| session_token | session_token | UNIQUE | セッショントークンの一意性 |
| user_id | user_id | INDEX | ユーザーID検索用 |

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| sessions_ibfk_1 | users.id | CASCADE | ユーザーが削除された場合、関連するセッションも削除 |

## 関連Function
### バックエンドAPI
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| auth\router | login | 107~116 | セッションの作成 |
| auth\router | logout | 128~131 | ログアウト時にセッションを削除 |
| main | update_session_midleware | 1003~1006 | セッションの更新 |



## 備考
- ユーザーのログイン状態を管理するセッションテーブルです
- セッショントークンは一意である必要があります
- 有効期限を超えたセッションは自動的に無効になります
- ユーザーが削除された場合、関連するセッションも自動的に削除されます
- 最終使用日時を記録することで、アクティブなセッションを追跡できます
