'use client'

import { useState, ReactNode } from 'react'
import type { FilterValue } from '@/types/dashboard'

interface TableHeaderCellProps {
  title: ReactNode
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right'
  onFilterAction: (value: any) => void
}

// 幅を設定する関数を定義
const getColumnWidth = (title: ReactNode) => {
  // すべてのカラムで同じ幅を使用
  return 'w-[120px] min-w-[120px]'
}

export function TableHeaderCell({ title, type = 'text', align = 'left', onFilterAction }: TableHeaderCellProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const [filterType, setFilterType] = useState<'greater' | 'less' | 'equal'>('equal')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
  const alignmentClass = align === 'right' ? 'text-right' : 'text-left'

  const handleFilter = (value: string) => {
    setFilterValue(value)
    if (value) {
      onFilterAction({ value, type: filterType })
      setIsFilterOpen(false)
    }
  }

  const handleSort = () => {
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    setSortDirection(newDirection)
    onFilterAction({ sort: newDirection })
    setIsFilterOpen(false)
  }

  const handleClear = () => {
    setFilterValue('')
    setSortDirection(null)
    setFilterType('equal')
    onFilterAction({ clear: true })
    setIsFilterOpen(false)
  }

  return (
    <th className={`px-3 py-2 font-normal text-gray-600 relative ${alignmentClass} ${getColumnWidth(title)}`}>
      <div className="flex items-center justify-between">
        <span>{title}</span>
        <button 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`p-1 hover:bg-gray-100 rounded ${filterValue || sortDirection ? 'text-sky-500' : ''}`}
        >
          <svg 
            className="w-4 h-4"
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor"
            strokeWidth={filterValue || sortDirection ? "3" : "2"}
          >
            <path d="M3 4h18M6 9h12M9 14h6M11 19h2" />
          </svg>
        </button>
      </div>
      {isFilterOpen && (
        <div className="absolute top-full left-0 mt-1 w-[200px] bg-white border rounded shadow-lg z-20 text-sm">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 mb-2">
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-2 py-1 border rounded text-xs"
              >
                <option value="equal">等しい</option>
                <option value="greater">以上</option>
                <option value="less">以下</option>
              </select>
              <input
                type={type === 'number' ? 'number' : 'text'}
                value={filterValue}
                onChange={(e) => handleFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFilter(filterValue)
                  }
                }}
                placeholder="フィルター..."
                className="w-full px-2 py-1 border rounded text-xs"
              />
            </div>
            {(filterValue || sortDirection) && (
              <button
                onClick={handleClear}
                className="w-full text-left px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
              >
                フィルターをクリア
              </button>
            )}
          </div>
          <div className="p-2 border-t">
            <button 
              onClick={handleSort}
              className="w-full text-left px-2 py-1 hover:bg-gray-50 rounded text-xs"
            >
              {sortDirection === 'asc' ? '▼ 降順に並び替え' : '▲ 昇順に並び替え'}
            </button>
          </div>
        </div>
      )}
    </th>
  )
} 