# column_settings テーブル

## 概要
ユーザーの表示設定におけるカラム設定を管理するテーブルです。各表示設定に対して、どのカラムを表示するか、どの順序で表示するかを管理します。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| column_setting_id | INT | NO | AUTO_INCREMENT | PRIMARY | カラム設定の一意識別子（主キー） |
| setting_id | INT | NO | | INDEX | 表示設定ID（外部キー） |
| column_name | VARCHAR(50) | NO | | - | カラム名 |
| is_visible | TINYINT(1) | YES | 1 | - | カラムの表示/非表示フラグ |
| display_order | INT | NO | | - | カラムの表示順序 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | TIMESTAMP | YES | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | column_setting_id | PRIMARY | 主キー |
| idx_setting_id | setting_id | INDEX | 表示設定ID検索用 |

## 外部キー制約

| 制約名 | 参照先テーブル.列名 | 削除時の動作 | 説明 |
|--------|------------------|-------------|------|
| column_settings_ibfk_1 | user_display_settings.setting_id | CASCADE | 表示設定が削除された場合、関連するカラム設定も削除 |

## 関連Function
### Backend API
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| display_settings/router | save_display_settings | 40~43 | 既存のカラム設定を削除 |
| display_settings/router | save_display_settings | 64~77 | カラム設定を保存 |
| display_settings/router | get_display_settings | 104~112 | カラム設定を取得 |

## 備考
- ユーザーの表示設定におけるカラムレベルの設定を管理します
- 各表示設定に対して複数のカラム設定を持つことができます
- カラムの表示/非表示と表示順序を個別に管理できます
- 表示設定が削除された場合、関連するカラム設定も自動的に削除されます
- デフォルトでは全てのカラムが表示状態（is_visible = 1）で設定されます
- 表示順序は数値が小さいほど先に表示されます
