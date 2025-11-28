import { ProductStats, ProductTrendResponse, VideoStats } from '../../types/product';

export const fetchProductStats = async (
  startDate?: string | null,
  endDate?: string | null,
  genres?: string[],
  metric?: string
): Promise<{ data: ProductStats[]; dateRange?: { startDate: string; endDate: string } }> => {
  const genresToUse = genres || [];

  try {
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/product-stats`;
    const params = new URLSearchParams();

    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (genresToUse.length > 0) params.append('genres', genresToUse.join(','));
    if (metric) params.append('metric', metric);

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('商材データの取得に失敗しました');
    }

    const jsonData = await response.json();

    console.log('API Response:', jsonData);

    if (Array.isArray(jsonData)) {
      return {
        data: jsonData,
      };
    } else if (jsonData.data && jsonData.date_range) {
      return {
        data: jsonData.data,
        dateRange: {
          startDate: jsonData.date_range.start_date,
          endDate: jsonData.date_range.end_date,
        },
      };
    } else if (jsonData.data) {
      return {
        data: jsonData.data,
      };
    } else {
      return {
        data: jsonData,
      };
    }
  } catch (error) {
    console.error('Error fetching product stats:', error);
    throw error;
  }
};

export const fetchProductTrends = async (
  startDate: string | null = null,
  endDate: string | null = null,
  genres: string[] = [],
  metric: string = 'viewsIncrease',
  limit?: number
): Promise<ProductTrendResponse> => {
  try {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (genres.length > 0) queryParams.append('genres', genres.join(','));
    if (metric) queryParams.append('metric', metric);
    if (limit) queryParams.append('limit', String(limit));

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/product-trends?${queryParams.toString()}`;
    console.log('API URL:', url);

    const response = await fetch(url);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = (await response.text()) || `ステータスコード: ${response.status}`;
      }
      throw new Error(`APIエラー: ${errorDetail}`);
    }

    const jsonData = await response.json();

    return {
      data: jsonData.data || [],
      products: jsonData.products || [],
      topProductsByMetric: jsonData.topProductsByMetric || {
        viewsIncrease: [],
        over100kViews: [],
        postCount: [],
      },
      dateRange: jsonData.date_range
        ? {
            startDate: jsonData.date_range.start_date,
            endDate: jsonData.date_range.end_date,
          }
        : undefined,
    };
  } catch (error) {
    console.error('商材トレンドの取得エラー:', error);
    throw error;
  }
};
