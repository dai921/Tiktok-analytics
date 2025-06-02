# データベース構造ドキュメント

## 概要
このドキュメントは、TikTok Analytics Toolで現在使用されているデータベーステーブルのうち、バックエンドのコンテンツを管理するテーブルの構造を説明するものです。各テーブルの詳細情報は個別のファイルに記載されています。

## 旧テーブル一覧

### アカウント管理テーブル
- [11_account_list](./11_account_list.md) - TikTokアカウントリスト

### 動画管理テーブル
- [21_video_url_data](./21_video_url_data.md) - 動画のurlなど基本情報のマスターテーブル
- [22_video_master](./22_video_master.md) - 動画の再生数など日次集計データテーブル(実際は2日おき)

### 動画カテゴリー管理テーブル
- [31_category_master](./31_category_master.md) - 動画カテゴリーマスター
- [33_category_keywords](./33_category_keywords.md) - 動画カテゴリー自動分類用、キーワード&動画カテゴリー

### 商品管理テーブル
- [41_product_master](./41_product_master.md) - 商品マスター
- [43_product_keywords](./43_product_keywords.md) - 商品キーワード
- [45_product_alias](./45_product_alias.md) - 商品別名
- [47_product_alias_keywords](./47_product_alias_keywords.md) - 商品別名キーワード

### フロントエンド表示用非正規テーブル
- [71_frontend_data](./71_frontend_data.md) - フロントエンド表示用データ
- [72_play_count_history](./72_play_count_history.md) - 再生数履歴データ
- [73_trend_analysis](./73_trend_analysis.md) - トレンド分析データ


## 備考
このドキュメントは開発中のものであり、データベース構造は変更される可能性があります。
