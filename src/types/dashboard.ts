import type { ReactElement, ReactNode } from 'react'

// フィルタ関連の型
export type FilterType = 
  | 'greater'  // 以上
  | 'less'     // 以下
  | 'equal'    // 等しい
  | 'sort';    // ソート用

export type FilterValue = 
  | {
      type: FilterType
      value: string
    }
  | { sort: 'asc' | 'desc' }
  | { clear: true }

export interface FilterQuery {
  field: string
  type: 'greater' | 'less' | 'equal' | 'sort'
  value: string | number | 'asc' | 'desc'
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
  hashtags: string[]
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
  align?: 'left' | 'right'
  onFilter?: (value: FilterValue) => void
  style?: React.CSSProperties
  field?: string
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