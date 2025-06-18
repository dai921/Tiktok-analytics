# リファクタリング後のデータベース構造ドキュメント

## 概要
このドキュメントは、TikTok Analytics Toolのデータベース構造リファクタリング提案を説明するものです。パフォーマンス向上と保守性改善を目的としています。

## 主な変更点

1. **テーブルの統合と最適化**
   - 関連するデータを適切に統合し、不要な結合操作を減少
   - 時系列データの効率的な管理のためのパーティショニング強化

2. **インデックス戦略の改善**
   - クエリパターンに基づいた効率的なインデックス設計
   - 複合インデックスの最適化

## 未変更点

1. **フロントエンド表示用非正規テーブルのリファクタリング**
   - 71〜73テーブルのリファクタリング
   - これらをリファクタリングすることで、重いクエリの実行回数を削減することができるはず

## 新テーブル一覧

### アカウント管理テーブル
- [11_tiktok_accounts](./11_tiktok_accounts.md) - TikTokアカウントのマスターテーブル
- [12_service_user_tracks_tiktok_account](./12_service_user_tracks_tiktok_account.md) - 「サービスユーザーが追跡対象として登録したTikTokアカウント」という関係の中間テーブル
- [13_tiktok_account_categories](./13_tiktok_account_categories.md) - 「TikTokアカウントカテゴリー」という独自指標のマスターテーブル
- [14_tiktok_account_features_tiktok_account_category](./14_tiktok_account_features_tiktok_account_category.md) - 「TikTokアカウントが分類されるTikTokアカウントカテゴリー」という関係の中間テーブル

### 動画管理テーブル
- [21_videos](./21_videos.md) - 動画のurlなど基本情報のマスターテーブル
- [22_video_metrics](./22_video_metrics.md) - 動画の再生数など日次集計データテーブル

### 動画カテゴリー管理テーブル
- [31_video_categories](./31_video_categories.md) - 動画カテゴリーのマスターテーブル
- [32_video_features_video_category](./32_video_features_video_category.md) - 「動画が分類される動画カテゴリー」という関係の中間テーブル

### 商品管理テーブル
- [41_products](./41_products.md) - 商品のマスターテーブル
- [42_video_promotes_product](./42_video_promotes_product.md) - 「動画が広告している商品」という関係の中間テーブル

### クローラー処理管理テーブル
- [51_crawler_accounts](./51_crawler_accounts.md) - クローラー処理に使うTiktokアカウントの管理テーブル
- [52_play_count_crawler_accounts](./52_play_count_crawler_accounts.md) - 再生数クローラー処理に使うTiktokアカウントの管理テーブル


### フロントエンド表示用非正規テーブル
- [71_frontend_data](./71_frontend_data.md) - フロントエンド表示用データ
- [72_play_count_history](./72_play_count_history.md) - 再生数履歴データ
- [73_trend_analysis](./73_trend_analysis.md) - トレンド分析データ

## 移行計画
各テーブルのドキュメントには、現行テーブルからのデータ移行方法も記載しています。

## 期待される効果
- APIレスポンス時間の短縮（特に商品統計・トレンド分析）
- データベース容量の最適化
- メンテナンス性の向上
- スケーラビリティの改善
