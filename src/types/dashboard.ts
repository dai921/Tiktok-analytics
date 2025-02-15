export type FilterValue = {
  type: 'all' | 'genre' | 'date'
  value: string
  dateRange?: {
    start: string
    end: string
  }
}

export interface VideoData {
  id: string
  date: string
  views: number
  viewsPrev: number
  viewsIncrease: number
  genre: string
  url: string
  accountName: string
  likes: number
  comments: number
  hashtags: string[]
  bgm: string
  transcript: string
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
  onFilter: (value: FilterValue) => void
} 