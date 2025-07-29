export interface HashtagVideoStats {
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
  play_count_increase_2d?: number;
  account_type?: string;
}

export interface HashtagStats {
  hashtag: string;
  total_play_count_increase: number;
  videos_over_100k: number;
  total_posts: number;
  top_videos: HashtagVideoStats[];
}

// ハッシュタグトレンド用の型定義
export interface HashtagTrendData {
  date: string;
  hashtag: string;
  value: number;
  metrics: {
    viewsIncrease: number;
    over100kViews: number;
    postCount: number;
  };
}

export interface HashtagTrendResponse {
  data: HashtagTrendData[];
  hashtags: string[];
  topHashtagsByMetric: {
    viewsIncrease: string[];
    over100kViews: string[];
    postCount: string[];
  };
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

// 動画タイプ定義（soundsと同じ）
export type VideoType = 'all' | 'affiliate' | 'corporate' | 'influencer';

// APIレスポンス型
export interface HashtagStatsResponse {
  data: HashtagStats[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
} 