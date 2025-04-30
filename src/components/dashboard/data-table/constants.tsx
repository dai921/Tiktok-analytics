// 循環参照を避けるため、直接定義
export const DEFAULT_VISIBLE_COLUMNS = [
    'thumbnail_url',    // サムネイル
    'account_type',     // アカウントタイプ
    'category',         // 動画ジャンル
    'product',         // 商品名
    'createdAt',       // 投稿日
    'views',           // 再生数
    'viewsIncrease',   // 再生増加数
    'ten_days_increase', // 10日間再生増加数
    'likes',           // いいね数
    'comments',        // コメント数
    'account_name',    // アカウント名
    'hashtags',        // ハッシュタグ
    'audioTitle',      // BGM
  ];
  
  // 表示設定から除外するカラムのリスト
  export const EXCLUDED_COLUMNS = ['description']; // キャプションは表示設定から除外