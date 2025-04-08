'use client'

import { useState, useRef, useEffect, RefObject } from 'react'
import type { FilterValue } from '@/types/dashboard'
import { TIKTOK_COLORS } from '@/lib/constants'

interface FilterPopupProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
  onFilterChange: (filters: Record<string, FilterValue>) => void
  currentFilters: Record<string, FilterValue>
  categories: string[]
  accounts: string[]
  hashtags: string[]
  isLoading: boolean
  onClearAll: () => void
}

// フィルターの型定義
type FilterType = 'date' | 'number' | 'text' | 'category'

// フィルター項目の定義
interface FilterField {
  id: string
  label: string
  type: FilterType
  options?: string[]
}

// カレンダーアイコン
const CalendarIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

// クローズアイコン
const CloseIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// クリアアイコン
const ClearIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="15" y1="9" x2="9" y2="15"></line>
    <line x1="9" y1="9" x2="15" y2="15"></line>
  </svg>
);

export const FilterPopup = ({
  isOpen,
  onClose,
  anchorRef,
  onFilterChange,
  currentFilters,
  categories,
  accounts,
  hashtags,
  isLoading,
  onClearAll
}: FilterPopupProps) => {
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
  const popupRef = useRef<HTMLDivElement>(null)
  const [tempFilters, setTempFilters] = useState<Record<string, FilterValue>>(currentFilters || {})
  const [activeTab, setActiveTab] = useState<'date' | 'metrics' | 'categories' | 'accounts'>('date')

  // フィルターフィールドの定義
  const filterFields: Record<string, FilterField[]> = {
    date: [
      { id: 'createdAt', label: '投稿日時', type: 'date' }
    ],
    metrics: [
      { id: 'views', label: '再生数', type: 'number' },
      { id: 'viewsIncrease', label: '再生増加数', type: 'number' },
      { id: 'likes', label: 'いいね数', type: 'number' },
      { id: 'comments', label: 'コメント数', type: 'number' }
    ],
    categories: [
      { id: 'category', label: '動画ジャンル', type: 'category', options: categories }
    ],
    accounts: [
      { id: 'accountName', label: 'アカウント名', type: 'category', options: accounts },
      { id: 'hashtags', label: 'ハッシュタグ', type: 'category', options: hashtags }
    ]
  }

  // ポップアップの位置を計算
  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPopupPosition({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX
      })
    }
  }, [isOpen, anchorRef])

  // 外部クリックでポップアップを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, anchorRef])

  // コンポーネントマウント時に現在のフィルターを取得
  useEffect(() => {
    if (isOpen) {
      setTempFilters(currentFilters || {})
    }
  }, [isOpen, currentFilters])

  // フィルター変更ハンドラー
  const handleFilterChange = (fieldId: string, value: FilterValue) => {
    setTempFilters(prev => ({
      ...prev,
      [fieldId]: value
    }))
  }

  // フィルタークリアハンドラー
  const handleClearFilter = (fieldId: string) => {
    const newFilters = { ...tempFilters }
    delete newFilters[fieldId]
    setTempFilters(newFilters)
  }

  // すべてのフィルターをクリア
  const handleClearAllFilters = () => {
    setTempFilters({})
    onClearAll()
  }

  // フィルターを適用
  const handleApplyFilters = () => {
    onFilterChange(tempFilters)
  }

  // 日付用のフィルター条件セクション
  const renderDateFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="before"
                checked={isActive && filterValue.comparison === 'before'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date', 
                  comparison: 'before', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">以前</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="after"
                checked={isActive && filterValue.comparison === 'after'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date', 
                  comparison: 'after', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">以降</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="equal"
                checked={isActive && filterValue.comparison === 'equal'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date', 
                  comparison: 'equal', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">等しい</span>
            </label>
          </div>
          
          <div className="flex items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon size={18} />
              </div>
              <input
                type="date"
                className="focus:ring-red-500 focus:border-red-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                value={filterValue?.value || ''}
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date', 
                  comparison: filterValue?.comparison || 'before', 
                  value: e.target.value 
                })}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 数値用のフィルター条件セクション
  const renderNumberFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="greaterThan"
                checked={isActive && filterValue.comparison === 'greaterThan'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'greaterThan', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">より大きい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="equal"
                checked={isActive && filterValue.comparison === 'equal'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'equal', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">等しい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-red-500"
                name={`${field.id}-comparison`}
                value="lessThan"
                checked={isActive && filterValue.comparison === 'lessThan'}
                onChange={() => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'lessThan', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">より小さい</span>
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="number"
              className="focus:ring-red-500 focus:border-red-500 block w-full sm:text-sm border-gray-300 rounded-md"
              value={filterValue?.value || ''}
              placeholder="値を入力"
              onChange={(e) => handleFilterChange(field.id, { 
                field: field.id,
                type: 'number', 
                comparison: filterValue?.comparison || 'greaterThan', 
                value: e.target.value 
              })}
            />
          </div>
        </div>
      </div>
    )
  }

  // カテゴリー用のフィルター条件セクション
  const renderCategoryFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)
    const options = field.options || []

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
          value={filterValue?.value || ''}
          onChange={(e) => handleFilterChange(field.id, { 
            field: field.id,
            type: 'text', 
            comparison: 'contains', 
            value: e.target.value 
          })}
        >
          <option value="">すべて</option>
          {options.map((option, index) => (
            <option key={index} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // アクティブなタブに応じたフィルター項目を表示
  const renderActiveTabContent = () => {
    const fields = filterFields[activeTab] || []
    return (
      <div className="p-4">
        {fields.map((field) => {
          if (field.type === 'date') {
            return renderDateFilter(field)
          } else if (field.type === 'number') {
            return renderNumberFilter(field)
          } else if (field.type === 'category') {
            return renderCategoryFilter(field)
          }
          return null
        })}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div
      ref={popupRef}
      className="absolute z-50 mt-2 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
      style={{
        top: `${popupPosition.top}px`,
        left: `${popupPosition.left}px`,
        width: '360px'
      }}
    >
      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-800">フィルター</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'date' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('date')}
        >
          投稿日
        </button>
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'metrics' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('metrics')}
        >
          再生数等
        </button>
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'categories' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('categories')}
        >
          ジャンル
        </button>
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'accounts' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('accounts')}
        >
          アカウント等
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        </div>
      ) : (
        renderActiveTabContent()
      )}

      <div className="px-4 py-3 bg-gray-50 flex justify-between border-t border-gray-200">
        <button
          onClick={handleClearAllFilters}
          className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          すべてクリア
        </button>
        <button
          onClick={handleApplyFilters}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          適用
        </button>
      </div>
    </div>
  )
} 