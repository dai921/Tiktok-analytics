import { SoundStats, SoundStatsResponse, SoundTrendResponse, VideoType } from '../../types/sound';

// VideoType を parent_account_type にマッピングする関数
const mapVideoTypeToParentAccountType = (videoType: VideoType): string | null => {
  const mapping: Record<VideoType, string | null> = {
    all: 'All',
    affiliate: 'アフィ',
    corporate: '企業アカウント',
    influencer: 'インフルエンサー',
  };
  return mapping[videoType];
};

export const fetchSoundStats = async (
  startDate?: string | null,
  endDate?: string | null,
  metric?: string,
  videoType?: VideoType
): Promise<SoundStatsResponse> => {
  try {
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/sound-stats`;
    const params = new URLSearchParams();

    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (metric) params.append('metric', metric);

    if (videoType) {
      const parentAccountType = mapVideoTypeToParentAccountType(videoType);
      if (parentAccountType) {
        params.append('parent_account_type', parentAccountType);
      }
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('サウンドデータの取得に失敗しました');
    }

    const jsonData = await response.json();
    console.log('API Response:', jsonData);

    if (Array.isArray(jsonData)) {
      return { data: jsonData };
    } else if (jsonData.data && jsonData.date_range) {
      return {
        data: jsonData.data,
        dateRange: {
          startDate: jsonData.date_range.start_date,
          endDate: jsonData.date_range.end_date,
        },
      };
    } else if (jsonData.data) {
      return { data: jsonData.data };
    } else {
      return { data: jsonData };
    }
  } catch (error) {
    console.error('Error fetching sound stats:', error);
    throw error;
  }
};

// 期間指定でサウンドトレンドデータを取得
export const fetchSoundTrends = async (
  startDate: string | null = null,
  endDate: string | null = null,
  metric: string = 'viewsIncrease',
  videoType?: VideoType,
  limit?: number
): Promise<SoundTrendResponse> => {
  try {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (metric) queryParams.append('metric', metric);
    if (limit) queryParams.append('limit', String(limit));

    if (videoType) {
      const parentAccountType = mapVideoTypeToParentAccountType(videoType);
      if (parentAccountType) {
        queryParams.append('parent_account_type', parentAccountType);
      }
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/sound-trends?${queryParams.toString()}`;
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
      sounds: jsonData.sounds || [],
      topSoundsByMetric: jsonData.topSoundsByMetric || {
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
    console.error('サウンドトレンドの取得エラー:', error);
    throw error;
  }
};
