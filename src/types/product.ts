export interface VideoStats {
  url: string;
  thumbnail_url: string | null;
  play_count_increase: number;
  account_name: string;
  display_name: string;
}

export interface ProductStats {
  product: string;
  total_play_count_increase: number;
  videos_over_100k: number;
  total_posts: number;
  top_videos: VideoStats[];
} 