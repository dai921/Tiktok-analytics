import { TikTokVideo, FilterOptions, SortOptions, ApiResponse, AccountData, CategoryData, HashtagData } from '../types/dashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * TikTok動画データを取得する
 */
export async function fetchVideos(
  page: number = 1,
  limit: number = 10,
  filters?: FilterOptions,
  sort?: SortOptions
): Promise<ApiResponse<TikTokVideo>> {
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
    const response = await fetch(`${API_BASE_URL}/api/videos?${params.toString()}`);
    
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

/**
 * アカウント一覧を取得する
 */
export async function fetchAccounts(): Promise<ApiResponse<AccountData>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/accounts`);
    
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
    const response = await fetch(`${API_BASE_URL}/api/categories`);
    
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
    const response = await fetch(`${API_BASE_URL}/api/hashtags?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching hashtags:', error);
    throw error;
  }
} 