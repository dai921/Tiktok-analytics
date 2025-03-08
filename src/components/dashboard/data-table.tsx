'use client'

import { useState, forwardRef, useImperativeHandle, useEffect, ReactElement, useCallback } from 'react'
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

// カテゴリ型の追加
interface CategoryItem {
  category: string;
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({ initialData = [], onFilterChange, onPageChange, currentPage, totalPages, isLoading = false }, ref) => {
    const [hasActiveFilters, setHasActiveFilters] = useState(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, boolean>>({})
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null)
    const [categoryList, setCategoryList] = useState<string[]>([])

    useImperativeHandle(ref, () => ({
      clearAllFilters: handleClearAllFilters
    }))

    const handleClearAllFilters = useCallback(() => {
      console.log('DataTable - handleClearAllFilters called');
      console.log('DataTable - columnFilters before clear:', columnFilters);
      setHasActiveFilters(false)
      setColumnFilters({})
      console.log('DataTable - columnFilters after clear: {}');
      onFilterChange(false)
    }, [onFilterChange, columnFilters])

    // columnFiltersの変更を監視
    useEffect(() => {
      console.log('DataTable - columnFilters changed:', columnFilters);
    }, [columnFilters])

    // コンポーネントマウント時にカテゴリを取得
    useEffect(() => {
      const fetchCategories = async () => {
        try {
          // APIのパスを修正
          const response = await fetch('http://localhost:8080/api/categories');
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.categories)) {
              // カテゴリ名を抽出して、「、」で分割
              let allCategories: string[] = [];
              
              data.categories.forEach((cat: CategoryItem) => {
                if (!cat.category) return;
                
                // 「、」や「,」で区切られたカテゴリを分割
                const splitCategories = cat.category.split(/[、,]/).map(c => c.trim()).filter(Boolean);
                
                // 分割したカテゴリを追加
                allCategories = [...allCategories, ...splitCategories];
              });
              
              // 重複を削除
              const uniqueCategories = [...new Set(allCategories)];
              
              // 「カテゴリ」を削除し、「その他」を除外して並べ替え
              const otherCategory = 'その他';
              const sortedCategories = uniqueCategories
                .filter(cat => cat !== otherCategory && cat !== 'カテゴリ') // カテゴリを除外
                .sort((a, b) => a.localeCompare(b, 'ja'));
              
              // 「その他」があれば最後に追加
              if (uniqueCategories.includes(otherCategory)) {
                sortedCategories.push(otherCategory);
              }
              
              setCategoryList(sortedCategories);
            }
          } else {
            console.error('カテゴリの取得に失敗しました');
            setCategoryList([]);
          }
        } catch (error) {
          console.error('カテゴリの取得中にエラーが発生しました:', error);
          setCategoryList([]);
        }
      };
      
      fetchCategories();
    }, []);

    const handleFilter = (field: string) => (filterValue: FilterValue, shouldMerge = false) => {
      console.log('DataTable handleFilter:', { field, filterValue });

      if ('clear' in filterValue) {
        const newFilters = { ...columnFilters }
        delete newFilters[field]
        setColumnFilters(newFilters)
        onFilterChange(true, {
          field: COLUMN_MAP[field],
          type: 'equal',
          value: ''
        })
        return;
      }

      setColumnFilters(prev => ({
        ...prev,
        [field]: true
      }))
      
      // ハッシュタグの場合は専用フラグを設定
      const isHashtagFilter = field === 'hashtags';
      
      // ジャンルフィールドの場合の特別処理
      if (field === 'category') {
        // 通常のフィルター処理を使用
        // 内部ロジックでジャンルの特別処理を行う
        onFilterChange(true, {
          field,
          value: filterValue.value,
          type: filterValue.type
        });
        
        return;
      }
      
      // その他のフィールドの通常の処理
      if (shouldMerge) {
        setHasActiveFilters(true)
        onFilterChange(true, {
          field,
          value: filterValue.value,
          type: filterValue.type
        })
      } else {
        setHasActiveFilters(true)
        onFilterChange(true, {
          field,
          value: filterValue.value,
          type: filterValue.type
        })
      }
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
        header: ({ column }) => {
          console.log('createdAtヘッダーの設定:', {
            title: COLUMN_MAP['createdAt'],
            mappedField: 'createdAt'
          });
          return (
            <TableHeaderCell
              title={COLUMN_MAP['createdAt']}
              type="date"
              onFilter={(value) => {
                console.log('createdAtのフィルター呼び出し:', value);
                return handleFilter('createdAt')(value);
              }}
              isActive={columnFilters['createdAt']}
            />
          );
        },
      },
      {
        accessorKey: 'views',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生数"
            type="number"
            align="center"
            onFilter={(value) => handleFilter('views')(value)}
            isActive={columnFilters['views']}
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
            isActive={columnFilters['category']}
            categoryData={categoryList}
          />
        ),
      },
      {
        accessorKey: 'url',
        header: ({ column }) => (
          <TableHeaderCell
            title="URL"
            onFilter={(value: FilterValue) => handleFilter('url')(value)}
            isActive={columnFilters['url']}
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
            isActive={columnFilters['accountName']}
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
            isActive={columnFilters['likes']}
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
            isActive={columnFilters['comments']}
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
            isActive={columnFilters['hashtags']}
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
            isActive={columnFilters['audioTitle']}
          />
        ),
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <TableHeaderCell
            title="キャプション"
            onFilter={(value) => handleFilter('description')(value)}
            isActive={columnFilters['description']}
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
                          minWidth: column.accessorKey === 'thumbnail' ? '120px' : '100px',
                          color: columnFilters[column.accessorKey] ? 'var(--color-sky-500)' : undefined
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