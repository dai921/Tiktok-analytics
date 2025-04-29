import type { VideoData, TikTokVideo, AccountData, CategoryData, HashtagData } from '@/types/dashboard'
import type { PaginatedResponse, FilterQuery, FilterType, ComparisonOperator } from '@/types/dashboard'

// 環境変数からAPI設定を取得
const useBackendApi = process.env.NEXT_PUBLIC_USE_BACKEND_API === 'true';
const apiUrl = process.env.NEXT_PUBLIC_API_URL 

// 期間情報の型定義
export interface PeriodInfo {
  start_date: string;
  end_date: string;
}

// アカウント詳細情報の型定義
export interface BookmarkAccountItem {
  bookmark: {
    bookmark_id: number;
    email: string;
    account_name: string;
    bookmark_name: string | null;
    created_at: string;
    updated_at: string;
  };
  account: {
    account_name: string;
    display_name: string | null;
    account_type: string | null;
    total_videos: number;
    total_plays: number;
    total_likes: number;
    total_comments: number;
    total_saves: number;
    total_play_increase: number;
    total_likes_increase: number;
    total_comments_increase: number;
    total_saves_increase: number;
    profile_image?: string;
    followers_count?: number;
  } | null;
}

// アカウントトレンドデータの型定義
export interface AccountTrendData {
  account_name: string;
  display_name?: string;
  trends: TrendDataPoint[];
}

export interface TrendDataPoint {
  date: string;
  play_count_increase: number;
  likes_count_increase: number;
  comment_count_increase: number;
  save_count_increase: number;
}

// アカウント動画の型定義
export interface AccountVideo {
  video_id: string;
  thumbnail_url?: string;
  url?: string;
  play_count: number;
  likes_count: number;
  comment_count: number;
  save_count: number;
  play_count_increase: number;
  likes_count_increase: number;
  comment_count_increase: number;
  save_count_increase: number;
  created_at: string;
  account_name: string;
  display_name?: string;
}

// レスポンス型定義
type ApiResponse<T> = {
    success: boolean;
    data: T;
    error?: string;
  };

// 期間付きレスポンス型定義
type ApiResponseWithPeriod<T> = ApiResponse<T> & {
  period: PeriodInfo;
};

const handleApiError = (error: unknown): ApiResponse<never> => {
    console.error('API呼び出しエラー:', error);
    return {
      success: false,
      data: [] as never,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  };

/**
 * TikTok動画のURLからvideo_idを抽出する
 */
export function extractVideoIdFromUrl(url: string): string {
  // URLの最後の/以降の文字列を抽出
  const parts = url.split('/');
  return parts[parts.length - 1];
}

/**
 * 動画をウォッチリストに追加する
 */
export async function addVideoToWatchlist(url: string, watchlistName?: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      // URLからvideo_idを抽出
      const videoId = extractVideoIdFromUrl(url);
  
      const response = await fetch(`${apiUrl}/api/watchlist/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url,
          video_id: videoId,
          watchlist_name: watchlistName
        })
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '動画のウォッチリスト追加に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('動画のウォッチリスト追加エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * 動画をウォッチリストから削除する
   */
  export async function removeVideoFromWatchlist(url: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      // URLからvideo_idを抽出
      const videoId = extractVideoIdFromUrl(url);
  
      const response = await fetch(`${apiUrl}/api/watchlist/videos/${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '動画のウォッチリスト削除に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('動画のウォッチリスト削除エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * 動画ウォッチリスト一覧を詳細情報付きで取得する
   */
  export async function getVideoWatchlist(startDate?: string, endDate?: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }

      // クエリパラメータを構築
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      console.log(`API呼び出し: ${apiUrl}/api/watchlist/videos/details${queryString}`);
      console.log(`日付パラメータ: start_date=${startDate || 'なし'}, end_date=${endDate || 'なし'}`);
      
      const response = await fetch(`${apiUrl}/api/watchlist/videos/details${queryString}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'ウォッチリスト取得に失敗しました');
      }

      const data = await response.json();
      console.log('APIからの生データ:', data);
      
      // APIレスポンスの構造を検証
      if (!data || typeof data !== 'object') {
        console.error('予期しないAPI応答フォーマット:', data);
        return { success: false, error: '無効なデータ形式です' };
      }
      
      return {
        success: true,
        data: data.data || [],
        period: data.period || { start_date: startDate, end_date: endDate }
      };
    } catch (error) {
      console.error('ウォッチリスト取得エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * 動画ウォッチリストのトレンドデータを取得する
   */
  export async function getVideoWatchlistTrends(startDate?: string, endDate?: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }

      // クエリパラメータを構築
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      const response = await fetch(`${apiUrl}/api/watchlist/videos/trends${queryString}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'トレンドデータの取得に失敗しました');
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data.data || [],
        period: data.period || { start_date: startDate, end_date: endDate }
      };
    } catch (error) {
      console.error('トレンドデータ取得エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * アカウントをブックマークに追加する
   */
  export async function addAccountToBookmarks(accountName: string, bookmarkName?: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      const response = await fetch(`${apiUrl}/api/watchlist/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          account_name: accountName,
          bookmark_name: bookmarkName
        })
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'アカウントのブックマーク追加に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('アカウントのブックマーク追加エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * アカウントをブックマークから削除する
   */
  export async function removeAccountFromBookmarks(accountName: string) {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      const response = await fetch(`${apiUrl}/api/watchlist/accounts/${encodeURIComponent(accountName)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'アカウントのブックマーク削除に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('アカウントのブックマーク削除エラー:', error);
      return handleApiError(error);
    }
  }
  
  /**
   * アカウントブックマーク一覧を取得する
   */
  export async function getAccountBookmarks() {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      const response = await fetch(`${apiUrl}/api/watchlist/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'ブックマーク取得に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('ブックマーク取得エラー:', error);
      return handleApiError(error);
    }
  }

  /**
   * アカウントブックマーク一覧を詳細情報付きで取得する
   */
  export async function getAccountBookmarksWithDetails(startDate?: string, endDate?: string): Promise<ApiResponseWithPeriod<BookmarkAccountItem[]>> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }

      // クエリパラメータを構築
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      console.log(`API呼び出し: ${apiUrl}/api/watchlist/accounts/details${queryString}`);
      
      const response = await fetch(`${apiUrl}/api/watchlist/accounts/details${queryString}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'アカウント詳細情報の取得に失敗しました');
      }

      const data = await response.json();
      console.log('APIからの生データ:', data);
      
      return {
        success: true,
        data: data.data || [],
        period: data.period || { start_date: startDate || '', end_date: endDate || '' }
      };
    } catch (error) {
      console.error('アカウント詳細情報取得エラー:', error);
      return {
        ...handleApiError(error),
        period: { start_date: startDate || '', end_date: endDate || '' }
      };
    }
  }

  /**
   * アカウントの動画一覧を取得する
   */
  export async function getAccountVideos(accountName: string, startDate?: string, endDate?: string): Promise<ApiResponse<AccountVideo[]>> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }

      // クエリパラメータを構築
      const queryParams = new URLSearchParams();
      queryParams.append('account_name', accountName);
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      console.log(`API呼び出し: ${apiUrl}/api/watchlist/accounts/videos${queryString}`);
      
      const response = await fetch(`${apiUrl}/api/watchlist/accounts/videos${queryString}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'アカウント動画の取得に失敗しました');
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data.data || [],
      };
    } catch (error) {
      console.error('アカウント動画取得エラー:', error);
      return handleApiError(error);
    }
  }

  /**
   * アカウントのトレンドデータを取得する
   */
  export async function getAccountTrends(startDate?: string, endDate?: string): Promise<ApiResponseWithPeriod<AccountTrendData[]>> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }

      // クエリパラメータを構築
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      console.log(`API呼び出し: ${apiUrl}/api/watchlist/accounts/trends${queryString}`);
      
      const response = await fetch(`${apiUrl}/api/watchlist/accounts/trends${queryString}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'アカウントトレンドの取得に失敗しました');
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data.data || [],
        period: data.period || { start_date: startDate || '', end_date: endDate || '' }
      };
    } catch (error) {
      console.error('アカウントトレンド取得エラー:', error);
      return {
        ...handleApiError(error),
        period: { start_date: startDate || '', end_date: endDate || '' }
      };
    }
  }
  
  /**
   * すでにウォッチリストに追加されているか確認する
   */
  export async function checkVideoInWatchlist(url: string) {
    try {
      const result = await getVideoWatchlist();
      if (!result.success) {
        return { success: false, exists: false };
      }
      
      // URLからvideo_idを抽出して比較する場合に備えて
      const videoId = extractVideoIdFromUrl(url);
      const exists = result.data.some((item: any) => 
        item.url === url || item.video_id === videoId
      );
      
      return { success: true, exists };
    } catch (error) {
      console.error('ウォッチリスト確認エラー:', error);
      return { success: false, exists: false };
    }
  }
  
  /**
   * すでにブックマークに追加されているか確認する
   */
  export async function checkAccountInBookmarks(accountName: string) {
    try {
      const result = await getAccountBookmarks();
      if (!result.success) {
        return { success: false, exists: false };
      }
      
      const exists = result.data.some((item: any) => item.account_name === accountName);
      return { success: true, exists };
    } catch (error) {
      console.error('ブックマーク確認エラー:', error);
      return { success: false, exists: false };
    }
  } 