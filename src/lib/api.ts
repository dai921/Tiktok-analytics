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
  filters?: any,
  sort?: any
): Promise<ApiResponse<TikTokVideo>> => {
  try {
    // デバッグ用に完全なfiltersオブジェクトを表示
    console.log('フィルタ完全オブジェクト:', JSON.stringify(filters, null, 2));
    
    // 基本パラメータ
    let baseUrl = `${apiUrl}/videos?page=${page}&limit=${limit}`;
    
    // フィルタパラメータを直接URLに追加（既存のコードは変更せず、ここで確実に追加）
    if (filters) {
      Object.keys(filters).forEach(field => {
        const filter = filters[field];
        if (filter && filter.value) {
          // APIフィールド名を取得
          const apiField = filter.apiFieldName || field;
          
          // URLにパラメータを追加（URLSearchParamsを使わず直接構築）
          if (baseUrl.includes('?')) {
            baseUrl += `&${apiField}=${encodeURIComponent(filter.value)}`;
          } else {
            baseUrl += `?${apiField}=${encodeURIComponent(filter.value)}`;
          }
          
          console.log(`パラメータ追加: ${apiField}=${filter.value}`);
        }
      });
    }
    
    // 最終的なURL
    const url = baseUrl;
    console.log('最終APIリクエストURL:', url);
    
    // APIリクエスト実行
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
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
  'createdAt': '投稿日時',
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

// COLUMN_MAPの逆引きマップを作成
const REVERSE_COLUMN_MAP: Record<string, string> = {};
Object.entries(COLUMN_MAP).forEach(([key, value]) => {
  REVERSE_COLUMN_MAP[value] = key;
});

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

// フィールド名のマッピング（表示名/内部名 → バックエンドDB名）
const mapFieldToApiField = (field: string): string => {
  // 日本語の表示名の場合は内部名に変換（例：「再生数」→ 「views」）
  const internalField = REVERSE_COLUMN_MAP[field] || field;
  
  // 内部名をバックエンドのカラム名に変換
  const fieldMapping: Record<string, string> = {
    'views': 'play_count',
    'likes': 'likes_count',
    'comments': 'comment_count',
    'createdAt': 'created_at',
    'accountName': 'account_name',
    'description': 'caption',
    'hashtags': 'hashtag', // hashtag（単数形）に変換
    // 他のフィールドも必要に応じて追加
  };
  
  return fieldMapping[internalField] || internalField;
}

// バックエンドのレスポンスとVideoDataのマッピング
const convertToVideoData = (video: any): VideoData => {
  // デバッグ用：受け取ったデータを確認
  console.log('APIレスポンスの生データ:', video);
  
  // hashtagsの処理（文字列から配列へ）
  let hashtagsArray: string[] = [];
  try {
    // キャプションからハッシュタグを抽出
    const caption = video.caption || '';
    const hashtagsFromCaption = caption.match(/#[^\s#]+/g) || [];
    
    if (video.hashtags) {
      if (typeof video.hashtags === 'string') {
        if (video.hashtags.includes(',')) {
          hashtagsArray = video.hashtags.split(',').map((tag: string) => tag.trim());
        } else if (video.hashtags.includes(' ')) {
          hashtagsArray = video.hashtags.split(' ').filter(Boolean);
        } else {
          try {
            const parsed = JSON.parse(video.hashtags);
            hashtagsArray = Array.isArray(parsed) ? parsed : [video.hashtags];
          } catch (e) {
            hashtagsArray = [video.hashtags];
          }
        }
      } else if (Array.isArray(video.hashtags)) {
        hashtagsArray = video.hashtags;
      }
    }
    
    // キャプションから抽出したハッシュタグを追加（重複を除去）
    hashtagsArray = [...new Set([...hashtagsArray, ...hashtagsFromCaption])];
  } catch (error) {
    console.error('ハッシュタグの処理エラー:', error);
    hashtagsArray = [];
  }

  // music_infoの処理
  let musicInfo: any = {};
  try {
    if (video.music_info) {
      if (typeof video.music_info === 'string') {
        try {
          musicInfo = JSON.parse(video.music_info);
        } catch (e) {
          musicInfo = { title: video.music_info };
        }
      } else {
        musicInfo = video.music_info;
      }
    }
  } catch (error) {
    console.error('音楽情報の処理エラー:', error);
    musicInfo = {};
  }

  // 数値の処理（文字列から数値へ）
  const parseNumberSafely = (value: any): number => {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  };

  return {
    id: video.id?.toString() || video.url?.split('/').pop() || '',
    url: video.url || '',
    videoId: video.url?.split('/').pop() || '',
    accountName: video.account_name || '',  // DB名に合わせて修正
    thumbnail: {
      valueType: 'IMAGE',
      url: video.thumbnail_url || video.thumbnail || ''  // DB名に合わせて修正
    },
    authorName: video.account_name || '',  // DB名に合わせて修正
    description: video.caption || '',  // DB名に合わせて修正
    likes: parseNumberSafely(video.likes_count),  // DB名に合わせて修正
    views: parseNumberSafely(video.play_count),   // DB名に合わせて修正
    comments: parseNumberSafely(video.comment_count), // DB名に合わせて修正
    shares: 0,
    saves: 0,
    createdAt: video.created_at || '',  // DB名に合わせて修正
    hashtags: hashtagsArray,
    duration: 0,
    isViral: parseNumberSafely(video.play_count) > 100000,
    prevFetchDate: '',
    currentFetchDate: new Date().toISOString(),
    prevViews: 0,
    viewsIncrease: parseNumberSafely(video.play_count_increase), // DB名に合わせて修正
    prevLikes: 0,
    likesIncrease: 0,
    product: '',
    category: video.category || '',
    audioId: musicInfo.id || '',
    audioTitle: musicInfo.title || '',
    artist: musicInfo.artist || '',
    predictedViews: 0
  };
}

// バックエンドAPIからデータを取得する関数
export async function getSheetData(page: number = 1, filters?: Record<string, FilterQuery>) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: '50'
  });

  // ソート情報の初期化
  let sortField = "created_at"; // デフォルトのソートフィールド
  let sortOrder = "desc";       // デフォルトのソート順

  if (filters) {
    console.log('getSheetData - 受け取ったフィルター:', filters);
    
    // フィルターが空オブジェクトの場合は、フィルターなしとして扱う
    if (Object.keys(filters).length === 0) {
      console.log('getSheetData - フィルターなしでデータを取得');
    } else {
      // フィルターとソートを分離して処理
      
      // ソートフィルターを先に処理（_sortで終わるキーを探す）
      Object.entries(filters).forEach(([key, filter]) => {
        if (!filter || !key.endsWith('_sort')) return;
        
        // ソート処理だけを行う
        if (filter.type === 'sort') {
          console.log('ソート設定検出（_sortキー）:', {
            field: key,
            apiField: mapFieldToApiField(key.replace('_sort', '')),
            direction: filter.value
          });
          
          // ソート情報を保存
          sortField = mapFieldToApiField(key.replace('_sort', ''));
          sortOrder = filter.value.toString();
        }
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
        }
        // 日付フィルターの処理 - 複数のタイプを処理
        else if (key === 'createdAt' || apiField === 'created_at') {
          console.log('日付フィルター検出:', {
            key,
            apiField,
            type: filter.type,
            value: filter.value
          });

          // 日付フィルターのタイプに基づいて適切なパラメータを追加
          if (filter.type === 'date' || filter.type === 'equal') {
            // 等価比較（特定の日付）- バックエンドではdateタイプを期待
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date'); // exactからdateに修正
          } else if (filter.type === 'after' || filter.type === 'greater') {
            // 以降の日付
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'after'); // afterを使用
          } else if (filter.type === 'before' || filter.type === 'less') {
            // 以前の日付
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'before'); // beforeを使用
          } else {
            // その他のケース - 一般的な等価比較としてフォールバック
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date'); // デフォルトはdate
          }
          
          console.log('日付フィルター設定完了:', {
            type: filter.type,
            value: filter.value.toString(),
            params: Object.fromEntries(params.entries())
          });
        } 
        // 数値フィルターの処理
        else if (filter.type === 'greater' || filter.type === 'less') {
          console.log('API - 数値フィルター変換前:', {
            originalKey: key,
            mappedField: mapFieldToApiField(key),
            filterType: filter.type,
            value: filter.value
          });

          const dbField = mapFieldToApiField(key);
          params.append(dbField, String(filter.value));
          params.append(`${dbField}_type`, filter.type);

          console.log('API - 数値フィルター変換後:', {
            dbField,
            type: filter.type,
            params: Object.fromEntries(params.entries())
          });
        }
        // 通常のテキストフィルター処理
        else if (filter.type === 'equal' && filter.value !== undefined && filter.value !== null && filter.value !== '') {
          // 通常のテキストフィルターはそのままパラメータとして追加
          params.append(apiField, String(filter.value));
          
          console.log('テキストフィルター設定:', {
            field: key,
            apiField: apiField,
            value: filter.value,
            params: Object.fromEntries(params.entries())
          });
        }
        // その他のタイプのフィルター（念のため）
        else if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
          params.append(apiField, String(filter.value));
          
          console.log('その他のフィルター設定:', {
            field: key,
            apiField: apiField,
            type: filter.type,
            value: filter.value,
            params: Object.fromEntries(params.entries())
          });
        }
      });
    }
  }

  // ソートパラメータを適切に追加
  params.append('sort_by', sortField);
  params.append('sort_order', sortOrder);
  
  console.log('ソート設定完了:', {
    field: sortField,
    order: sortOrder
  });

  const url = `${apiUrl}/videos?${params}`;
  console.log('APIリクエストURL:', url);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`API エラー: HTTP ${response.status}`);
      const errorText = await response.text();
      console.error('エラー詳細:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // レスポンスの構造チェック
    if (!result.data || !Array.isArray(result.data)) {
      console.error('APIレスポンスの形式が正しくありません:', result);
      return {
        success: false,
        data: [],
        currentPage: 1,
        totalPages: 1
      };
    }
    
    // バックエンドAPIのレスポンスをVideoData[]に変換
    const formattedData = result.data.map((video: any) => convertToVideoData(video));
    
    return {
      success: true,
      data: formattedData,
      currentPage: result.currentPage || 1,
      totalPages: result.totalPages || 1
    };
  } catch (error) {
    console.error('APIデータの取得エラー:', error);
    return {
      success: false,
      data: [],
      currentPage: 1,
      totalPages: 1,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
} 