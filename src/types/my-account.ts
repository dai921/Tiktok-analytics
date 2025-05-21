/**
 * TikTok アカウント統計情報の型定義
 */
export interface TikTokStats {
    /** フォロワー総数 */
    followerCount: number;
    /** 期間内のフォロワー増加数 */
    followerGrowth: number;
    /** いいね総数 */
    likeCount: number;
    /** 期間内のいいね増加数 */
    likeGrowth: number;
    /** 平均視聴回数/動画 */
    avgViewCount: number;
    /** 期間内の総視聴数増加 */
    viewGrowth: number;
    /** エンゲージメント率（%） */
    engagementRate: number;
    /** アカウントタイプ */
    account_type?: string;
    /** 主なビデオタイプ（アフィリエイトの場合） */
    mainly_video_type?: string;
    /** 総再生数 - フロントエンドで計算 */
    totalPlayCount?: number;
    /** 総コメント数 - フロントエンドで計算 */
    commentCount?: number;
    /** 総保存数 - フロントエンドで計算 */
    saveCount?: number;
    /** 動画数 - フロントエンドで計算 */
    videosCount?: number;
  }
  
  /**
   * TikTok 動画情報の型定義
   */
  export interface TikTokVideo {
    /** 動画ID */
    id: string;
    /** 動画タイトル/説明 */
    title: string;
    /** 作成日時 */
    createTime: string;
    /** 視聴回数 */
    viewCount: number;
    /** 期間内の視聴回数増加 */
    viewGrowth: number;
    /** いいね数 */
    likeCount: number;
    /** コメント数 */
    commentCount: number;
    /** シェア数 */
    shareCount: number;
    /** サムネイルURL */
    thumbnailUrl?: string;
    /** 動画URL */
    videoUrl?: string;
  } 