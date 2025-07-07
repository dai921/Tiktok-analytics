# users テーブル

## 概要
アプリケーションを使用しているユーザーの情報を管理するテーブルです。

## テーブル定義

| 列名 | データ型 | NULL | デフォルト | インデックス | 説明 |
|-----|---------|------|----------|------------|------|
| user_number | INT | NO | AUTO_INCREMENT | PRIMARY | アカウントの一意識別子（主キー） |
| id | VARCHAR(255) | NO | | PRIMARY | ユーザーの一意識別子（主キー） |
| email | VARCHAR(255) | NO | | UNIQUE | ユーザーのメールアドレス |
| password | VARCHAR(255) | NO | | - | ユーザーのパスワード |
| is_admin | TINYINT(1) | YES | 0 | - | 管理者フラグ |
| name | VARCHAR(255) | YES | NULL | - | ユーザーの表示名 |
| email_verified | DATETIME | YES | NULL | - | メール認証日時 |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | 作成日時 |
| updated_at | TIMESTAMP | YES | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | - | 更新日時 |
| is_customer | TINYINT(1) | NO | 1 | - | 顧客フラグ |

## インデックス

| インデックス名 | 列名 | 種類 | 説明 |
|--------------|------|------|------|
| PRIMARY | id | PRIMARY | 主キー |
| email | email | UNIQUE | メールアドレスの一意性 |
| idx_user_number | user_number | INDEX | ユーザー番号検索用 |

## 関連Function
### バックエンドAPI
| コード名 | 関数名 | 行数 | 説明 |
|--------------|-------|------|------|
| auth\router | get_current_user | 34~37 | 現在のユーザー情報を取得 |
| auth\router | register | 50~53 | 既に登録されているメールアドレスかチェック |
| auth\router | register | 65~76 | ユーザー情報の登録 |
| auth\router | register | 79~82 | 作成したユーザーの取得 |
| auth\router | login | 90~93 | 作成したユーザーの取得 |
| auth\router | change_password | 175~180 | 管理者が他のユーザーのパスワードを変更する際に使用 |
| auth\router | change_password | 192~195 | 一般ユーザーが他のユーザーのパスワードを変更する際に使用 |
| auth\router | change_password | 208~211 | パスワードをハッシュ化して保存 |
| auth\router | tiktok_auth | 239~250 | ユーザー情報を挿入 |
| auth\router | tiktok_callback | 386~399 | ユーザーのトークン情報を作成 |

## 備考
- アプリケーションのユーザー認証・認可を管理するテーブルです
- メールアドレスは一意である必要があります
- 管理者フラグによって権限管理を行います
- 顧客フラグによってユーザータイプを区別します
