// 循環参照を避けるため、直接定義
export const DEFAULT_VISIBLE_COLUMNS = [
    'thumbnail_url',    // Thumbnail
    'account_type',     // Account Type
    'second_account_type', // Purpose
    'third_account_type',  // Sub Category
    'category',         // Category
    'product',         // Product
    'createdAt',       // Posted At
    'views',           // Views
    'viewsIncrease',   // Views Increase
    'ten_days_increase', // 10-day Views Increase
    'likes',           // Likes
    'comments',        // Comments
    'account_name',    // Account Name
    'hashtags',        // Hashtags
    'audioTitle',      // BGM
  ];
  
  // 表示設定から除外するカラムのリスト
  export const EXCLUDED_COLUMNS = ['description']; // キャプションは表示設定から除外