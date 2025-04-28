import { ProductStats, VideoStats } from '../../types/product';

export const fetchProductStats = async (
  startDate?: string | null,
  endDate?: string | null
): Promise<{ data: ProductStats[], dateRange?: { startDate: string, endDate: string } }> => {
  try {
    // URLを構築（パラメータがある場合のみクエリパラメータを追加）
    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/product-stats`;
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
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
    console.error('商品統計情報の取得エラー:', error);
    throw error;
  }
}; 