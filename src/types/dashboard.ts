import React from 'react'

export type FilterValue = 
  | {
      type: 'greater' | 'less' | 'equal'
      value: string
    }
  | { sort: 'asc' | 'desc' }
  | { clear: true }

export interface VideoData {
  id: string
  url: string
  accountName: string
  videoId: string
  thumbnail: string
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

export interface FilterPopoverProps {
  title: string
  type?: 'text' | 'number' | 'date'
  onFilter: (value: FilterValue) => void
  onClose: () => void
}

export interface TableHeaderCellProps {
  title: string
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right'
  onFilter?: (value: FilterValue) => void
  style?: React.CSSProperties
}

export interface PaginatedResponse {
  data: VideoData[];
  total: number;
  currentPage: number;
  totalPages: number;
}

export interface Column {
  accessorKey: keyof VideoData
  header: ({ column }: { column: Column }) => React.ReactElement
  cell?: ({ row }: { row: VideoData }) => React.ReactElement | null
} 