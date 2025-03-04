'use client'

import { useState, forwardRef, useImperativeHandle, useEffect, ReactElement } from 'react'
import type { VideoData, FilterValue, Column, FilterQuery } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'
import Image from 'next/image'
import { TextPopup } from '@/components/ui/text-popup'
import { COLUMN_MAP } from '@/lib/api'
import { Pagination } from './pagination'
import { ImageHover } from '@/components/ui/image-hover'

interface DataTableProps {
  initialData: VideoData[]
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void
  onPageChange: (page: number) => void
  currentPage: number
  totalPages: number
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
  <div className="w-[160px] h-[90px] relative bg-gray-100 rounded flex items-center justify-center">
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

// 数値フォーマット関数を修正
const formatNumber = (num: number): ReactElement => {
  return (
    <div className="text-center font-medium text-gray-700">
      <span className="tabular-nums">
        {new Intl.NumberFormat('ja-JP').format(num)}
      </span>
    </div>
  )
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({ initialData = [], onFilterChange, onPageChange, currentPage, totalPages, isLoading = false }, ref) => {
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
          value: filterValue.sort as string
        })
        return
      }

      onFilterChange(true, {
        field: COLUMN_MAP[field],
        type: filterValue.type,
        value: filterValue.value
      })
    }

    const handlePageChange = (page: number) => {
      onPageChange(page)
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

          return <ImageHover src={row.thumbnail.url} alt="サムネイル" />
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
            align="center"
            onFilter={(value) => handleFilter('views')(value)}
          />
        ),
        cell: ({ row }) => formatNumber(row.views)
      },
      // 再生増加数のカラムをコメントアウト
      /*
      {
        accessorKey: 'viewsIncrease',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生増加数"
            type="number"
            align="center"
            onFilter={(value) => handleFilter('viewsIncrease')(value)}
          />
        ),
        cell: ({ row }) => formatNumber(row.viewsIncrease)
      },
      */
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
          <div className="w-[100px] min-w-[100px]">
            <button 
              onClick={() => setSelectedText({ title: 'URL', content: row.url })}
              className="text-left w-full"
            >
              <a 
                href={row.url}
                className="text-sky-600 hover:underline line-clamp-1 text-sm"
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
          <div className="w-[100px] min-w-[100px]">
            <span className="truncate block">
              {row.accountName}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'likes',
        header: ({ column }) => (
          <TableHeaderCell
            title="いいね数"
            type="number"
            align="center"
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
            align="center"
            onFilter={(value) => handleFilter('comments')(value)}
          />
        ),
        cell: ({ row }) => formatNumber(row.comments)
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
        cell: ({ row }) => {
          // ハッシュタグの処理
          const hashtags = row.hashtags;
          const caption = row.description || '';
          
          // キャプションからハッシュタグを抽出
          const hashtagsFromCaption = (caption.match(/#[^\s#]+/g) || [])
            .map(tag => tag.replace('#', ''));
          
          // 既存のハッシュタグと結合（重複を除去）
          const allHashtags = [...new Set([
            ...(Array.isArray(hashtags) ? hashtags : []),
            ...hashtagsFromCaption
          ])];
          
          const hashtagString = allHashtags.join(', ');

          return (
            <div className="w-[60px] min-w-[60px]">
              <button 
                onClick={() => setSelectedText({ 
                  title: 'ハッシュタグ', 
                  content: hashtagString || 'ハッシュタグなし'
                })}
                className="text-left w-full"
              >
                <span className="line-clamp-2 text-sm">
                  {hashtagString || 'ハッシュタグなし'}
                </span>
              </button>
            </div>
          )
        }
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
            title="キャプション"
            onFilter={(value) => handleFilter('description')(value)}
          />
        ),
        cell: ({ row }) => (
          <div className="w-[150px] min-w-[150px]">
            <button 
              onClick={() => setSelectedText({ 
                title: '文字起こし', 
                content: row.description 
              })}
              className="text-left w-full"
            >
              <span className="line-clamp-2 text-sm">
                {row.description}
              </span>
            </button>
          </div>
        ),
      },
    ]

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
        
        <div className="relative">
          <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
            {isLoading && (
              <div className="absolute inset-0 bg-white/50 z-[9999] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
              </div>
            )}
            <div className="overflow-x-auto divide-y divide-gray-200">
              <table className="w-full text-sm leading-relaxed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {columns.map((column) => (
                      <th 
                        key={column.accessorKey} 
                        className="px-4 py-3 font-medium text-gray-700 bg-gray-50 sticky top-0"
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
                  {initialData.map((row, rowIndex) => (
                    <tr 
                      key={`row-${row.id || rowIndex}`}
                      className="border-b hover:bg-gray-50 transition-colors duration-150 h-[100px]"
                    >
                      {columns.map((column, colIndex) => (
                        <td 
                          key={`cell-${row.id || rowIndex}-${column.accessorKey || colIndex}`}
                          className={`px-4 py-4 bg-white ${
                            ['views', 'viewsIncrease', 'likes', 'comments'].includes(column.accessorKey) 
                              ? 'text-center font-medium' 
                              : ''
                          }`}
                          style={{ 
                            minWidth: column.accessorKey === 'thumbnail' ? '120px' : '100px',
                            maxHeight: '100px',
                            overflow: 'hidden'
                          }}
                        >
                          {column.cell 
                            ? column.cell({ row }) 
                            : column.accessorKey === 'hashtags'
                              ? (() => {
                                  const value = row[column.accessorKey] as unknown;
                                  console.log('Hashtags value:', value);
                                  console.log('Hashtags type:', typeof value);
                                  console.log('Is array:', Array.isArray(value));
                                  if (Array.isArray(value)) {
                                    return (value as string[]).join(', ');
                                  }
                                  if (typeof value === 'string') {
                                    return value.split(',').filter(Boolean).join(', ');
                                  }
                                  return '';
                                })()
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
        
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
    )
  }
)

DataTable.displayName = 'DataTable' 