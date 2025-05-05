import type { ReactElement, ReactNode } from 'react'

// フィルタ関連の型
export type FilterType = 'equal' | 'greater' | 'less' | 'between' | 'contains' | 'sort' | 'clear' | 'date' | 'number' | 'text' | 'multiselect' | 'multiple' | 'indicator' | 'exact_hashtags';

// 比較演算子の型
export type ComparisonOperator = 'before' | 'after' | 'equal' | 'greater' | 'less' | 'contains';

export interface FilterQuery {
  field: string
  type: FilterType
  value: string | number | any[] // value型を拡張して配列も許可
  isHashtag?: boolean
  clear?: boolean
  sortDirection?: 'asc' | 'desc' | null
  timestamp?: number  // ソート操作の順序を特定するためのタイムスタンプ
  isPrimarySort?: boolean  // このソートが主ソートかどうかを示すフラグ
  sortField?: string  // ソート対象のフィールド名（明示的に指定）
  comparison?: ComparisonOperator  // 比較演算子を追加
  filters?: Record<string, FilterValue>  // 複数フィルター用
  active?: boolean  // フィルターがアクティブかどうかを示すフラグ
  isPrOnly?: boolean // PR動画フィルターのフラグを追加
}

export interface FilterValue extends FilterQuery {
  clear?: boolean
  isHashtag?: boolean
  comparison?: ComparisonOperator  // 比較演算子を追加
  filterId?: string  // フィルター識別用のID（オプション）
  active?: boolean   // フィルターがアクティブかどうかを示すフラグ
}

// データ型
export interface VideoData {
  id: string
  url: string
  account_name: string
  videoId: string
  thumbnail_url: {
    valueType: 'IMAGE'
    url: string
  } | null
  description: string
  likes: number
  views: number
  comments: number
  shares: number
  saves: number
  createdAt: string
  hashtags: string[] | string
  duration: number
  isViral: boolean
  prevFetchDate: string
  currentFetchDate: string
  prevViews: number
  viewsIncrease: number
  prevLikes: number
  likesIncrease: number
  product: string
  category: string
  audioId: string
  audioTitle: string
  artist: string
  rank?: number
  predictedViews: number
  display_name: string
  products: string
  ten_days_increase: number
  content_type: string
  account_type: string
  likes_count_increase: number
  ten_days_likes_increase: number
  comment_count_increase: number
  ten_days_comment_increase: number
  save_count: number
  save_count_increase: number
  ten_days_save_increase: number
}

// 数値フォーマット用の型定義を追加
export type NumberFormatType = 
  | 'views' 
  | 'viewsIncrease' 
  | 'likes' 
  | 'comments'
  | 'likes_count_increase'
  | 'ten_days_likes_increase'
  | 'comment_count_increase'
  | 'ten_days_comment_increase'
  | 'ten_days_increase'
  | 'saves'
  | 'save_count_increase'
  | 'ten_days_save_increase'

// テーブル関連の型
export interface Column {
  accessorKey: keyof VideoData
  header: ({ column }: { column: Column }) => ReactElement
  cell?: ({ row }: { row: VideoData }) => ReactElement | null
}

export interface PaginatedResponse {
  data: VideoData[]
  total: number
  currentPage: number
  totalPages: number
  success: boolean
}

// コンポーネントProps
export interface TableHeaderCellProps {
  title: ReactNode
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right' | 'center'
  onFilter?: (value: FilterValue, shouldMerge?: boolean) => void
  style?: React.CSSProperties
  currentFilters?: Record<string, FilterValue>
  isActive?: boolean
  categoryData?: string[]
  sortDirection?: 'asc' | 'desc' | null
  isLoadingFilterOptions?: boolean
}

export interface DataTableProps {
  data: VideoData[];
  onFilterChange: (hasFilters: boolean, filter: FilterValue) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  totalPages: number;
  isLoading?: boolean;
  isPrOnly?: boolean;
  onPrOnlyChange?: (isPrOnly: boolean) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  defaultVisibleColumns?: string[];
  onColumnSettingsChange?: (columns: string[]) => void;
}

export interface FilterPopoverProps {
  title: string
  type?: 'text' | 'number' | 'date'
  onFilter: (value: FilterValue) => void
  onClose: () => void
}

// 必要に応じて型を調整
export interface TikTokVideo {
  url: string;
  thumbnail: string;
  createdAt: string;
  playCount: number;
  likesCount: number;
  commentCount: number;
  accountName: string;
  audioInfo?: { title: string } | string;
  music_info?: { title: string } | string;
  hashtags: string[];
  caption: string;
  category: string;
  account_type: string;
  likes_count_increase: number;
  ten_days_likes_increase: number;
  comment_count_increase: number;
  ten_days_comment_increase: number;
  ten_days_increase: number;
}

export interface AccountData {
  account_name: string;
  display_name?: string;
}

export interface CategoryData {
  category: string;
  count: number;
}

export interface HashtagData {
  hashtags: string;
  count: number;
}

export interface Sort {
  field: string;
  direction: 'asc' | 'desc';
}

