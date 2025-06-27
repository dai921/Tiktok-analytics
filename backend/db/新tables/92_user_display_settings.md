# user_display_settings テーブル

## 概要
ユーザーの表示設定を管理するテーブルです。各ユーザーが複数の表示設定（プリセット）を作成・管理できます。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| setting_id | INT | NO | AUTO_INCREMENT | PRIMARY | 表示設定の一意識別子（主キー） |
| email | VARCHAR(255) | NO | | INDEX | ユーザーのメールアドレス（外部キー） |
| setting_name | VARCHAR(100) | NO | | - | 表示設定の名前 |
| is_default | TINYINT(1) | YES | 0 | - | デフォルト設定フラグ |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | TIMESTAMP | YES | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | setting_id | PRIMARY | 主キー |
| idx_email | email | INDEX | メールアドレス検索用 |

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| user_display_settings_ibfk_1 | users.email | CASCADE | ユーザーが削除された場合、関連する表示設定も削除 |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| display_settings/router | save_display_settings | 22~25 | 既存の設定を取得 |
| display_settings/router | save_display_settings | 30~37 | 既存の設定を更新 |
| display_settings/router | save_display_settings | 46~56 | 新しい設定を挿入 |
| display_settings/router | get_display_settings | 91~98 | 表示設定を取得 |
| display_settings/router | update_default_settings | 138~144 | デフォルトの設定を更新 |


## 備考
- ユーザーごとに複数の表示設定（プリセット）を管理できます
- 各表示設定には名前を付けることができ、識別しやすくなっています
- デフォルト設定フラグにより、ユーザーのデフォルト表示設定を指定できます
- ユーザーが削除された場合、関連する表示設定も自動的に削除されます
- 表示設定の詳細（カラム設定など）は`column_settings`テーブルで管理されます
- 作成日時と更新日時が自動的に記録されます
