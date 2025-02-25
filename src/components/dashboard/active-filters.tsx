'use client'

import { X } from 'lucide-react'
import type { FilterQuery } from '@/types/dashboard'

interface ActiveFiltersProps {
  filters: Record<string, FilterQuery>
  onClearFilter: (field: string) => void
  onClearAll: () => void
}

export function ActiveFilters({ filters, onClearFilter, onClearAll }: ActiveFiltersProps) {
  if (Object.keys(filters).length === 0) return null

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 border-t">
      <span className="text-sm text-gray-500">アクティブなフィルター:</span>
      {Object.entries(filters).map(([field, filter]) => (
        <div key={field} className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-sm">
          <span>{field}: {filter.value}</span>
          <X 
            size={14} 
            className="cursor-pointer"
            onClick={() => onClearFilter(field)}
          />
        </div>
      ))}
      <button 
        onClick={onClearAll}
        className="text-sm text-red-500 hover:text-red-700 ml-auto"
      >
        全てクリア
      </button>
    </div>
  )
} 