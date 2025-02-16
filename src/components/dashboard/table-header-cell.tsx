'use client'

import { useState, ReactNode, useRef, useEffect } from 'react'
import type { FilterValue } from '@/types/dashboard'
import { Portal } from '@radix-ui/react-portal'

interface TableHeaderCellProps {
  title: ReactNode
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right'
  onFilter?: (value: FilterValue) => void
  style?: React.CSSProperties
}

// 幅を設定する関数を定義
const getColumnWidth = (title: ReactNode) => {
  // すべてのカラムで同じ幅を使用
  return 'w-[120px] min-w-[120px]'
}

export function TableHeaderCell({ title, type = 'text', align = 'left', onFilter, style }: TableHeaderCellProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const [filterType, setFilterType] = useState<'greater' | 'less' | 'equal'>('equal')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
  const alignmentClass = align === 'right' ? 'text-right' : 'text-left'

  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isFilterOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      })
    }
  }, [isFilterOpen])

  const handleFilter = (value: string) => {
    console.log('TableHeaderCell handleFilter:', value); // デバッグログ
    setFilterValue(value)
    if (value && onFilter) {
      // 数値型の場合は数値に変換
      const processedValue = type === 'number' ? value : value
      onFilter({ 
        type: filterType, 
        value: processedValue 
      })
      setIsFilterOpen(false)
    }
  }

  const handleSort = () => {
    console.log('TableHeaderCell handleSort'); // デバッグログ
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    setSortDirection(newDirection)
    onFilter?.({ sort: newDirection })
    setIsFilterOpen(false)
  }

  const handleClear = () => {
    setFilterValue('')
    setSortDirection(null)
    setFilterType('equal')
    onFilter?.({ clear: true })
    setIsFilterOpen(false)
  }

  const renderFilterInput = () => {
    switch (type) {
      case 'date':
        return (
          <input
            type="date"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="w-full px-2 py-1 border rounded text-xs"
          />
        )
      case 'number':
        return (
          <input
            type="number"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFilter(filterValue)
              }
            }}
            placeholder="フィルター..."
            className="w-full px-2 py-1 border rounded text-xs"
          />
        )
      default:
        return (
          <input
            type="text"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFilter(filterValue)
              }
            }}
            placeholder="フィルター..."
            className="w-full px-2 py-1 border rounded text-xs"
          />
        )
    }
  }

  return (
    <div className={`px-3 py-2 font-normal text-gray-600 relative ${alignmentClass} ${getColumnWidth(title)}`}>
      <div className="flex items-center justify-between">
        <span>{title}</span>
        {onFilter && (
          <button 
            ref={buttonRef}
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
        )}
      </div>
      {isFilterOpen && (
        <Portal>
          <div 
            className="fixed bg-white border rounded shadow-lg z-[9999] text-sm w-[200px]"
            style={{ top: position.top, left: position.left }}
          >
            <div className="p-2 border-b">
              <div className="flex items-center gap-2 mb-2">
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as 'greater' | 'less' | 'equal')}
                  className="px-2 py-1 border rounded text-xs"
                >
                  <option value="equal">等しい</option>
                  <option value="greater">以降</option>
                  <option value="less">以前</option>
                </select>
                {renderFilterInput()}
              </div>
              <button
                onClick={() => handleFilter(filterValue)}
                className="w-full text-left px-2 py-1 text-xs bg-sky-500 text-white hover:bg-sky-600 rounded mb-2"
              >
                フィルターを適用
              </button>
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
        </Portal>
      )}
    </div>
  )
} 