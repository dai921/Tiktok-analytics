import { CorporateAccountStats, CorporateVideoStats } from '../../types/corporate';

export const fetchCorporateAccountStats = async (
  startDate?: string | null,
  endDate?: string | null,
  metric?: string
): Promise<{ data: CorporateAccountStats[], dateRange?: { startDate: string, endDate: string } }> => {
  
  try {
    // URLを構築
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/corporate-account-stats`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (metric) params.append('metric', metric);

    
    // パラメータがあれば追加
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('企業アカウント統計情報の取得に失敗しました');
    }
    
    const jsonData = await response.json();
    
    // レスポンス形式を検証
    console.log('Corporate API Response:', jsonData);
    
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
    console.error('Error fetching corporate account stats:', error);
    throw error;
  }
}; 