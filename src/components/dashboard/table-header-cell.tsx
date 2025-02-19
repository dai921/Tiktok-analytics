'use client'

import { useState, ReactNode, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { FilterValue, FilterType } from '@/types/dashboard'
import { Portal } from '@radix-ui/react-portal'
import { cn } from '@/lib/utils'

interface TableHeaderCellProps {
  title: string
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right' | 'center'
  onFilter?: (value: FilterValue) => void
  style?: React.CSSProperties
}

export interface TableHeaderCellRef {
  clearFilter: () => void
}

// 幅を設定する関数を定義
const getColumnWidth = (title: ReactNode) => {
  // すべてのカラムで同じ幅を使用
  return 'w-[120px] min-w-[120px]'
}

// 選択肢を動的に生成
const getFilterOptions = (type: 'text' | 'number' | 'date') => {
  switch (type) {
    case 'number':
      return [
        { value: 'equal' as const, label: '等しい' },
        { value: 'greater' as const, label: '以上' },
        { value: 'less' as const, label: '以下' }
      ]
    case 'date':
      return [
        { value: 'equal' as const, label: '等しい' },
        { value: 'after' as const, label: '以降' },
        { value: 'before' as const, label: '以前' }
      ]
    default:
      return [
        { value: 'equal' as const, label: '等しい' }
      ]
  }
}

export const TableHeaderCell = forwardRef<TableHeaderCellRef, TableHeaderCellProps>(
  ({ title, type = 'text', align = 'left', onFilter }, ref) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [filterValue, setFilterValue] = useState('')
    const [filterType, setFilterType] = useState<FilterType>('equal')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
    const [isActive, setIsActive] = useState(false)

    const [position, setPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef<HTMLButtonElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)

    // ポップアップの位置を更新
    useEffect(() => {
      if (isFilterOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + window.scrollY + 4,  // ボタンの下に4pxの余白
          left: rect.left + window.scrollX
        })
      }
    }, [isFilterOpen])

    // クリックアウトサイドの処理を追加
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (isFilterOpen && 
            popupRef.current && 
            buttonRef.current && 
            !popupRef.current.contains(event.target as Node) &&
            !buttonRef.current.contains(event.target as Node)) {
          setIsFilterOpen(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isFilterOpen])

    const handleSort = () => {
      // 他のカラムのソートとアクティブ状態をクリア
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        if (el !== buttonRef.current?.closest('[data-header-cell]')) {
          const button = el.querySelector('button');
          if (button) {
            button.setAttribute('data-sort-active', 'false');
            button.classList.remove('text-sky-500');
          }
          el.classList.remove('text-blue-600', 'font-medium');
        }
      });

      const newDirection = sortDirection === null ? 'desc' : 
                          sortDirection === 'desc' ? 'asc' : null
      setSortDirection(newDirection)
      setIsActive(!!newDirection || !!filterValue)

      if (newDirection) {
        onFilter?.({
          field: title,
          type: 'sort',
          value: newDirection
        })
      } else {
        handleClear()
      }
      setIsFilterOpen(false)
    }

    const handleClear = () => {
      // 全てのヘッダーセルのスタイルをリセット
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        const button = el.querySelector('button');
        if (button) {
          button.setAttribute('data-sort-active', 'false');
          button.classList.remove('text-sky-500');
        }
        el.classList.remove('text-blue-600', 'font-medium');
      });

      setFilterValue('')
      setSortDirection(null)
      setFilterType('equal')
      setIsActive(false)
      onFilter?.({
        field: title,
        type: 'equal',
        value: '',
        clear: true
      })
      setIsFilterOpen(false)
    }

    const handleFilter = (value: string, filterType: FilterType) => {
      if (!onFilter) return
      setFilterValue(value)
      setIsActive(!!value || !!sortDirection)
      onFilter({
        field: title,
        type: filterType,
        value
      })
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
                  handleFilter(filterValue, filterType)
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
                  handleFilter(filterValue, filterType)
                }
              }}
              placeholder="フィルター..."
              className="w-full px-2 py-1 border rounded text-xs"
            />
          )
      }
    }

    const hasFilter = !!onFilter

    const getSortLabel = () => {
      // 数値フィールドの場合
      if (type === 'number') {
        return sortDirection === null ? '▼ 大きい順に並び替え' :
               sortDirection === 'desc' ? '▲ 小さい順に並び替え' : 
               '▼ 大きい順に並び替え';
      }
      
      // その他のフィールド
      return sortDirection === null ? '▼ 降順に並び替え' :
             sortDirection === 'desc' ? '▲ 昇順に並び替え' : 
             '▼ 降順に並び替え';
    };

    // 外部からアクセスできるようにする
    useImperativeHandle(ref, () => ({
      clearFilter: handleClear
    }))

    return (
      <div 
        data-header-cell
        className={cn(
          "flex items-center gap-1 whitespace-nowrap",
          "px-2 py-1 text-gray-700 text-sm",
          align === 'center' ? 'justify-center' : '',
          isActive ? "text-blue-600 font-medium" : ""
        )}
      >
        <div className="flex items-center gap-2">
          <span className="truncate">{title}</span>
          {onFilter && (
            <button 
              ref={buttonRef}
              data-sort-active={!!sortDirection}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-1 hover:bg-gray-100 rounded ${isActive ? 'text-sky-500' : ''}`}
            >
              <svg 
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor"
                strokeWidth={isActive ? "3" : "2"}
              >
                <path d="M3 4h18M6 9h12M9 14h6M11 19h2" />
              </svg>
            </button>
          )}
        </div>
        {isFilterOpen && (
          <Portal>
            <div 
              ref={popupRef}
              className="fixed bg-white border rounded shadow-lg z-[9999] text-sm w-[200px]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="p-2 border-b">
                <div className="flex items-center gap-2 mb-2">
                  <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as FilterType)}
                    className="px-2 py-1 border rounded text-xs"
                  >
                    {getFilterOptions(type).map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {renderFilterInput()}
                </div>
                <button
                  onClick={() => handleFilter(filterValue, filterType)}
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
                  {getSortLabel()}
                </button>
              </div>
            </div>
          </Portal>
        )}
      </div>
    )
  }
)

TableHeaderCell.displayName = 'TableHeaderCell' 