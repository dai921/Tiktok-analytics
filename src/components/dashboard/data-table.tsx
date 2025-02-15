'use client'

import { useState } from 'react'
import type { VideoData, FilterValue } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'

interface DataTableProps {
  initialData: VideoData[]
}

export function DataTable({ initialData }: DataTableProps) {
  const [filteredData, setFilteredData] = useState(initialData)
  const [hasActiveFilters, setHasActiveFilters] = useState(false)

  const handleFilter = (field: string) => (filterValue: any) => {
    if (filterValue.clear) {
      setHasActiveFilters(false)
      setFilteredData(initialData)
      return
    }

    if (filterValue.value || filterValue.sort) {
      setHasActiveFilters(true)
      // ここで実際のフィルター処理を実装
      console.log(`Filtering ${field}:`, filterValue)
    } else {
      setHasActiveFilters(false)
    }
  }

  const handleClearAllFilters = () => {
    setHasActiveFilters(false)
    setFilteredData(initialData)
  }

  return (
    <div className="relative">
      {hasActiveFilters && (
        <div className="absolute top-0 right-0 mb-2">
          <button
            onClick={handleClearAllFilters}
            className="inline-flex items-center px-2.5 py-1.5 text-xs border border-red-200 rounded hover:bg-red-50 text-red-500"
          >
            フィルターを全てクリア
          </button>
        </div>
      )}
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead className="bg-gray-50 border-b">
            <tr>
              <TableHeaderCell 
                title="サムネイル" 
                onFilterAction={handleFilter('thumbnail')}
              />
              <TableHeaderCell 
                title="投稿日" 
                type="date"
                onFilterAction={handleFilter('date')}
              />
              <TableHeaderCell 
                title="再生数"
                type="number"
                align="right" 
                onFilterAction={handleFilter('views')}
              />
              <TableHeaderCell 
                title="再生増加数"
                type="number"
                align="right"
                onFilterAction={handleFilter('viewsIncrease')}
              />
              <TableHeaderCell 
                title="ジャンル"
                onFilterAction={handleFilter('genre')}
              />
              <TableHeaderCell 
                title="URL"
                onFilterAction={handleFilter('url')}
              />
              <TableHeaderCell 
                title="アカウント名"
                onFilterAction={handleFilter('accountName')}
              />
              <TableHeaderCell 
                title="いいね"
                type="number"
                align="right"
                onFilterAction={handleFilter('likes')}
              />
              <TableHeaderCell 
                title="コメント数"
                type="number"
                align="right"
                onFilterAction={handleFilter('comments')}
              />
              <TableHeaderCell 
                title="ハッシュタグ"
                onFilterAction={handleFilter('hashtags')}
              />
              <TableHeaderCell 
                title="BGM"
                onFilterAction={handleFilter('bgm')}
              />
              <TableHeaderCell 
                title="文字起こし"
                onFilterAction={handleFilter('transcript')}
              />
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <div className="w-[120px] h-[67px] bg-gray-100 rounded-sm object-cover"></div>
                </td>
                <td className="px-3 py-2 w-[100px]">{row.date}</td>
                <td className="px-3 py-2 text-right w-[100px]">{row.views.toLocaleString()}</td>
                <td className="px-3 py-2 text-green-600 text-right w-[100px]">{row.viewsIncrease}</td>
                <td className="px-3 py-2 w-[100px]">{row.genre}</td>
                <td className="px-3 py-2 w-[200px]">
                  <a href={row.url} className="text-sky-600 hover:underline truncate block" target="_blank" rel="noopener noreferrer">
                    {row.url}
                  </a>
                </td>
                <td className="px-3 py-2 w-[120px] truncate">{row.accountName}</td>
                <td className="px-3 py-2 text-right w-[100px]">{row.likes.toLocaleString()}</td>
                <td className="px-3 py-2 text-right w-[100px]">{row.comments.toLocaleString()}</td>
                <td className="px-3 py-2 w-[120px] truncate">{row.hashtags.join(', ')}</td>
                <td className="px-3 py-2 w-[120px] truncate">{row.bgm}</td>
                <td className="px-3 py-2 w-[200px]">
                  <span className="line-clamp-2">{row.transcript}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
} 