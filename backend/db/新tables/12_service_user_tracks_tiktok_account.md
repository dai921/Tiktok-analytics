# service_user_tracks_tiktok_account テーブル

## 概要
サービスのユーザーと追跡対象のTikTokアカウント間の多対多関係を管理する中間テーブルです。どのユーザーがどのTikTokアカウントを追跡しているかを記録します。

## テーブル構造

| カラム名 | データ型 | NULL許可 | デフォルト | 説明 |
|---------|---------|---------|-----------|------|
| id | INT | NO | AUTO_INCREMENT | 関連付けの一意識別子（主キー） |
| service_user_id | VARCHAR(255) | NO | - | サービスのユーザーID（外部キー: users.id） |
| tiktok_account_id | INT | NO | - | TikTokアカウントID（外部キー: tiktok_accounts.id） |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時 |

## インデックス

| インデックス名 | カラム | 種類 | 説明 |
|--------------|-------|------|------|
| PRIMARY | id | 主キー | 関連付けの一意識別子 |
| idx_service_user_and_tiktok_account | service_user_id, tiktok_account_id | ユニーク | サービスユーザーとTikTokアカウントの組み合わせは一意 |
| idx_service_user_id | service_user_id | インデックス | サービスユーザーによる検索用 |
| idx_tiktok_account_id | tiktok_account_id | インデックス | TikTokアカウントによる検索用 |

## 関連テーブル

| このテーブルの列名 | テーブル名.列名 | 関連タイプ | 説明 |
|-----------|-----------|-----------|------|
| service_user_id | User.id | 多対多の中間テーブル | 各関連付けは一人のサービスユーザーに属する |
| tiktok_account_id | tiktok_accounts.id | 多対多の中間テーブル | 各関連付けは一つのTikTokアカウントに関連する |

## 特徴

1. **多対多関係の実現**
   - 一人のサービスユーザーが複数のTikTokアカウントを追跡可能
   - 一つのTikTokアカウントは複数のサービスユーザーに追跡される可能性あり

## 変更点
0. 既存テーブルとの関係
   - わからない。なぜこのテーブルが今まで存在しなかったのか謎。

## 備考
- このテーブルは既存のシステムには存在せず、リファクタリングの一環として新規に追加されるものです
- ユーザーインターフェースでは、サービスユーザーがどのTikTokアカウントを追跡するか選択できる機能が必要になります
- 将来的に、追跡統計や利用頻度などの分析データを追加することも検討できます
