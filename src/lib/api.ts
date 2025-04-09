import type { VideoData, TikTokVideo, AccountData, CategoryData, HashtagData } from '@/types/dashboard'
import type { PaginatedResponse, FilterQuery, FilterType, ComparisonOperator } from '@/types/dashboard'

// 環境変数からAPI設定を取得
const useBackendApi = process.env.NEXT_PUBLIC_USE_BACKEND_API === 'true';
const apiUrl = process.env.NEXT_PUBLIC_API_URL 

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
  sortBySecondary?: string;  // 二次ソート用のフィールドを追加
  sortOrderSecondary?: string;  // 二次ソート順序を追加
  content_type?: string | string[]; // コンテンツタイプフィルタを追加
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
    sortOrder = 'desc',
    sortBySecondary = 'play_count',  // デフォルトの二次ソートフィールド
    sortOrderSecondary = 'desc',  // デフォルトの二次ソート順序
    content_type,
  } = options;

  // クエリパラメータの構築
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort_by: sortBy,
    sort_order: sortOrder,
    sort_by_secondary: sortBySecondary,  // 二次ソートフィールドを初期パラメータに追加
    sort_order_secondary: sortOrderSecondary  // 二次ソート順序を初期パラメータに追加
  });

  // オプションパラメータの追加
  if (accountName) params.append('account_name', accountName);
  if (category) params.append('category', category);
  if (hashtag) params.append('hashtag', hashtag);
  
  // 複数のcontent_typeを処理する改良されたロジック
  if (content_type) {
    if (Array.isArray(content_type)) {
      console.log('content_typeは配列形式:', content_type);
      if (content_type.length === 1) {
        params.append('content_type', content_type[0]);
        console.log(`単一コンテンツタイプを設定 (配列から): ${content_type[0]}`);
      } else if (content_type.length > 1) {
        // 複数のcontent_typeをカンマ区切りの文字列として送信
        params.append('content_type', content_type.join(','));
        console.log(`複数コンテンツタイプをカンマ区切りで設定: ${content_type.join(',')}`);
      }
    } else {
      // content_typeが文字列の場合（既存の処理）
      params.append('content_type', content_type);
      console.log(`単一コンテンツタイプを設定 (文字列): ${content_type}`);
    }
  }
  
  // 日付フィルターの処理
  // 注意: バックエンドAPIの現在の実装では、startDateとendDateの両方を同時に処理できません
  // 現在のワークアラウンドとして、endDateを優先します
  if (startDate && !endDate) {
    params.append('created_at', startDate);
    params.append('created_at_type', 'after');
  } else if (endDate) {
    params.append('created_at', endDate);
    params.append('created_at_type', 'before');
  }
  
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
    return {
      success: true,
      data: data.data,
      currentPage: data.currentPage,
      totalPages: data.totalPages,
      total: data.total,
      lastUpdated: data.lastUpdated
    };
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
      hashtags: Array.isArray(video.hashtags) 
        ? video.hashtags 
        : typeof video.hashtags === 'string'
          ? video.hashtags.split(/[,#]/).map((tag: string) => tag.trim()).filter(Boolean)
          : [],
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
  filters?: any,
  sort?: any
): Promise<ApiResponse<TikTokVideo>> => {
  try {
    // デバッグ用に完全なfiltersオブジェクトを表示
    console.log('フィルタ完全オブジェクト:', JSON.stringify(filters, null, 2));
    
    // APIオプションの準備
    const apiOptions: any = {
      page,
      limit
    };
    
    // フィルター処理
    if (filters) {
      Object.keys(filters).forEach(field => {
        const filter = filters[field];
        if (filter && filter.value !== undefined && filter.value !== null) {
          // APIフィールド名を取得
          const apiField = mapFieldToApiField(filter.field || field);
          
          // 特別な処理が必要なフィールド
          if (apiField === 'content_type') {
            apiOptions['content_type'] = filter.value;
          } else {
            // 通常のフィルターフィールド
            apiOptions[apiField] = filter.value;
          }
        }
      });
    }
    
    // ソート処理
    if (sort) {
      // ソート処理のロジック...
    }
    
    console.log('APIリクエストオプション:', apiOptions);
    
    // バックエンドAPIを呼び出す
    const response = await fetchVideosFromBackend(apiOptions);
    return response;
  } catch (error) {
    console.error('APIリクエスト失敗:', error);
    throw error;
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
export async function fetchHashtags(limit: number | null = null): Promise<ApiResponse<HashtagData>> {
  try {
    const url = limit !== null
      ? `${apiUrl}/api/hashtags?limit=${limit}`
      : `${apiUrl}/api/hashtags`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching hashtags:', error);
    throw error;
  }
}

// ソートフィルターの型定義を修正
interface SortFilter {
  key: string;
  field: string;
  apiField: string;
  direction: string | number;
  timestamp: number;
  isPrimarySort: boolean;
}

// カラム名のマッピング（sheets.tsと同じ定義）
export const COLUMN_MAP: Record<string, string> = {
  'views': '再生数',
  'likes': 'いいね数',
  'comments': 'コメント数',
  'account_name': 'アカウント名',
  'category': '動画ジャンル',
  'hashtags': 'ハッシュタグ',
  'description': '説明',
  'audioTitle': '音声タイトル',
  'url': 'URL',
  'videoId': '動画ID',
  'thumbnail_url': 'カバー画像',
  'display_name': '作成者表示名',
  'shares': '共有数',
  'saves': '保存数',
  'createdAt': '投稿日',
  'duration': '動画時間(秒)',
  'isViral': '10万再生以上',
  'prevViews': '前回再生数',
  'viewsIncrease': '再生増加数',
  'prevLikes': '前回いいね数',
  'likesIncrease': 'いいね数伸び',
  'product': '商材',
  'audioId': '音声ID',
  'artist': 'アーティスト',
  'content_type': 'コンテンツタイプ',
  'account_type': 'アカウントジャンル',
  'likes_count_increase': 'いいね増加数',
  'ten_days_likes_increase': '10日間いいね増加数',
  'comment_count_increase': 'コメント増加数',
  'ten_days_comment_increase': '10日間コメント増加数',
  'ten_days_increase': '10日間再生増加数'
}

// COLUMN_MAPの逆引きマップを作成
const REVERSE_COLUMN_MAP: Record<string, string> = {};
Object.entries(COLUMN_MAP).forEach(([key, value]) => {
  REVERSE_COLUMN_MAP[value] = key;
});

// デバッグ用：REVERSE_COLUMN_MAPの内容を出力
console.log('REVERSE_COLUMN_MAP初期化:', {
  '投稿日': REVERSE_COLUMN_MAP['投稿日'],
  '再生数': REVERSE_COLUMN_MAP['再生数'],
  'いいね数': REVERSE_COLUMN_MAP['いいね数']
});

// フィルタータイプの変換関数
const convertFilterType = (type: FilterType, field: string): string => {
  switch (type) {
    case 'equal':
      return 'equal';
    case 'greater':
      return 'gt';
    case 'less':
      return 'lt';
    case 'between':
      return 'between';
    case 'contains':
      return 'contains'; // 部分一致検索のタイプを追加
    default:
      return 'equal';
  }
}

// フィールド名のマッピング（表示名/内部名 → バックエンドDB名）
const mapFieldToApiField = (field: string): string => {
  console.log('mapFieldToApiField - 入力フィールド:', field);
  
  // 「再生増加数」を「play_count_increase」に直接マッピングする場合を追加
  if (field === '動画ジャンル') {
    return 'category';
  } else if (field === '再生増加数') {
    return 'play_count_increase';
  } else if (field === 'viewsIncrease') {
    return 'play_count_increase';
  }
  
  // 日本語の表示名の場合は内部名に変換（例：「再生数」→ 「views」）
  const internalField = REVERSE_COLUMN_MAP[field] || field;
  console.log('mapFieldToApiField - 内部フィールド変換結果:', {
    input: field,
    internalField: internalField,
    isInReverseMap: field in REVERSE_COLUMN_MAP
  });
  
  // 内部名をバックエンドのカラム名に変換
  const fieldMapping: Record<string, string> = {
    'views': 'play_count',
    'likes': 'likes_count',
    'comments': 'comment_count',
    'createdAt': 'created_at',
    'account_name': 'account_name',
    'description': 'caption',
    'hashtags': 'hashtag', // hashtag（単数形）に変換
    'audioTitle': 'music_info', // audioTitleをmusic_infoに変換
    'category': 'category',    // categoryをそのまま保持
    'viewsIncrease': 'play_count_increase', // 再生増加数の対応を追加
    'content_type': 'content_type', // コンテンツタイプのマッピングを追加
    'account_type': 'account_type',
    'likes_count_increase': 'likes_count_increase',
    'ten_days_likes_increase': 'ten_days_likes_increase',
    'comment_count_increase': 'comment_count_increase',
    'ten_days_comment_increase': 'ten_days_comment_increase',
    'ten_days_increase': 'ten_days_increase'
  };
  
  const result = fieldMapping[internalField] || internalField;
  console.log('mapFieldToApiField - 最終変換結果:', {
    internalField,
    apiField: result
  });
  
  return result;
}

// 数値を安全に変換する関数
const parseNumberSafely = (value: any): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// バックエンドのレスポンスとVideoDataのマッピング
const convertToVideoData = (video: any): VideoData => {
  // デバッグ用のログ出力を追加
  console.log('Converting video data:', {
    thumbnail: video.thumbnail_url,
    account: video.account_name,
    type: typeof video.thumbnail_url,
    // BGM関連の情報を追加
    music: {
      info: video.music_info,
      id: video.music_id,
      title: video.music_title,
      artist: video.music_artist
    }
  });

  // music_infoからの情報抽出を試みる
  let musicInfo = null;
  try {
    if (typeof video.music_info === 'string') {
      musicInfo = JSON.parse(video.music_info);
    } else if (typeof video.music_info === 'object') {
      musicInfo = video.music_info;
    }
  } catch (e) {
    console.warn('music_infoのパース失敗:', e);
  }

  return {
    id: video.id,
    url: video.url,
    videoId: video.video_id,
    account_name: video.account_name || '',
    thumbnail_url: video.thumbnail_url && typeof video.thumbnail_url === 'string' ? {
      valueType: 'IMAGE',
      url: video.thumbnail_url
    } : null,
    description: video.caption || '',
    likes: parseNumberSafely(video.likes_count),
    views: parseNumberSafely(video.play_count),
    comments: parseNumberSafely(video.comment_count),
    shares: parseNumberSafely(video.share_count),
    saves: parseNumberSafely(video.save_count),
    createdAt: video.created_at,
    hashtags: Array.isArray(video.hashtags) 
      ? video.hashtags 
      : typeof video.hashtags === 'string'
        ? video.hashtags.split(/[,#]/).map((tag: string) => tag.trim()).filter(Boolean)
        : [],
    duration: parseNumberSafely(video.duration),
    isViral: Boolean(video.isViral),
    prevFetchDate: video.prev_fetch_date,
    currentFetchDate: video.current_fetch_date,
    prevViews: parseNumberSafely(video.prev_play_count),
    viewsIncrease: parseNumberSafely(video.play_count_increase),
    prevLikes: parseNumberSafely(video.prev_likes_count),
    likesIncrease: parseNumberSafely(video.likes_count_increase),
    product: video.product || '',
    category: video.category || '',
    audioId: musicInfo?.id || video.music_id || '',
    audioTitle: musicInfo?.title || video.music_title || '',
    artist: musicInfo?.artist || video.music_artist || '',
    rank: video.rank,
    predictedViews: parseNumberSafely(video.predicted_views),
    display_name: video.display_name || '',
    products: video.product || '',
    ten_days_increase: parseNumberSafely(video.ten_days_increase),
    content_type: video.content_type || 'video',
    account_type: video.account_type || '',
    likes_count_increase: parseNumberSafely(video.likes_count_increase),
    ten_days_likes_increase: parseNumberSafely(video.ten_days_likes_increase),
    comment_count_increase: parseNumberSafely(video.comment_count_increase),
    ten_days_comment_increase: parseNumberSafely(video.ten_days_comment_increase)
  };
};

// バックエンドAPIからデータを取得する関数
export async function getDbData(page: number = 1, filters?: Record<string, FilterQuery>, limit: number = 50) {
  // URLSearchParamsを使用してパラメータを適切にエンコード
  const params = new URLSearchParams();

  // 基本パラメータの追加
  params.append('page', page.toString());
  params.append('limit', limit.toString());

  // ソートフィルターの初期化
  const sortFilters: Array<{
    key: string;
    field: string;
    apiField: string;
    direction: string | number;
    timestamp: number;
    isPrimarySort: boolean;
  }> = [];

  try {
    if (filters) {
      // ソートフィルターの抽出と処理
      const extractedSortFilters = Object.entries(filters)
        .filter(([key, filter]) => key.endsWith('_sort') && filter?.type === 'sort')
        .map(([key, filter]) => {
          const timestamp = filter.timestamp && filter.timestamp > 0 
            ? Number(filter.timestamp) 
            : Date.now();

          // directionの値をサニタイズ
          let direction = Array.isArray(filter.value) 
            ? filter.value[0]?.toString().toLowerCase() || 'desc'
            : filter.value?.toString().toLowerCase() || 'desc';
          
          // 有効な方向のみを許可
          direction = ['asc', 'desc'].includes(direction) ? direction : 'desc';

          return {
            key,
            field: key.replace('_sort', ''),
            apiField: mapFieldToApiField(key.replace('_sort', '')),
            direction,
            timestamp,
            isPrimarySort: !!filter.isPrimarySort
          };
        })
        .sort((a, b) => {
          if (a.isPrimarySort && !b.isPrimarySort) return -1;
          if (!a.isPrimarySort && b.isPrimarySort) return 1;
          return b.timestamp - a.timestamp;
        });

      sortFilters.push(...extractedSortFilters);

      // メインソートの設定
      if (sortFilters.length > 0) {
        const primarySort = sortFilters[0];
        params.append('sort_by', primarySort.apiField);
        params.append('sort_order', primarySort.direction.toString());

        // 二次ソートの設定
        if (sortFilters.length > 1) {
          const secondarySort = sortFilters[1];
          params.append('sort_by_secondary', secondarySort.apiField);
          params.append('sort_order_secondary', secondarySort.direction.toString());
        }
      } else {
        // デフォルトのソート設定
        params.append('sort_by', 'created_at');
        params.append('sort_order', 'desc');
        params.append('sort_by_secondary', 'play_count');
        params.append('sort_order_secondary', 'desc');
      }

      // 通常のフィルターの処理
      Object.entries(filters).forEach(([key, filter]) => {
        if (!filter || key.endsWith('_sort') || filter.clear === true) return;

        console.log('フィルター処理開始:', {
          key,
          filter,
          type: filter.type,
          value: filter.value,
          apiFieldName: mapFieldToApiField(key)
        });

        const apiField = mapFieldToApiField(key);

        // 数値フィルターの処理
        if (['greater', 'less', 'equal'].includes(filter.type) || 
            (filter.type === 'number' && filter.comparison && ['greater', 'less', 'equal'].includes(filter.comparison))) {
          console.log('数値フィルター検出:', {
            key,
            type: filter.type,
            comparison: filter.comparison,
            value: filter.value,
            apiField
          });
          
          params.append(apiField, String(filter.value));
          // comparisonが存在する場合はそちらを優先、存在しない場合はtypeを使用
          const filterType = filter.comparison && ['greater', 'less', 'equal'].includes(filter.comparison) 
            ? filter.comparison 
            : filter.type;
          params.append(`${apiField}_type`, filterType);
          
          console.log('数値フィルターパラメータ設定後:', Object.fromEntries(params.entries()));
          return;
        }

        // ハッシュタグフィルター
        if (filter.isHashtag || key === 'hashtags') {
          params.append('hashtag', filter.value.toString().trim());
          return;
        }

        // カテゴリフィルター
        if (key === 'category' || key === '動画ジャンル') {
          if (Array.isArray(filter.value)) {
            filter.value.forEach((category, index) => {
              params.append(`category_${index}`, category.toString().trim());
            });
            params.append('category_count', filter.value.length.toString());
          } else {
            params.append('category', filter.value.toString().trim());
          }
          return;
        }

        // コンテンツタイプフィルター
        if (key === 'content_type') {
          if (Array.isArray(filter.value)) {
            params.append('content_type', filter.value.join(','));
          } else {
            params.append('content_type', filter.value.toString());
          }
          return;
        }

        // 日付フィルター
        if (key === 'createdAt' || apiField === 'created_at' || key === '投稿日') {
          const comparison = filter.comparison || filter.type || 'equal';
          params.append('created_at', filter.value.toString());
          params.append('created_at_type', comparison);
          return;
        }

        // その他のフィルター
        if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
          params.append(apiField, filter.value.toString().trim());
        }
      });
    }

    const url = `${apiUrl}/videos?${params.toString()}`;
    console.log('APIリクエストURL:', url);
    console.log('APIパラメータ:', Object.fromEntries(params.entries()));

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    return {
      success: true,
      data: result.data.map(convertToVideoData),
      currentPage: result.currentPage || 1,
      totalPages: result.totalPages || 1,
      totalCount: result.total || result.data.length
    };

  } catch (error) {
    console.error('APIリクエストエラー:', error);
    return {
      success: false,
      data: [],
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      error: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

/**
 * フィルター条件に一致する全データを取得する（ページングなし）
 * フィルター選択肢生成用のデータ取得
 */
export async function getAllFilteredData(filters?: Record<string, FilterQuery>) {
  const params = new URLSearchParams();
  
  // デフォルトのソート設定
  let sortField = 'created_at';
  let sortOrder = 'desc';
  let secondarySortField: string | null = null;
  let secondarySortOrder = 'desc';
  
  // ソートフィルターの初期化
  const sortFilters: Array<{
    key: string;
    field: string;
    apiField: string;
    direction: string | number;
    timestamp: number;
    isPrimarySort: boolean;
  }> = [];
  
  try {
    // フィルターがある場合はクエリパラメータに追加
    if (filters) {
      console.log('getAllFilteredData - 受け取ったフィルター:', filters);
      console.log('getAllFilteredData - フィルターのキー:', Object.keys(filters));
        
      // ソートフィルターを抽出し、主ソートを最優先にする
      const extractedSortFilters = Object.entries(filters)
        .filter(([key, filter]) => key.endsWith('_sort') && filter?.type === 'sort')
        .map(([key, filter]) => {
          // タイムスタンプが0または未定義の場合は、現在時刻を使用
          const timestamp = filter.timestamp && filter.timestamp > 0 
            ? Number(filter.timestamp) 
            : Date.now();
          
          // directionの型を適切に変換
          const direction = Array.isArray(filter.value) 
            ? filter.value[0]?.toString() || 'desc'
            : filter.value;
          
          return {
            key,
            field: key.replace('_sort', ''),
            apiField: mapFieldToApiField(key.replace('_sort', '')),
            direction,
            timestamp,
            isPrimarySort: !!filter.isPrimarySort
          };
        })
        // isPrimarySort が true のものを先頭に、それ以外はタイムスタンプ降順
        .sort((a, b) => {
          // isPrimarySort フラグが設定されている場合はそれを優先
          if (a.isPrimarySort && !b.isPrimarySort) return -1;
          if (!a.isPrimarySort && b.isPrimarySort) return 1;
          
          // どちらもisPrimarySortが同じ場合はタイムスタンプで降順ソート
          // 新しいソートを先頭に配置するため「b - a」の順
          return b.timestamp - a.timestamp;
        });
      
      // 抽出したフィルターをsortFilters配列に追加
      sortFilters.push(...extractedSortFilters);
      
      console.log('抽出されたソートフィルター:', JSON.stringify(
        sortFilters.map(f => ({
          ...f, 
          time: new Date(f.timestamp).toISOString(),
          isCreatedAt: f.field === 'createdAt' || f.field.includes('投稿日')
        })), null, 2)
      );
      
      // メインソートとサブソートの設定
      if (sortFilters.length > 0) {
        // 最新のソートを主ソートとして使用（配列の先頭）
        const primarySort = sortFilters[0];
        console.log('API - 主ソートに使用:', {
          field: primarySort.field,
          apiField: primarySort.apiField,
          direction: primarySort.direction,
          timestamp: primarySort.timestamp,
          time: new Date(primarySort.timestamp).toISOString(),
          isPrimarySort: primarySort.isPrimarySort
        });
        
        // 主ソートの設定
        if (primarySort.field === 'createdAt' || primarySort.field.includes('投稿日')) {
          sortField = 'created_at';
        } else if (primarySort.field === 'views') {
          sortField = 'play_count';
        } else if (primarySort.field === 'likes') {
          sortField = 'likes_count';
        } else if (primarySort.field === 'comments') {
          sortField = 'comment_count';
        } else if (primarySort.field === 'viewsIncrease' || primarySort.field === '再生増加数') {
          sortField = 'play_count_increase';  // 再生増加数の対応を追加
        } else {
          sortField = primarySort.apiField;
        }
        sortOrder = primarySort.direction.toString();
        
        // 2番目のソートがあれば二次ソートとして使用
        if (sortFilters.length > 1) {
          const secondarySort = sortFilters[1];
          console.log('API - 二次ソートに使用:', {
            field: secondarySort.field,
            apiField: secondarySort.apiField,
            direction: secondarySort.direction,
            timestamp: secondarySort.timestamp,
            time: new Date(secondarySort.timestamp).toISOString()
          });
          
          // 二次ソートの設定
          if (secondarySort.field === 'createdAt' || secondarySort.field.includes('投稿日')) {
            secondarySortField = 'created_at';
          } else if (secondarySort.field === 'views') {
            secondarySortField = 'play_count';
          } else if (secondarySort.field === 'likes') {
            secondarySortField = 'likes_count';
          } else if (secondarySort.field === 'comments') {
            secondarySortField = 'comment_count';
          } else {
            secondarySortField = secondarySort.apiField;
          }
          secondarySortOrder = secondarySort.direction.toString();
        }
      }
      
      console.log('全データ取得 - 最終的なソート設定:', {
        primary: {
          field: sortField,
          order: sortOrder
        },
        secondary: secondarySortField ? {
          field: secondarySortField,
          order: secondarySortOrder
        } : 'なし'
      });
      
      // 通常のフィルターを処理
      Object.entries(filters).forEach(([key, filter]) => {
        if (!filter || key.endsWith('_sort')) return; // ソートフィルターはスキップ
        
        console.log('API - フィルター処理開始:', {
          key,
          filter,
          type: filter.type,
          apiFieldName: mapFieldToApiField(key)
        });

        // API用のフィールド名を取得
        const apiField = mapFieldToApiField(key);

        // ハッシュタグフィルターの場合の特別な処理
        if (filter.isHashtag || key === 'hashtags') {
          console.log('API - ハッシュタグのフィルタリング処理');
          
          // ハッシュタグは完全一致ではなく、部分一致で検索するようにする
          params.append('hashtag', filter.value.toString());
          
          console.log('ハッシュタグフィルター設定:', {
            value: filter.value.toString(),
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }
        // カテゴリフィルターの処理
        else if (key === 'category' || apiField === 'category') {
          console.log('API - カテゴリーのフィルタリング処理');
          
          // カテゴリは部分一致で検索する
          if (filter.type === 'contains') {
            // 部分一致検索のための処理
            params.append('category', filter.value.toString());
          } else {
            // 従来の完全一致検索
            params.append('category', filter.value.toString());
          }
          
          console.log('カテゴリフィルター設定:', {
            value: filter.value.toString(),
            type: filter.type,
            queryParams: Object.fromEntries(params.entries())
          });
        }
        // 日付フィルターの処理
        else if (key === 'createdAt' || apiField === 'created_at' || key === '投稿日') {
          console.log('日付フィルター検出:', filter);
          
          // filter.comparisonとfilter.typeの両方を考慮
          let comparison = filter.comparison || filter.type;
          
          // 比較演算子が 'date' の場合は 'equal' に変換
          if (comparison === 'date') {
            comparison = 'equal';
            console.log('日付フィルター - 比較演算子を変換: date → equal');
          }
          
          // 比較演算子が指定されている場合のみフィルターを適用
          if (comparison) {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', comparison);
            console.log(`日付フィルター - 比較演算子: ${comparison}`);
          } else {
            // 比較演算子が指定されていない場合は警告を出力
            console.warn('日付フィルター - 比較演算子が指定されていません。フィルターをスキップします。', filter);
            // フィルターをスキップ
            return;
          }
        }
        // 数値フィルターの処理
        else if (['greater', 'less', 'equal'].includes(filter.type)) {
          const dbField = mapFieldToApiField(key);
          params.append(dbField, String(filter.value));
          
          // フィルタタイプも追加
          params.append(`${dbField}_type`, filter.type);
        }
        // 音楽情報フィルターの特別な処理
        else if (key === 'audioTitle' || key === 'BGM') {
          // フィルタータイプを確認して適切なパラメータを設定
          if (filter.type === 'contains') {
            params.append('music_info', filter.value.toString());
          } else {
            params.append('music_info', filter.value.toString());
          }
        }
        // 通常のテキストフィルター処理
        else if ((filter.type === 'equal' || filter.type === 'contains') && 
                filter.value !== undefined && filter.value !== null && filter.value !== '') {
          // 通常のテキストフィルターはそのままパラメータとして追加
          params.append(apiField, String(filter.value));
        }
        // その他のタイプのフィルター（念のため）
        else if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
          params.append(apiField, String(filter.value));
        }
      });
    }

    // ソートパラメータを適切に追加
    // 重要: 新しく追加されたソートを主ソートとして、以前のソートを二次ソートとして扱う
    if (sortField) {
      params.append('sort_by', sortField);
      params.append('sort_order', sortOrder);
      
      console.log('全データ取得 - 主ソート設定:', {
        sort_by: sortField,
        sort_order: sortOrder,
        timestamp: sortFilters.length > 0 ? sortFilters[0].timestamp : 0,
        currentTime: new Date().toISOString()
      });
      
      // 二次ソートパラメータを追加（存在する場合）
      if (secondarySortField) {
        params.append('sort_by_secondary', secondarySortField);
        params.append('sort_order_secondary', secondarySortOrder);
        console.log('全データ取得 - 二次ソートパラメータを追加:', { 
          sort_by_secondary: secondarySortField, 
          sort_order_secondary: secondarySortOrder,
          timestamp: sortFilters.length > 1 ? sortFilters[1].timestamp : 0,
          currentTime: new Date().toISOString()
        });
      }
    }

    console.log('全データ取得URLパラメータ:', Object.fromEntries(params.entries()));
    
    // APIリクエスト実行
    const response = await fetch(`${apiUrl}/api/videos?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('全データ取得結果:', {
      success: result.success,
      dataCount: result.data?.length || 0
    });
    
    if (result.success) {
      return {
        success: true,
        data: result.data.map(convertToVideoData),
        totalCount: result.total || result.data.length
      };
    } else {
      console.error('全データ取得エラー:', result.error || '不明なエラー');
      return {
        success: false,
        data: [],
        error: result.error || '不明なエラー',
        totalCount: 0
      };
    }
  } catch (error) {
    console.error('全データ取得中の例外:', error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : '不明なエラー',
      totalCount: 0
    };
  }
}

/**
 * フィルター条件に基づいて選択肢だけを取得する
 * パフォーマンスが向上するように最適化されたAPI
 */
export async function getFilterOptions(filters?: Record<string, FilterQuery>, filterType: string = 'all') {
  try {
    console.log('getFilterOptions - フィルター選択肢のみ取得開始');
    
    // URLパラメータの構築
    const params = new URLSearchParams({
      filter_type: filterType
    });
    
    // フィルターがある場合はクエリパラメータに追加
    if (filters) {
      console.log('getFilterOptions - 受け取ったフィルター:', filters);
      
      // 通常のフィルターを処理（ソート以外）
      Object.entries(filters).forEach(([key, filter]) => {
        if (!filter || key.endsWith('_sort')) return; // ソートフィルターはスキップ
        
        console.log('API - フィルター処理開始:', {
          key,
          filter,
          type: filter.type,
          apiFieldName: mapFieldToApiField(key)
        });

        // API用のフィールド名を取得
        const apiField = mapFieldToApiField(key);

        // ハッシュタグフィルターの場合の特別な処理
        if (filter.isHashtag || key === 'hashtags') {
          params.append('hashtag', filter.value.toString());
        }
        // カテゴリフィルターの処理
        else if (key === 'category' || apiField === 'category') {
          console.log('API - カテゴリーのフィルタリング処理');
          
          // 配列の場合は個別のパラメータとして追加
          if (Array.isArray(filter.value)) {
            // category_1, category_2, ... として送信
            filter.value.forEach((category, index) => {
              params.append(`category_${index}`, category.toString());
            });
            // 何個のカテゴリがあるかを送信
            params.append('category_count', filter.value.length.toString());
          } else {
            // 従来通り単一カテゴリの場合はそのまま送信
            params.append('category', filter.value.toString());
          }
          
          console.log('カテゴリーフィルター設定:', {
            value: filter.value,
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }
        // 日付フィルターの処理
        else if (key === 'createdAt' || apiField === 'created_at' || key === '投稿日') {
          console.log('日付フィルター検出:', filter);
          
          // フィルターの詳細情報をログに出力
          console.log('日付フィルター処理 - フィルター詳細:', {
            type: filter.type,
            comparison: filter.comparison,
            value: filter.value,
            hasComparison: !!filter.comparison
          });

          // comparison属性が明示的に設定されている場合は、それを優先的に使用
          let comparison = filter.comparison;
          
          // comparisonがない場合のみfilter.typeが適切な値なら使用
          if (!comparison && ['greater', 'less', 'equal'].includes(filter.type)) {
            comparison = filter.type as ComparisonOperator;
            console.log('日付フィルター - typeからcomparison推測:', filter.type);
          }
          
          // 比較演算子が未設定の場合、デフォルト値 'equal' を使用
          if (!comparison) {
            comparison = 'equal';
            console.log('日付フィルター - 比較演算子をデフォルト値に設定: equal');
          }
          
          // フィルターを適用
          params.append('created_at', filter.value.toString());
          params.append('created_at_type', comparison);
          console.log(`日付フィルター - 最終的な比較演算子: ${comparison}`);
        }
        // 数値フィルターの処理
        else if (['greater', 'less', 'equal'].includes(filter.type) || 
                 ['greater', 'less', 'equal'].includes(filter.comparison || '')) {
          const dbField = mapFieldToApiField(key);
          params.append(dbField, String(filter.value));
          
          // comparisonとtypeの両方を考慮
          const comparison = filter.comparison || filter.type;
          
          // フィルタタイプも追加
          params.append(`${dbField}_type`, comparison);
          
          console.log(`数値フィルター(${key})の適用:`, {
            field: key,
            dbField: dbField,
            value: filter.value,
            type: filter.type,
            comparison: filter.comparison,
            appliedComparison: comparison,
            params: `${dbField}_type=${comparison}`
          });
        }
        // クリアフィルターの特別処理
        else if (filter.type === 'clear') {
          // このフィールドのフィルターは送信しない（スキップする）
          console.log(`API - フィルター '${key}' はクリアされました`);
        }
        // 音楽情報フィルターの特別な処理
        else if (key === 'audioTitle' || key === 'BGM') {
          params.append('music_info', filter.value.toString());
        }
        // 通常のテキストフィルター処理
        else if ((filter.type === 'equal' || filter.type === 'contains') && 
                filter.value !== undefined && filter.value !== null && filter.value !== '') {
          // 通常のテキストフィルターはそのままパラメータとして追加
          params.append(apiField, String(filter.value));
        }
      });
    }
    
    console.log('選択肢取得URLパラメータ:', Object.fromEntries(params.entries()));
    
    // APIリクエスト実行
    const response = await fetch(`${apiUrl}/api/filter-options?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('選択肢取得結果:', {
      success: result.success,
      categoryCount: result.categories?.length || 0,
      accountCount: result.accounts?.length || 0,
      hashtagCount: result.hashtags?.length || 0,
      musicCount: result.music?.length || 0
    });
    
    if (result.success) {
      return {
        success: true,
        categories: result.categories || [],
        accounts: result.accounts || [],
        hashtags: result.hashtags || [],
        music: result.music || []
      };
    } else {
      console.error('選択肢取得エラー:', result.error || '不明なエラー');
      return {
        success: false,
        categories: [],
        accounts: [],
        hashtags: [],
        music: [],
        error: result.error || '不明なエラー'
      };
    }
  } catch (error) {
    console.error('選択肢取得中の例外:', error);
    return {
      success: false,
      categories: [],
      accounts: [],
      hashtags: [],
      music: [],
      error: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

// APIのベースURL（環境変数から取得）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// レスポンス型定義
type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

// エラーハンドリング共通関数
const handleApiError = (error: unknown): ApiResponse<never> => {
  console.error('API呼び出しエラー:', error);
  return {
    success: false,
    data: [] as never,
    error: error instanceof Error ? error.message : '不明なエラーが発生しました'
  };
};

// 利用可能な動画ジャンル一覧を取得
export async function fetchTrendGenres(): Promise<ApiResponse<string[]>> {
  try {
    console.log('動画ジャンル取得中...');
    const response = await fetch(`${API_BASE_URL}/api/trends/genres`);
    
    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('取得した動画ジャンルデータ:', result);
    
    // APIレスポンスの形式を確認
    if (result.success && Array.isArray(result.data)) {
      return result;
    } else {
      return {
        success: true,
        data: result.data || [],
      };
    }
  } catch (error) {
    return handleApiError(error);
  }
}

// 利用可能な集計日一覧を取得
export async function fetchTrendDates(): Promise<ApiResponse<string[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/trends/dates`);
    
    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && Array.isArray(result.data)) {
      return result;
    } else {
      return {
        success: true,
        data: result.data || [],
      };
    }
  } catch (error) {
    return handleApiError(error);
  }
}

// トレンドタイムラインデータを取得
export async function fetchTrendTimeline(params: {
  start_date: string;
  end_date: string;
  genres: string[];
}): Promise<ApiResponse<any>> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('start_date', params.start_date);
    queryParams.append('end_date', params.end_date);
    params.genres.forEach(genre => {
      queryParams.append('genres', genre);
    });
    
    const response = await fetch(
      `${API_BASE_URL}/api/trends/timeline?${queryParams.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    return handleApiError(error);
  }
}

// トレンドサマリーデータを取得
export async function fetchTrendSummary(params: {
  start_date: string;
  end_date: string;
}): Promise<ApiResponse<any>> {
  try {
    const queryParams = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
    });
    
    const response = await fetch(
      `${API_BASE_URL}/api/trends/summary?${queryParams.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    return handleApiError(error);
  }
}

// 管理者用パスワード変更API呼び出し
export async function changePassword(email: string, currentPassword: string, newPassword: string) {
  try {
    const token = localStorage.getItem('auth_token');
    const tokenType = (localStorage.getItem('auth_token_type') || 'Bearer').charAt(0).toUpperCase() + 
                     (localStorage.getItem('auth_token_type') || 'Bearer').slice(1).toLowerCase();
    
    console.log('パスワード変更リクエスト詳細:', {
      token: token ? '存在する' : 'なし',
      tokenType,
      email,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${tokenType} ${token?.substring(0, 10)}...`
      },
      requestBody: {
        email,
        current_password: '***',
        new_password: '***'
      }
    });

    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${tokenType} ${token}`,
        'Accept': 'application/json'  // 明示的にJSONレスポンスを要求
      },
      body: JSON.stringify({
        email,
        current_password: currentPassword,
        new_password: newPassword
      }),
      credentials: 'include'  // Cookieを含める
    });

    // エラーレスポンスの詳細を取得
    if (!response.ok) {
      const errorData = await response.json();
      console.error('パスワード変更エラー詳細:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        requestHeaders: {
          'Authorization': `${tokenType} ${token?.substring(0, 10)}...`,
          'Content-Type': 'application/json'
        }
      });
      throw new Error(errorData.detail || 'この操作を行う権限がありません');
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('パスワード変更エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    };
  }
} 