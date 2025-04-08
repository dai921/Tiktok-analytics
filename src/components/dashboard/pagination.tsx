'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  pageSize = 10,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50]
}: PaginationProps) {
  const [inputPage, setInputPage] = useState<string>(currentPage.toString())

  // 現在のページが変わった時に入力フォームも更新
  useEffect(() => {
    setInputPage(currentPage.toString())
  }, [currentPage])

  // ページ入力を処理する関数
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPage(e.target.value)
  }

  // 入力が確定（Enterキー押下）されたときの処理
  const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const pageNumber = parseInt(inputPage, 10)
      if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
        onPageChange(pageNumber)
      } else {
        // 有効な値でない場合は現在のページに戻す
        setInputPage(currentPage.toString())
      }
    }
  }

  // フォーカスが外れたときの処理
  const handleBlur = () => {
    const pageNumber = parseInt(inputPage, 10)
    if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
      onPageChange(pageNumber)
    } else {
      // 有効な値でない場合は現在のページに戻す
      setInputPage(currentPage.toString())
    }
  }

  // 表示件数変更時の処理
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10)
    if (onPageSizeChange && !isNaN(newSize)) {
      onPageSizeChange(newSize)
    }
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        
        <div className="flex items-center space-x-1.5">
          <div className="flex border rounded overflow-hidden">
            <input
              type="text"
              value={inputPage}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputSubmit}
              onBlur={handleBlur}
              className="w-12 text-center p-1 text-sm focus:outline-none"
              aria-label="ページ番号"
            />
          </div>
          <span className="text-sm text-gray-700">/ {totalPages}</span>
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {onPageSizeChange && (
        <div className="flex items-center space-x-2">
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className="border rounded p-1 text-sm focus:outline-none bg-white"
            aria-label="表示件数"
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>
                {size}件表示
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
} 