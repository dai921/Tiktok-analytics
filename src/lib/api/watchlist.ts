import type { VideoData, TikTokVideo, AccountData, CategoryData, HashtagData } from '@/types/dashboard'
import type { PaginatedResponse, FilterQuery, FilterType, ComparisonOperator } from '@/types/dashboard'

// 環境変数からAPI設定を取得
const useBackendApi = process.env.NEXT_PUBLIC_USE_BACKEND_API === 'true';
const apiUrl = process.env.NEXT_PUBLIC_API_URL 
// レスポンス型定義
type ApiResponse<T> = {
    success: boolean;
    data: T;
    error?: string;
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
   * 動画ウォッチリスト一覧を取得する
   */
  export async function getVideoWatchlist() {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('認証情報がありません');
      }
  
      const response = await fetch(`${apiUrl}/api/watchlist/videos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'ウォッチリスト取得に失敗しました');
      }
  
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('ウォッチリスト取得エラー:', error);
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