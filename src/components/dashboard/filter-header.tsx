'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FilterValue } from '@/types/dashboard'

interface FilterHeaderProps {
  title: string
  type?: 'text' | 'number' | 'date'
  sortDirection?: string | null
  hasFilter: boolean
  onFilterChange: (value: FilterValue) => void
  onSortChange?: () => void
  onFilterClear?: () => void
}

export function FilterHeader({
  title,
  type = 'text',
  sortDirection = null,
  hasFilter = false,
  onFilterChange,
  onSortChange,
  onFilterClear
}: FilterHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterType, setFilterType] = useState<'equal' | 'greater' | 'less'>('equal')
  const [filterValue, setFilterValue] = useState('')

  const renderSortIcon = () => {
    if (sortDirection === 'asc') return <ArrowUp size={14} className="text-blue-500" />
    if (sortDirection === 'desc') return <ArrowDown size={14} className="text-blue-500" />
    return <ArrowUpDown size={14} className="text-gray-400" />
  }

  const handleApplyFilter = () => {
    onFilterChange({
      type: filterType,
      value: filterValue
    })
    setIsOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded group">
            <span className={hasFilter ? "text-blue-500 font-medium" : ""}>
              {title}
            </span>
            <ChevronDown size={14} className={hasFilter ? "text-blue-500" : "text-gray-400"} />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="p-2 w-64">
            <div className="space-y-2">
              {type === 'number' && (
                <>
                  <div className="font-medium mb-2">フィルター条件</div>
                  <select 
                    className="w-full border rounded-md p-1 text-sm"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'equal' | 'greater' | 'less')}
                  >
                    <option value="equal">等しい</option>
                    <option value="greater">以上</option>
                    <option value="less">以下</option>
                  </select>
                  <input 
                    type="number" 
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="w-full border rounded-md p-1 text-sm"
                  />
                </>
              )}

              {type === 'text' && (
                <input 
                  type="text"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="検索..."
                  className="w-full border rounded-md p-1 text-sm"
                />
              )}

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={handleApplyFilter}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm"
                >
                  適用
                </button>
                <button 
                  onClick={onFilterClear}
                  className="px-3 py-1 border rounded-md text-sm"
                >
                  クリア
                </button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      
      <button 
        onClick={onSortChange}
        className="hover:bg-gray-100 p-1 rounded"
      >
        {renderSortIcon()}
      </button>

      {hasFilter && (
        <button 
          onClick={onFilterClear}
          className="hover:bg-gray-100 p-1 rounded text-blue-500"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
} 