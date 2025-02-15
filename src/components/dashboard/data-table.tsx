'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import type { VideoData, FilterValue } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'

interface DataTableProps {
  initialData: VideoData[]
  onFilterChange: (hasFilters: boolean) => void
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({ initialData, onFilterChange }, ref) => {
    const [filteredData, setFilteredData] = useState(initialData)
    const [hasActiveFilters, setHasActiveFilters] = useState(false)

    useImperativeHandle(ref, () => ({
      clearAllFilters: handleClearAllFilters
    }))

    const handleClearAllFilters = () => {
      setHasActiveFilters(false)
      setFilteredData(initialData)
      onFilterChange(false)
    }

    const handleFilter = (field: string) => (filterValue: any) => {
      if (filterValue.clear) {
        setHasActiveFilters(false)
        setFilteredData(initialData)
        onFilterChange(false)
        return
      }

      if (filterValue.value || filterValue.sort) {
        setHasActiveFilters(true)
        onFilterChange(true)
        let result = [...initialData]

        // ソート処理
        if (filterValue.sort) {
          result.sort((a: any, b: any) => {
            const aValue = a[field]
            const bValue = b[field]
            return filterValue.sort === 'asc' 
              ? (aValue > bValue ? 1 : -1)
              : (aValue < bValue ? 1 : -1)
          })
        }

        // フィルター処理
        if (filterValue.value) {
          result = result.filter((item: any) => {
            const itemValue = item[field]
            
            switch (filterValue.type) {
              case 'greater':
                return Number(itemValue) >= Number(filterValue.value)
              case 'less':
                return Number(itemValue) <= Number(filterValue.value)
              case 'equal':
                // 数値の場合は厳密な比較、文字列の場合は部分一致
                return typeof itemValue === 'number'
                  ? itemValue === Number(filterValue.value)
                  : String(itemValue).toLowerCase().includes(filterValue.value.toLowerCase())
              default:
                return true
            }
          })
        }

        setFilteredData(result)
      } else {
        setHasActiveFilters(false)
        onFilterChange(false)
      }
    }

    return (
      <div className="relative">
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-normal text-gray-600 sticky left-0 z-10 bg-gray-50" style={{ minWidth: '120px' }}>サムネイル</th>
                <TableHeaderCell 
                  title="投稿日" 
                  type="date"
                  onFilterAction={handleFilter('date')}
                  style={{ minWidth: '100px' }}
                />
                <TableHeaderCell 
                  title="再生数"
                  type="number"
                  align="right" 
                  onFilterAction={handleFilter('views')}
                  style={{ minWidth: '100px' }}
                />
                <TableHeaderCell 
                  title="再生増加数"
                  type="number"
                  align="right"
                  onFilterAction={handleFilter('viewsIncrease')}
                  style={{ minWidth: '100px' }}
                />
                <TableHeaderCell 
                  title="ジャンル"
                  onFilterAction={handleFilter('genre')}
                  style={{ minWidth: '100px' }}
                />
                <th className="px-3 py-2 font-normal text-gray-600" style={{ minWidth: '120px' }}>URL</th>
                <th className="px-3 py-2 font-normal text-gray-600" style={{ minWidth: '120px' }}>アカウント名</th>
                <TableHeaderCell 
                  title="いいね"
                  type="number"
                  align="right"
                  onFilterAction={handleFilter('likes')}
                  style={{ minWidth: '100px' }}
                />
                <TableHeaderCell 
                  title="コメント数"
                  type="number"
                  align="right"
                  onFilterAction={handleFilter('comments')}
                  style={{ minWidth: '100px' }}
                />
                <th className="px-3 py-2 font-normal text-gray-600" style={{ minWidth: '120px' }}>ハッシュタグ</th>
                <th className="px-3 py-2 font-normal text-gray-600" style={{ minWidth: '120px' }}>BGM</th>
                <th className="px-3 py-2 font-normal text-gray-600" style={{ minWidth: '120px' }}>文字起こし</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => (
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2" style={{ minWidth: '120px' }}>
                    <div className="w-[120px] h-[67px] bg-gray-100 rounded-sm object-cover"></div>
                  </td>
                  <td className="px-3 py-2" style={{ minWidth: '100px' }}>{row.date}</td>
                  <td className="px-3 py-2 text-right" style={{ minWidth: '100px' }}>{row.views.toLocaleString()}</td>
                  <td className="px-3 py-2 text-green-600 text-right" style={{ minWidth: '100px' }}>{row.viewsIncrease}</td>
                  <td className="px-3 py-2" style={{ minWidth: '100px' }}>{row.genre}</td>
                  <td className="px-3 py-2" style={{ minWidth: '120px' }}>
                    <a href={row.url} className="text-sky-600 hover:underline truncate block" target="_blank" rel="noopener noreferrer">
                      {row.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 truncate" style={{ minWidth: '120px' }}>{row.accountName}</td>
                  <td className="px-3 py-2 text-right" style={{ minWidth: '100px' }}>{row.likes.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right" style={{ minWidth: '100px' }}>{row.comments.toLocaleString()}</td>
                  <td className="px-3 py-2 truncate" style={{ minWidth: '120px' }}>{row.hashtags.join(', ')}</td>
                  <td className="px-3 py-2 truncate" style={{ minWidth: '120px' }}>{row.bgm}</td>
                  <td className="px-3 py-2" style={{ minWidth: '120px' }}>
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
)

DataTable.displayName = 'DataTable' 