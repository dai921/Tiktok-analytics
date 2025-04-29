import { ProductStats, VideoStats } from '../../types/product';

export const fetchProductStats = async (
  startDate?: string | null,
  endDate?: string | null,
  genres?: string[],
  metric?: string
): Promise<{ data: ProductStats[], dateRange?: { startDate: string, endDate: string } }> => {
  const genresToUse = genres || [];
  
  try {
    // URLを構築
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/product-stats`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (genresToUse.length > 0) params.append('genres', genresToUse.join(','));
    if (metric) params.append('metric', metric);
    
    // パラメータがあれば追加
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('商品統計情報の取得に失敗しました');
    }
    
    const jsonData = await response.json();
    
    // レスポンス形式を検証
    console.log('API Response:', jsonData);
    
    // 互換性のために両方のレスポース形式に対応
    if (Array.isArray(jsonData)) {
      // 古い形式: 配列として返される
      return {
        data: jsonData
      };
    } else if (jsonData.data && jsonData.date_range) {
      // 新しい形式: { data, date_range } オブジェクト
      return {
        data: jsonData.data,
        dateRange: {
          startDate: jsonData.date_range.start_date,
          endDate: jsonData.date_range.end_date
        }
      };
    } else if (jsonData.data) {
      // date_rangeなしの形式
      return {
        data: jsonData.data
      };
    } else {
      // フォールバック: 直接データとして扱う
      return {
        data: jsonData
      };
    }
  } catch (error) {
    console.error('Error fetching product stats:', error);
    throw error;
  }
};

// 時系列での商材トレンドデータを取得する関数
export const fetchProductTrends = async (
  startDate: string | null = null, 
  endDate: string | null = null,
  genres: string[] = [],
  metric: string = 'viewsIncrease'
) => {
  try {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (genres.length > 0) queryParams.append('genres', genres.join(','));
    if (metric) queryParams.append('metric', metric);

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/product-trends?${queryParams.toString()}`;
    console.log('API URL:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      // エラーレスポンスの内容を取得
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text() || `ステータスコード: ${response.status}`;
      }
      throw new Error(`APIエラー: ${errorDetail}`);
    }
    
    const jsonData = await response.json();
    
    // レスポンス形式の変換
    return {
      data: jsonData.data || [],
      products: jsonData.products || [],
      topProductsByMetric: jsonData.topProductsByMetric || {
        viewsIncrease: [],
        over100kViews: [],
        postCount: []
      },
      dateRange: jsonData.date_range ? {
        startDate: jsonData.date_range.start_date,
        endDate: jsonData.date_range.end_date
      } : undefined
    };
  } catch (error) {
    console.error('商材トレンドの取得エラー:', error);
    throw error;
  }
}; 