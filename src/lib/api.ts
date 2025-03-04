import { TikTokVideo, FilterOptions, SortOptions, ApiResponse, AccountData, CategoryData, HashtagData } from '../types/dashboard';
import type { VideoData, PaginatedResponse, FilterQuery, FilterType } from '@/types/dashboard'

// 環境変数からAPI設定を取得
const useBackendApi = process.env.NEXT_PUBLIC_USE_BACKEND_API === 'true';
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * TikTok動画データを取得する
 */
export const fetchVideosFromBackend = async (options: {
  page?: number;
  limit?: number;
  accountName?: string;
  category?: string;
  hashtag?: string;
  startDate?: string;
  endDate?: string;
  minPlayCount?: number;
  minLikesCount?: number;
  sortBy?: string;
  sortOrder?: string;
}) => {
  const {
    page = 1,
    limit = 50,
    accountName,
    category,
    hashtag,
    startDate,
    endDate,
    minPlayCount,
    minLikesCount,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = options;

  // クエリパラメータの構築
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort_by: sortBy,
    sort_order: sortOrder
  });

  // オプションパラメータの追加
  if (accountName) params.append('account_name', accountName);
  if (category) params.append('category', category);
  if (hashtag) params.append('hashtag', hashtag);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (minPlayCount) params.append('min_play_count', minPlayCount.toString());
  if (minLikesCount) params.append('min_likes_count', minLikesCount.toString());

  try {
    console.log(`Fetching from backend API: ${apiUrl}/videos?${params}`);
    const response = await fetch(`${apiUrl}/videos?${params}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail?.error || '動画データの取得に失敗しました');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}

// バックエンドAPIのレスポンスを既存の形式に変換する関数
const adaptApiResponse = (apiResponse: any) => {
  return {
    videos: apiResponse.data.map((video: any) => ({
      url: video.url,
      thumbnail: video.thumbnail,
      createdAt: video.created_at,
      playCount: video.play_count,
      likesCount: video.likes_count,
      commentCount: video.comment_count,
      accountName: video.account_name,
      audioInfo: video.audioInfo || video.music_info,
      hashtags: video.hashtags,
      caption: video.caption,
      category: video.category
    })),
    totalCount: apiResponse.total,
    pageCount: apiResponse.totalPages,
    currentPage: apiResponse.currentPage
  };
}

// 既存のfetchVideos関数を更新して、APIの切り替えに対応
export const fetchVideos = async (
  page: number = 1,
  limit: number = 10,
  filters?: FilterOptions,
  sort?: SortOptions
): Promise<ApiResponse<TikTokVideo>> => {
  if (useBackendApi) {
    try {
      // バックエンドAPIを使用
      const apiResponse = await fetchVideosFromBackend({
        page,
        limit,
        accountName: filters?.accountName,
        category: filters?.category,
        hashtag: filters?.hashtag,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        minPlayCount: filters?.minPlayCount,
        minLikesCount: filters?.minLikesCount,
        sortBy: sort?.field,
        sortOrder: sort?.order
      });
      
      return adaptApiResponse(apiResponse);
    } catch (error) {
      console.error('Error fetching videos from backend:', error);
      throw error;
    }
  } else {
  try {
    // クエリパラメータの構築
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    // フィルターの追加
    if (filters) {
      if (filters.accountName) params.append('account_name', filters.accountName);
      if (filters.category) params.append('category', filters.category);
      if (filters.hashtag) params.append('hashtag', filters.hashtag);
      if (filters.minPlayCount) params.append('min_play_count', filters.minPlayCount.toString());
      if (filters.minLikesCount) params.append('min_likes_count', filters.minLikesCount.toString());
      if (filters.searchQuery) params.append('search_query', filters.searchQuery);
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
    }

    // ソートの追加
    if (sort) {
      params.append('sort_by', sort.field);
      params.append('sort_order', sort.order);
    } else {
      // デフォルトのソート順
      params.append('sort_by', 'created_at');
      params.append('sort_order', 'desc');
    }

    // APIリクエスト
      const response = await fetch(`${apiUrl}/api/videos?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching videos:', error);
    throw error;
    }
  }
}

/**
 * アカウント一覧を取得する
 */
export async function fetchAccounts(): Promise<ApiResponse<AccountData>> {
  try {
    const response = await fetch(`${apiUrl}/api/accounts`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
}

/**
 * カテゴリー一覧を取得する
 */
export interface CategoriesResponse {
  success: boolean;
  categories: CategoryData[];
  products: { product: string; video_count: number }[];
  category_products: Record<string, { product: string; video_count: number }[]>;
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  try {
    const response = await fetch(`${apiUrl}/api/categories`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}

/**
 * ハッシュタグ一覧を取得する
 */
export async function fetchHashtags(limit: number = 50): Promise<ApiResponse<HashtagData>> {
  try {
    const response = await fetch(`${apiUrl}/api/hashtags?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching hashtags:', error);
    throw error;
  }
}

// カラム名のマッピング（sheets.tsと同じ定義）
export const COLUMN_MAP: Record<string, string> = {
  'views': '再生数',
  'likes': 'いいね数',
  'comments': 'コメント数',
  'accountName': 'アカウント名',
  'category': 'カテゴリ',
  'hashtags': 'ハッシュタグ',
  'description': '説明',
  'audioTitle': '音声タイトル',
  'url': 'URL',
  'videoId': '動画ID',
  'thumbnail': 'カバー画像',
  'authorName': '作成者表示名',
  'shares': '共有数',
  'saves': '保存数',
  'createdAt': '作成日時',
  'duration': '動画時間(秒)',
  'isViral': '10万再生以上',
  'prevViews': '前回再生数',
  'viewsIncrease': '再生数伸び',
  'prevLikes': '前回いいね数',
  'likesIncrease': 'いいね数伸び',
  'product': '商材',
  'audioId': '音声ID',
  'artist': 'アーティスト'
}

// フィルタータイプの変換関数
const convertFilterType = (type: FilterType, field: string): string => {
  console.log('Converting filter type for API:', { type, field });

  // 日付フィールドの場合
  if (field === 'createdAt') {
    switch (type) {
      case 'after': return 'after';
      case 'before': return 'before';
      default: return 'equal';
    }
  }

  // 数値フィールドの場合
  return (() => {
    switch (type) {
      case 'greater': return 'greater';
      case 'less': return 'less';
      case 'sort': return 'sort';
      default: return 'equal';
    }
  })();
}

// フィールド名のマッピング（フロントエンド → バックエンド）
const mapFieldToApiField = (field: string): string => {
  const mapping: Record<string, string> = {
    'views': 'play_count',
    'likes': 'likes_count',
    'comments': 'comment_count',
    'createdAt': 'created_at',
    'accountName': 'account_name',
    'description': 'caption'
  };
  
  return mapping[field] || field;
}

// TikTokVideo型からVideoData型への変換
const convertToVideoData = (video: TikTokVideo): VideoData => {
  return {
    id: video.url.split('/').pop() || '',
    url: video.url,
    videoId: video.url.split('/').pop() || '',
    accountName: video.accountName,
    thumbnail: video.thumbnail ? {
      valueType: 'IMAGE',
      url: video.thumbnail
    } : null,
    authorName: video.accountName, // アカウント名を作成者表示名として代用
    description: video.caption,
    likes: video.likesCount,
    views: video.playCount,
    comments: video.commentCount,
    shares: 0, // バックエンドに実装がなければデフォルト値
    saves: 0,  // バックエンドに実装がなければデフォルト値
    createdAt: video.createdAt,
    hashtags: video.hashtags || [],
    duration: 0, // バックエンドに実装がなければデフォルト値
    isViral: video.playCount > 100000,
    prevFetchDate: '', // バックエンドに実装がなければデフォルト値
    currentFetchDate: new Date().toISOString(),
    prevViews: 0,  // バックエンドに実装がなければデフォルト値
    viewsIncrease: 0,  // バックエンドに実装がなければデフォルト値
    prevLikes: 0,  // バックエンドに実装がなければデフォルト値
    likesIncrease: 0,  // バックエンドに実装がなければデフォルト値
    product: '',  // バックエンドに実装がなければデフォルト値
    category: video.category || '',
    audioId: typeof video.audioInfo === 'object' ? (video.audioInfo?.title || '') : '',
    audioTitle: typeof video.audioInfo === 'object' ? (video.audioInfo?.title || '') : 
               (typeof video.music_info === 'object' ? (video.music_info?.title || '') : ''),
    artist: '', // バックエンドに実装がなければデフォルト値
    predictedViews: 0 // バックエンドに実装がなければデフォルト値
  };
}

// バックエンドAPIからデータを取得する関数（sheets.tsのgetSheetDataと同じシグネチャ）
export async function getSheetData(page: number = 1, filters?: Record<string, FilterQuery>): Promise<{
  success: boolean
  data: VideoData[]
  currentPage: number
  totalPages: number
}> {
  try {
    console.log('=== API Filter Debug ===');
    console.log('Raw filters:', filters);

    // クエリパラメータの構築
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '50' // 適切な値に設定
    });

    // フィルターの処理
    if (filters) {
      Object.entries(filters).forEach(([key, filter]) => {
        const apiFilterType = convertFilterType(filter.type, filter.field);
        const apiFieldName = mapFieldToApiField(filter.field);
        
        // フィルター値の追加
        if (apiFilterType === 'sort') {
          params.append('sort_by', apiFieldName);
          params.append('sort_order', filter.value === 'asc' ? 'asc' : 'desc');
        } else {
          // 通常のフィルター
          params.append(apiFieldName, filter.value.toString());
          if (apiFilterType !== 'equal') {
            params.append(`${apiFieldName}_type`, apiFilterType);
          }
        }
      });
    }

    console.log(`バックエンドAPIから取得: ${apiUrl}/videos?${params}`);
    const response = await fetch(`${apiUrl}/videos?${params}`);
    
    if (!response.ok) {
      console.error(`API エラー: HTTP ${response.status}`);
      const errorText = await response.text();
      console.error('エラー詳細:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log('API レスポンス (先頭500文字):', text.substring(0, 500) + '...');
    
    try {
      const result = JSON.parse(text);
      
      // レスポンスの構造チェック
      if (!result.data || !Array.isArray(result.data)) {
        console.error('APIレスポンスの形式が正しくありません:', result);
        throw new Error('無効なAPIレスポンス形式');
      }
      
      // バックエンドAPIのレスポンスをVideoData[]に変換
      const formattedData = result.data.map((video: TikTokVideo) => convertToVideoData(video));
      
      return {
        success: true,
        data: formattedData,
        currentPage: result.currentPage || 1,
        totalPages: result.totalPages || 1
      };
    } catch (error) {
      console.error('APIレスポンスの解析に失敗:', error);
      throw error;
    }
  } catch (error) {
    console.error('APIデータの取得エラー:', error);
    return {
      success: false,
      data: [],
      currentPage: 1,
      totalPages: 1
    };
  }
} 