'use client'

import { useState, forwardRef, useImperativeHandle, useEffect, ReactElement } from 'react'
import type { VideoData, FilterValue, Column, FilterQuery } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'
import Image from 'next/image'
import { TextPopup } from '@/components/ui/text-popup'
import { COLUMN_MAP } from '@/lib/sheets'

interface DataTableProps {
  initialData: VideoData[]
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void
  isLoading: boolean
}

// フィルタ可能なカラムを定義
const FILTERABLE_COLUMNS = [
  'views',
  'viewsIncrease',
  'likes',
  'comments',
  'category',
  'accountName',
  'hashtags',
] as const

type FilterableColumn = typeof FILTERABLE_COLUMNS[number]

// カラム定義で使用
const isFilterable = (key: string): key is FilterableColumn => {
  return FILTERABLE_COLUMNS.includes(key as FilterableColumn)
}

const NoThumbnail = () => (
  <div className="w-[120px] h-[67px] relative bg-gray-100 rounded flex items-center justify-center">
    <svg 
      className="w-8 h-8 text-gray-400" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8l6 4-6 4V8z" />
    </svg>
  </div>
)

// 数値フォーマット関数を追加
const formatNumber = (num: number): ReactElement => {
  return <span>{new Intl.NumberFormat('ja-JP').format(num)}</span>
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({ initialData = [], onFilterChange, isLoading = false }, ref) => {
    const [hasActiveFilters, setHasActiveFilters] = useState(false)
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null)

    useImperativeHandle(ref, () => ({
      clearAllFilters: handleClearAllFilters
    }))

    const handleClearAllFilters = () => {
      setHasActiveFilters(false)
      onFilterChange(false)
    }

    const handleFilter = (field: string) => (filterValue: FilterValue) => {
      if ('clear' in filterValue) {
        onFilterChange(false)
        return
      }

      if ('sort' in filterValue) {
        onFilterChange(true, {
          field: COLUMN_MAP[field],
          type: 'sort',
          value: filterValue.sort
        })
        return
      }

      // フィルタータイプの変換を追加
      const convertedType = filterValue.type === 'gte' ? 'greater' :
                           filterValue.type === 'lte' ? 'less' :
                           filterValue.type === 'after' ? 'greater' :
                           filterValue.type === 'before' ? 'less' :
                           'equal'

      onFilterChange(true, {
        field: COLUMN_MAP[field],
        type: convertedType,
        value: filterValue.value
      })
    }

    const columns: Column[] = [
      {
        accessorKey: 'thumbnail',
        header: ({ column }) => (
          <TableHeaderCell
            title="サムネイル"
            align="left"
          />
        ),
        cell: ({ row }) => {
          if (!row.thumbnail?.url) {
            return <NoThumbnail />
          }

          return (
            <div className="w-[120px] h-[67px] relative bg-gray-100 rounded" data-thumbnail-container={row.id}>
              <Image
                src={row.thumbnail.url}
                alt="サムネイル"
                fill
                sizes="120px"
                className="object-cover rounded"
                unoptimized
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  const container = target.parentElement;
                  if (container) {
                    container.innerHTML = `
                      <div class="w-[120px] h-[67px] relative bg-gray-100 rounded flex items-center justify-center">
                        <svg class="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M10 8l6 4-6 4V8z" />
                        </svg>
                      </div>
                    `;
                  }
                }}
              />
            </div>
          )
        }
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <TableHeaderCell
            title={COLUMN_MAP['createdAt']}
            type="date"
            onFilter={(value) => handleFilter('createdAt')(value)}
          />
        ),
      },
      {
        accessorKey: 'views',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生数"
            type="number"
            onFilter={(value) => handleFilter('views')(value)}
          />
        ),
        cell: ({ row }) => formatNumber(row.views)
      },
      {
        accessorKey: 'viewsIncrease',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('viewsIncrease')(value)}
          />
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <TableHeaderCell
            title="ジャンル"
            onFilter={(value) => handleFilter('category')(value)}
          />
        ),
      },
      {
        accessorKey: 'url',
        header: ({ column }) => (
          <TableHeaderCell
            title="URL"
            onFilter={(value: FilterValue) => handleFilter('url')(value)}
          />
        ),
        cell: ({ row }) => (
          <div className="w-[60px] min-w-[60px]">
            <button 
              onClick={() => setSelectedText({ title: 'URL', content: row.url })}
              className="text-left w-full"
            >
              <a 
                href={row.url}
                className="text-sky-600 hover:underline line-clamp-2 text-xs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                {row.url}
              </a>
            </button>
          </div>
        ),
      },
      {
        accessorKey: 'accountName',
        header: ({ column }) => (
          <TableHeaderCell
            title="アカウント名"
            onFilter={(value) => handleFilter('accountName')(value)}
          />
        ),
        cell: ({ row }) => (
          <span className="truncate" style={{ maxWidth: '120px' }}>
            {row.accountName}
          </span>
        ),
      },
      {
        accessorKey: 'likes',
        header: ({ column }) => (
          <TableHeaderCell
            title="いいね数"
            type="number"
            onFilter={(value) => handleFilter('likes')(value)}
          />
        ),
        cell: ({ row }) => formatNumber(row.likes)
      },
      {
        accessorKey: 'comments',
        header: ({ column }) => (
          <TableHeaderCell
            title="コメント数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('comments')(value)}
          />
        ),
      },
      {
        accessorKey: 'hashtags',
        header: ({ column }) => (
          <TableHeaderCell
            title="ハッシュタグ"
            type="text"
            onFilter={(value) => handleFilter('hashtags')(value)}
          />
        ),
        cell: ({ row }) => (
          <div className="w-[60px] min-w-[60px]">
            <button 
              onClick={() => setSelectedText({ 
                title: 'ハッシュタグ', 
                content: row.hashtags.join(', ') 
              })}
              className="text-left w-full"
            >
              <span className="line-clamp-2 text-xs">
                {row.hashtags.join(', ')}
              </span>
            </button>
          </div>
        ),
      },
      {
        accessorKey: 'audioTitle',
        header: ({ column }) => (
          <TableHeaderCell
            title="BGM"
            onFilter={(value) => handleFilter('audioTitle')(value)}
          />
        ),
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <TableHeaderCell
            title="文字起こし"
            onFilter={(value) => handleFilter('description')(value)}
          />
        ),
      },
    ]

    return (
      <div className="relative">
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          {isLoading && (
            <div className="absolute inset-0 bg-white/50 z-[9999] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          )}
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                {columns.map((column) => (
                  <th 
                    key={column.accessorKey} 
                    className="px-3 py-2 font-normal text-gray-600 bg-gray-50 sticky top-0"
                    style={{ 
                      minWidth: column.accessorKey === 'thumbnail' ? '120px' : '100px'
                    }}
                  >
                    {column.header({ column })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialData.map((row) => (
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  {columns.map((column) => (
                    <td 
                      key={column.accessorKey} 
                      className="px-3 py-2 bg-white"
                      style={{ minWidth: column.accessorKey === 'thumbnail' ? '120px' : '100px' }}
                    >
                      {column.cell 
                        ? column.cell({ row }) 
                        : typeof row[column.accessorKey] === 'object'
                          ? JSON.stringify(row[column.accessorKey])
                          : String(row[column.accessorKey])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {selectedText && (
          <TextPopup
            isOpen={!!selectedText}
            onClose={() => setSelectedText(null)}
            title={selectedText.title}
            content={selectedText.content}
          />
        )}
      </div>
    )
  }
)

DataTable.displayName = 'DataTable' 