import { GenreStats, VideoStats } from '../../types/genre';

export const fetchGenreStats = async (
  startDate?: string | null,
  endDate?: string | null,
): Promise<{ data: GenreStats[], dateRange?: { startDate: string, endDate: string } }> => {
  
  try {
    // URLを構築
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/genre-stats`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    
    // パラメータがあれば追加
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('ジャンル統計情報の取得に失敗しました');
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
    console.error('Error fetching genre stats:', error);
    throw error;
  }
};

// 時系列でのジャンルトレンドデータを取得する関数
export const fetchGenreTrends = async (
  startDate: string | null = null, 
  endDate: string | null = null,
  metric: string = 'viewsIncrease',
) => {
  try {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (metric) queryParams.append('metric', metric);

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/genre-trends?${queryParams.toString()}`;
    console.log('API URL:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const jsonData = await response.json();
    
    // レスポンス形式の変換
    return {
      data: jsonData.data || [],
      genres: jsonData.genres || [],
      dateRange: jsonData.date_range ? {
        startDate: jsonData.date_range.start_date,
        endDate: jsonData.date_range.end_date
      } : undefined
    };
  } catch (error) {
    console.error('Error fetching genre trends:', error);
    throw error;
  }
}; 