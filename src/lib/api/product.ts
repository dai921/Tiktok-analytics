import { ProductStats, VideoStats } from '../../types/product';

export const fetchProductStats = async (
  startDate: string,
  endDate: string
): Promise<ProductStats[]> => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/product-stats?start_date=${startDate}&end_date=${endDate}`
    );

    if (!response.ok) {
      throw new Error('商品統計情報の取得に失敗しました');
    }

    const data = await response.json();

    // レスポンスデータの検証と変換
    const validatedData: ProductStats[] = data.map((item: any) => {
      // top_videosが文字列の場合はJSONとしてパース
      let topVideos = item.top_videos;
      if (typeof topVideos === 'string') {
        try {
          topVideos = JSON.parse(topVideos);
        } catch (e) {
          console.warn(`Failed to parse top_videos for product ${item.product}`, e);
          topVideos = [];
        }
      }

      return {
        product: item.product,
        product_category: item.product_category,
        total_play_count_increase: Number(item.total_play_count_increase),
        videos_over_100k: Number(item.videos_over_100k),
        total_posts: Number(item.total_posts),
        top_videos: Array.isArray(topVideos) ? topVideos : []
      };
    });

    return validatedData;
  } catch (error) {
    console.error('商品統計情報の取得エラー:', error);
    throw error;
  }
}; 