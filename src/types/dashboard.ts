import type { ReactElement, ReactNode } from 'react'

// フィルタ関連の型
export type FilterType = 'equal' | 'greater' | 'less' | 'between' | 'contains' | 'sort' | 'clear' | 'date' | 'number' | 'text' | 'multiselect' | 'multiple';

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
}

export interface FilterValue extends FilterQuery {
  clear?: boolean
  isHashtag?: boolean
  comparison?: ComparisonOperator  // 比較演算子を追加
  filterId?: string  // フィルター識別用のID（オプション）
}

// データ型
export interface VideoData {
  id: string
  url: string
  accountName: string
  videoId: string
  thumbnail: {
    valueType: 'IMAGE'
    url: string
  } | null
  authorName: string
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
}

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
  initialData: VideoData[]
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void
  isLoading: boolean
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
  music_info?: { title: string } | string;  // 追加
  hashtags: string[];
  caption: string;
  category: string;
}

