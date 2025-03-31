import type { VideoData, PaginatedResponse, FilterQuery, FilterType } from '@/types/dashboard'

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

// カラム名のマッピング（sheets.tsと同じ定義）
export const COLUMN_MAP: Record<string, string> = {
  'views': '再生数',
  'likes': 'いいね数',
  'comments': 'コメント数',
  'accountName': 'アカウント名',
  'category': 'ジャンル',
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
  'viewsIncrease': '再生増加数',
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

// デバッグ用：REVERSE_COLUMN_MAPの内容を出力
console.log('REVERSE_COLUMN_MAP初期化:', {
  '投稿日時': REVERSE_COLUMN_MAP['投稿日時'],
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
  if (field === 'ジャンル') {
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
    'accountName': 'account_name',
    'description': 'caption',
    'hashtags': 'hashtag', // hashtag（単数形）に変換
    'audioTitle': 'music_info', // audioTitleをmusic_infoに変換
    'category': 'category',    // categoryをそのまま保持
    'viewsIncrease': 'play_count_increase', // 再生増加数の対応を追加
    // 他のフィールドも必要に応じて追加
  };
  
  const result = fieldMapping[internalField] || internalField;
  console.log('mapFieldToApiField - 最終変換結果:', {
    internalField,
    apiField: result
  });
  
  return result;
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

  // メインソートとサブソートの設定を初期化
  let mainSortField = 'created_at';
  let mainSortOrder = 'desc';
  let subSortField: string | null = null;
  let subSortOrder = 'desc';

  // ソートフィルターを保持する配列を初期化
  const sortFilters: Array<{
    key: string;
    field: string;
    apiField: string;
    direction: string | number;
    timestamp: number;
    isPrimarySort: boolean;
  }> = [];

  if (filters) {
    // ソートフィルターを抽出し、主ソートを最優先にする
    const extractedSortFilters = Object.entries(filters)
      .filter(([key, filter]) => key.endsWith('_sort') && filter?.type === 'sort')
      .map(([key, filter]) => {
        // タイムスタンプが0または未定義の場合は、現在時刻を使用
        const timestamp = filter.timestamp && filter.timestamp > 0 
          ? Number(filter.timestamp) 
          : Date.now();
          
        return {
          key,
          field: key.replace('_sort', ''),
          apiField: mapFieldToApiField(key.replace('_sort', '')),
          direction: filter.value,
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

    console.log('API - 抽出されたソートフィルター:', JSON.stringify(
      sortFilters.map(f => ({
        ...f, 
        time: new Date(f.timestamp).toISOString(),
        isCreatedAt: f.field === 'createdAt' || f.field.includes('投稿日時')
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
      if (primarySort.field === 'createdAt' || primarySort.field.includes('投稿日時')) {
        mainSortField = 'created_at';
      } else if (primarySort.field === 'views') {
        mainSortField = 'play_count';
      } else if (primarySort.field === 'likes') {
        mainSortField = 'likes_count';
      } else if (primarySort.field === 'comments') {
        mainSortField = 'comment_count';
      } else if (primarySort.field === 'viewsIncrease' || primarySort.field === '再生増加数') {
        mainSortField = 'play_count_increase';  // 再生増加数の対応を追加
      } else {
        mainSortField = primarySort.apiField;
      }
      mainSortOrder = primarySort.direction.toString();
      
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
        if (secondarySort.field === 'createdAt' || secondarySort.field.includes('投稿日時')) {
          subSortField = 'created_at';
        } else if (secondarySort.field === 'views') {
          subSortField = 'play_count';
        } else if (secondarySort.field === 'likes') {
          subSortField = 'likes_count';
        } else if (secondarySort.field === 'comments') {
          subSortField = 'comment_count';
        } else {
          subSortField = secondarySort.apiField;
        }
        subSortOrder = secondarySort.direction.toString();
      }
    }
    
    console.log('全データ取得 - 最終的なソート設定:', {
      primary: {
        field: mainSortField,
        order: mainSortOrder
      },
      secondary: subSortField ? {
        field: subSortField,
        order: subSortOrder
      } : 'なし'
    });
  }
  
  // 通常のフィルターを処理
  if (filters) {
    // 空のフィルターオブジェクトの場合は全てのフィルターをクリア
    if (Object.keys(filters).length === 0) {
      console.log('API - フィルターが完全にクリアされました');
      // パラメータには既にページ番号とリミットが設定されているので追加のフィルターは不要
    } else {
      Object.entries(filters).forEach(([key, filter]) => {
        if (!filter || key.endsWith('_sort')) return; // ソートフィルターはスキップ
        
        // clearフラグが設定されている場合はこのフィルターをスキップ
        if (filter.clear === true) {
          console.log(`API - フィルター「${key}」をclearフラグによりスキップします`);
          return;
        }
        
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

        // アカウント名フィルターの特別な処理
        if (key === 'accountName' || key === 'アカウント名') {
          console.log('API - アカウント名のフィルタリング処理');
          params.append('account_name', filter.value.toString());
          
          console.log('アカウント名フィルター設定:', {
            value: filter.value.toString(),
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }

        // カテゴリーフィルターの特別な処理
        if (key === 'category' || key === 'ジャンル') {
          console.log('API - カテゴリーのフィルタリング処理');
          params.append('category', filter.value.toString());
          
          console.log('カテゴリーフィルター設定:', {
            value: filter.value.toString(),
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }
        
        // 音楽情報フィルターの特別な処理
        if (key === 'audioTitle' || key === 'BGM') {
          console.log('API - 音楽情報のフィルタリング処理');
          params.append('music_info', filter.value.toString());
          
          console.log('音楽情報フィルター設定:', {
            type: filter.type,
            value: filter.value.toString(),
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }

        // 投稿日時フィルターの特別な処理
        if (key === 'createdAt' || key === '投稿日時') {
          console.log('API - 投稿日時のフィルタリング処理');
          
          // 日付フィルターのタイプに基づいて適切なパラメータを追加
          if (filter.type === 'after' || filter.type === 'greater') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'after');
          } else if (filter.type === 'before' || filter.type === 'less') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'before');
          } else {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date');
          }
          
          console.log('投稿日時フィルター設定:', {
            type: filter.type,
            value: filter.value.toString(),
            queryParams: Object.fromEntries(params.entries())
          });
          return;
        }

        // 数値フィルターの処理
        else if (['greater', 'less', 'equal'].includes(filter.type)) {
          const dbField = mapFieldToApiField(key);
          params.append(dbField, String(filter.value));
          
          // フィルタタイプも追加
          params.append(`${dbField}_type`, filter.type);
        }
        // クリアフィルターの特別処理
        else if (filter.type === 'clear') {
          // このフィールドのフィルターは送信しない（スキップする）
          console.log(`API - フィルター '${key}' はクリアされました`);
        }
      });
    }
  }

  // ソートパラメータを設定
  // 重要: 新しく追加されたソートが主ソートとなるよう、以前のメインソートを二次ソートとして扱う
  if (mainSortField) {
    // 新しく追加されたソートが主ソートになる
    params.append('sort_by', mainSortField);
    params.append('sort_order', mainSortOrder);
    
    console.log('API - 主ソート設定:', {
      sort_by: mainSortField,
      sort_order: mainSortOrder,
      timestamp: sortFilters.length > 0 ? sortFilters[0].timestamp : 0,
      currentTime: new Date().toISOString()
    });

    // 以前のメインソートがある場合は二次ソートとして追加
    if (subSortField) {
      params.append('sort_by_secondary', subSortField);
      params.append('sort_order_secondary', subSortOrder);
      console.log('API - 二次ソートパラメータを追加:', { 
        sort_by_secondary: subSortField, 
        sort_order_secondary: subSortOrder,
        timestamp: sortFilters.length > 1 ? sortFilters[1].timestamp : 0,
        currentTime: new Date().toISOString()
      });
    }
  }

  const url = `${apiUrl}/videos?${params}`;
  console.log('APIリクエストURL:', url);
  console.log('APIリクエストパラメータ完全一覧:', Object.fromEntries(params.entries()));
  
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
          
          return {
            key,
            field: key.replace('_sort', ''),
            apiField: mapFieldToApiField(key.replace('_sort', '')),
            direction: filter.value,
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
      
      // 抽出したソートフィルターをsortFilters配列に追加
      sortFilters.push(...extractedSortFilters);
      
      console.log('抽出されたソートフィルター:', JSON.stringify(
        sortFilters.map(f => ({
          ...f, 
          time: new Date(f.timestamp).toISOString(),
          isCreatedAt: f.field === 'createdAt' || f.field.includes('投稿日時')
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
        if (primarySort.field === 'createdAt' || primarySort.field.includes('投稿日時')) {
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
          if (secondarySort.field === 'createdAt' || secondarySort.field.includes('投稿日時')) {
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
        }
        // カテゴリフィルターの処理
        else if (key === 'category' || apiField === 'category') {
          console.log('API - カテゴリフィルタリング処理');
          
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
        else if (key === 'createdAt' || apiField === 'created_at' || key === '投稿日時') {
          console.log('日付フィルター検出:', {
            key,
            apiField,
            type: filter.type,
            value: filter.value
          });

          // 日付フィルターのタイプに基づいて適切なパラメータを追加
          if (filter.type === 'date' || filter.type === 'equal') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date');
          } else if (filter.type === 'after' || filter.type === 'greater') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'after');
          } else if (filter.type === 'before' || filter.type === 'less') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'before');
          } else {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date');
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
          params.append('category', filter.value.toString());
        }
        // 日付フィルターの処理
        else if (key === 'createdAt' || apiField === 'created_at' || key === '投稿日時') {
          // 日付フィルターのタイプに基づいて適切なパラメータを追加
          if (filter.type === 'after' || filter.type === 'greater') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'after');
          } else if (filter.type === 'before' || filter.type === 'less') {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'before');
          } else {
            params.append('created_at', filter.value.toString());
            params.append('created_at_type', 'date');
          }
        }
        // 数値フィルターの処理
        else if (['greater', 'less', 'equal'].includes(filter.type)) {
          const dbField = mapFieldToApiField(key);
          params.append(dbField, String(filter.value));
          
          // フィルタタイプも追加
          params.append(`${dbField}_type`, filter.type);
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

// 利用可能なジャンル一覧を取得
export async function fetchTrendGenres(): Promise<ApiResponse<string[]>> {
  try {
    console.log('ジャンル取得中...');
    const response = await fetch(`${API_BASE_URL}/api/trends/genres`);
    
    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('取得したジャンルデータ:', result);
    
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