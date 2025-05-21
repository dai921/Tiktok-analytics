//Tiktok 　自アカウント分析のためのモックデータ作成

// TikTokアカウント統計の型定義
export type TikTokStats = {
    followerCount: number;
    followerGrowth: number; // 期間内フォロワー増加数
    likeCount: number;
    likeGrowth: number; // 期間内いいね増加数
    avgViewCount: number;
    viewGrowth: number; // 期間内視聴数増加
    engagementRate: number;
  };
  
  // TikTok動画の型定義
  export type TikTokVideo = {
    id: string;
    title: string;
    createTime: string;
    viewCount: number;
    viewGrowth: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
  };
  
  // モックアカウント統計データを生成する関数
  export function generateMockStats(): TikTokStats {
    // ランダム要素を入れたモックデータ
    const randomMultiplier = 0.7 + Math.random() * 0.6; // 0.7～1.3の範囲でランダム値
    
    return {
      followerCount: Math.floor(12500 * randomMultiplier),
      likeCount: Math.floor(87300 * randomMultiplier),
      avgViewCount: Math.floor(5600 * randomMultiplier),
      engagementRate: 4.2 * randomMultiplier
    };
  }
  
  // モック動画リストを生成する関数
  export function generateMockVideos(count: number = 10, periodInDays: number = 30): TikTokVideo[] {
    const videos: TikTokVideo[] = [];
    const baseStats = generateMockStats();
    
    // 期間に応じた基本視聴回数の係数を設定
    let baseViewMultiplier = 1.0;
    if (periodInDays <= 7) {
      baseViewMultiplier = 0.7; // 7日間は少なめ
    } else if (periodInDays <= 30) {
      baseViewMultiplier = 1.0; // 30日間は標準
    } else {
      baseViewMultiplier = 1.5; // 90日間は多め
    }
    
    // 1日あたりの投稿数の平均を計算（期間が長いほど投稿頻度は下がる）
    const postsPerDay = periodInDays <= 7 ? 0.5 : // 7日間なら2日に1回程度
                       periodInDays <= 30 ? 0.3 : // 30日間なら3日に1回程度
                       0.18; // 90日間なら5-6日に1回程度
    
    // 視聴回数に多様性を持たせるための配列（人気の動画と普通の動画を混在させる）
    const viewMultipliers = [
      2.5, 1.8, 1.3, 1.2, 1.1, 0.9, 0.8, 0.7, 0.6, 0.5, 
      2.2, 1.6, 1.0, 0.9, 0.8, 1.7, 0.6, 0.5, 1.4, 0.7
    ];
    
    for (let i = 0; i < count; i++) {
      // 日付を生成（投稿頻度に応じて間隔を変える）
      const daysInterval = Math.floor(1 / postsPerDay);
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(i * daysInterval * (0.8 + Math.random() * 0.4)));
      
      // 視聴回数の係数を選択
      const viewMultiplierIndex = Math.floor(Math.random() * viewMultipliers.length);
      const viewMultiplier = viewMultipliers[viewMultiplierIndex] * baseViewMultiplier;
      
      // 総視聴回数を計算
      const viewCount = Math.floor(baseStats.avgViewCount * viewMultiplier);
      
      // 指定期間内の視聴増加量を計算
      let viewGrowth;
      const videoAgeInDays = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
      
      if (videoAgeInDays <= periodInDays) {
        // 期間内に投稿された動画の場合、視聴回数のほぼ全てが期間内の増加量
        viewGrowth = Math.floor(viewCount * (0.8 + Math.random() * 0.2));
      } else {
        // 期間より前に投稿された動画の場合
        // 古い動画ほど期間内の増加率は低い（すでに多くの視聴を獲得しているため）
        const ageFactor = Math.max(0.05, Math.min(0.5, periodInDays / videoAgeInDays));
        viewGrowth = Math.floor(viewCount * ageFactor * (0.5 + Math.random() * 1.0));
      }
      
      // 急上昇中の動画をランダムに作成（約10%の確率）
      if (Math.random() < 0.1) {
        viewGrowth = Math.floor(viewCount * (0.5 + Math.random() * 0.5));
      }
      
      // その他の指標を計算
      const likeCount = Math.floor(viewCount * (0.08 + Math.random() * 0.07));
      const commentCount = Math.floor(viewCount * (0.005 + Math.random() * 0.015));
      const shareCount = Math.floor(viewCount * (0.01 + Math.random() * 0.03));
      
      videos.push({
        id: `video_${i+1}_${Date.now() + i}`,
        title: `${getRandomVideoTitle()} #${i+1}`,
        createTime: date.toISOString(),
        viewCount,
        viewGrowth,
        likeCount,
        commentCount,
        shareCount
      });
    }
    
    return videos;
  }
  
  // ランダムな動画タイトルを生成するヘルパー関数
  function getRandomVideoTitle(): string {
    const prefixes = [
      "【TikTok】", "✨", "🔥", "NEW", "HOW TO", "必見", "話題の", "トレンド", "驚き", "これは凄い"
    ];
    
    const topics = [
      "ダンスチャレンジ", "料理レシピ", "DIY", "プログラミング", "旅行", "猫動画", "ライフハック", 
      "メイク術", "筋トレ", "アニメ", "ゲーム", "ファッション", "日常", "カフェ巡り"
    ];
    
    const suffixes = [
      "やってみた", "解説", "まとめ", "初挑戦", "検証", "比較", "紹介", "裏技", "チュートリアル", "反応"
    ];
    
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${randomPrefix}${randomTopic}${randomSuffix}`;
  }
  
  // TikTokユーザープロフィールのモックデータ
  export const mockUserProfile = {
    username: "tiktok_user123",
    displayName: "TikTok Creator",
    bio: "モックデータを使った開発中｜Next.js愛好家｜テッククリエイター",
    profileImageUrl: "https://picsum.photos/seed/profile/200/200",
    followingCount: 521,
    videoCount: 89,
  };
  
  // トレンドハッシュタグのモックデータ
  export const mockTrendingHashtags = [
    { name: "開発者あるある", count: 2500000 },
    { name: "プログラミング", count: 1800000 },
    { name: "Next.js", count: 950000 },
    { name: "テック系", count: 750000 },
    { name: "コードライフ", count: 620000 },
  ];
  
  // モックAPIレスポンスを遅延させてシミュレートする
  export function mockApiDelay<T>(data: T, minDelay: number = 500, maxDelay: number = 1500): Promise<T> {
    const delay = Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
    return new Promise(resolve => setTimeout(() => resolve(data), delay));
  }