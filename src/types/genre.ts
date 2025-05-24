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
  }
  
  export interface GenreStats {
    genre: string;
    total_play_count_increase: number;
    videos_over_100k: number;
    total_posts: number;
    top_videos: VideoStats[];
  }
  
  // 商材トレンド用の型定義
  export interface GenreTrendData {
    date: string;
    genre: string;
    value: number;
    metrics: {
      viewsIncrease: number;
      over100kViews: number;
      postCount: number;
    };
  }
  
  export interface GenreTrendResponse {
    data: GenreTrendData[];
    genres: string[];
    topGenresByMetric: {
      viewsIncrease: string[];
      over100kViews: string[];
      postCount: string[];
    };
    dateRange?: {
      startDate: string;
      endDate: string;
    };
  } 