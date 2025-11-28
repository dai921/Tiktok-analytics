import { HashtagStats, HashtagStatsResponse, HashtagTrendResponse, VideoType } from '../../types/hashtag';

// VideoTypeをparent_account_typeの値にマッピングする関数
const mapVideoTypeToParentAccountType = (videoType: VideoType): string | null => {
  const mapping: Record<VideoType, string | null> = {
    all: 'All',
    affiliate: 'アフィ',
    corporate: '企業アカウント',
    influencer: 'インフルエンサー'
  };
  return mapping[videoType];
};

export const fetchHashtagStats = async (
  startDate?: string | null,
  endDate?: string | null,
  metric?: string,
  videoType?: VideoType
): Promise<HashtagStatsResponse> => {
  
  try {
    // URLを構築
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/hashtag-stats`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (metric) params.append('metric', metric);
    
    // VideoTypeをparent_account_typeにマッピングして送信
    if (videoType) {
      const parentAccountType = mapVideoTypeToParentAccountType(videoType);
      if (parentAccountType) {
        params.append('parent_account_type', parentAccountType);
      }
    }
    
    // パラメータがあれば追加
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('ハッシュタグ統計情報の取得に失敗しました');
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
    console.error('Error fetching hashtag stats:', error);
    throw error;
  }
}; 


export const fetchHashtagTrends = async (
  startDate: string | null = null,
  endDate: string | null = null,
  metric: string = 'viewsIncrease',
  videoType?: VideoType,
  limit?: number
): Promise<HashtagTrendResponse> => {
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

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/hashtag-trends?${queryParams.toString()}`;
    console.log('API URL:', url);

    const response = await fetch(url);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text() || `�X�e�[�^�X�R�[�h: ${response.status}`;
      }
      throw new Error(`API�G���[: ${errorDetail}`);
    }

    const jsonData = await response.json();

    return {
      data: jsonData.data || [],
      hashtags: jsonData.hashtags || [],
      topHashtagsByMetric: jsonData.topHashtagsByMetric || {
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
    console.error('�n�b�V���^�O�g�����h�̎擾�G���[:', error);
    throw error;
  }
};
