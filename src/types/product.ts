export interface VideoStats {
  url: string;
  thumbnail_url: string | null;
  play_count: number;
  play_count_increase: number;
  likes_count: number;
  likes_count_increase: number;
  comments_count?: number;
  account_name: string;
  display_name: string;
  created_at: string;
  ten_days_increase: number;
}

export interface ProductStats {
  product: string;
  product_category?: string;
  total_play_count_increase: number;
  videos_over_100k: number;
  total_posts: number;
  top_videos: VideoStats[];
}

// 商材トレンド用の型定義
export interface ProductTrendData {
  date: string;
  product: string;
  product_category?: string;
  value: number;
  metrics: {
    viewsIncrease: number;
    over100kViews: number;
    postCount: number;
  };
}

export interface ProductTrendResponse {
  data: ProductTrendData[];
  products: string[];
  topProductsByMetric: {
    viewsIncrease: string[];
    over100kViews: string[];
    postCount: string[];
  };
  dateRange?: {
    startDate: string;
    endDate: string;
  };
} 