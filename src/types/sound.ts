export interface SoundVideoStats {
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

export interface SoundStats {
  sound_title: string;
  sound_artist?: string;
  sound_id?: string;
  total_play_count_increase: number;
  videos_over_100k: number;
  total_posts: number;
  top_videos: SoundVideoStats[];
}

// 音楽トレンド用の型定義
export interface SoundTrendData {
  date: string;
  sound: string;
  value: number;
  metrics: {
    viewsIncrease: number;
    over100kViews: number;
    postCount: number;
  };
}

export interface SoundTrendResponse {
  data: SoundTrendData[];
  sounds: string[];
  topSoundsByMetric: {
    viewsIncrease: string[];
    over100kViews: string[];
    postCount: string[];
  };
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

// 動画タイプ定義（「すべての動画」を削除）
export type VideoType = 'affiliate' | 'corporate' | 'influencer';

// APIレスポンス型
export interface SoundStatsResponse {
  data: SoundStats[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
} 