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
    const [accountList, setAccountList] = useState<string[]>([])
    const [hashtagList, setHashtagList] = useState<string[]>([])
    const [audioTitleList, setAudioTitleList] = useState<string[]>([])

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

    // コンポーネントマウント時にカテゴリとその他のデータを取得
    useEffect(() => {
      const fetchCategories = async () => {
        try {
          console.log('カテゴリ一覧取得開始');
          const response = await fetch('http://localhost:8080/api/categories');
          
          if (!response.ok) {
            console.error('カテゴリAPI応答エラー:', response.status, response.statusText);
            return;
          }
          
          const data = await response.json();
          console.log('カテゴリAPIレスポンス:', data);
          
          if (data.success) {
            if (Array.isArray(data.categories)) {
              // 詳細なデバッグ: カテゴリデータの内容とコードポイントを確認
              console.log('受信したカテゴリデータ:');
              data.categories.forEach((category: string, index: number) => {
                if (category && typeof category === 'string') {
                  // 文字コードの確認（区切り文字の問題を特定するため）
                  const charCodes = Array.from(category).map(c => c.charCodeAt(0).toString(16));
                  console.log(`カテゴリ[${index}]: "${category}" - 文字コード: [${charCodes.join(', ')}]`);
                  
                  // 「、」の検出と確認
                  const commaPos = category.indexOf('、');
                  if (commaPos >= 0) {
                    console.log(`  「、」を検出: 位置=${commaPos}, コード=${category.charCodeAt(commaPos).toString(16)}`);
                    console.log(`  分割結果: [${category.split('、').map(s => `"${s.trim()}"`).join(', ')}]`);
                  }
                }
              });
              
              // カテゴリを「、」で分割して個別のカテゴリとして扱う
              const allCategories: string[] = [];
              data.categories.forEach((category: string) => {
                // カテゴリが「、」で区切られている場合は分割
                if (category && typeof category === 'string') {
                  // 「、」と「,」両方をチェック（全角・半角の両方に対応）
                  const hasJapaneseComma = category.includes('、');
                  const hasEnglishComma = category.includes(',');
                  if (hasJapaneseComma || hasEnglishComma) {
                    // 両方の区切り文字で分割（まず「、」で分割し、その後各部分を「,」で分割）
                    let splitCategories: string[] = [];
                    
                    // まず「、」で分割
                    const japaneseCommaSplit = hasJapaneseComma ? category.split('、') : [category];
                    
                    // 次に各部分を「,」で分割
                    japaneseCommaSplit.forEach((part: string) => {
                      if (part.includes(',')) {
                        splitCategories.push(...part.split(','));
                      } else {
                        splitCategories.push(part);
                      }
                    });
                    
                    // 各カテゴリの空白を削除
                    splitCategories = splitCategories.map((cat: string) => cat.trim());
                    console.log(`  "${category}" の分割結果: [${splitCategories.join(', ')}]`);
                    allCategories.push(...splitCategories);
                  } else {
                    // hasSlashの条件を削除し、スラッシュによる分割もなし
                    allCategories.push(category);
                  }
                } else {
                  console.warn('無効なカテゴリ値:', category);
                }
              });
              
              // 重複を除去
              const uniqueCategories = [...new Set(allCategories)];
              setCategoryList(uniqueCategories.filter(Boolean) as string[]);
              console.log('処理後のカテゴリ:', uniqueCategories);
            } else {
              console.error('カテゴリデータが配列ではありません:', data.categories);
            }
          } else {
            console.error('カテゴリ取得APIエラー:', data.error);
          }
        } catch (error) {
          console.error('カテゴリの取得中に例外が発生しました:', error);
          setCategoryList([]);
        }
      };

      const fetchAccounts = async () => {
        try {
          // APIエンドポイントを修正
          const response = await fetch('http://localhost:8080/api/accounts');
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
              const accounts = data.data.filter(Boolean);
              setAccountList(accounts as string[]);
              console.log('取得したアカウント:', accounts);
            }
          }
        } catch (error) {
          console.error('アカウントの取得中にエラーが発生しました:', error);
          setAccountList([]);
        }
      };

      const fetchHashtags = async () => {
        try {
          // APIエンドポイントを修正
          const response = await fetch('http://localhost:8080/api/hashtags?limit=100');
          if (response.ok) {
            const data = await response.json();
            console.log('ハッシュタグAPIレスポンス:', data);
            
            if (data.success && Array.isArray(data.data)) {
              // ハッシュタグを抽出
              const allHashtags: string[] = [];
              data.data.forEach((tagObj: any) => {
                if (tagObj && tagObj.hashtag && typeof tagObj.hashtag === 'string') {
                  const hashtag = tagObj.hashtag;
                  console.log(`検出されたハッシュタグ: "${hashtag}"`);
                  
                  // 「、」「,」などで区切られている場合は分割
                  if (hashtag.includes('、') || hashtag.includes(',')) {
                    // まず「、」で分割
                    const parts = hashtag.includes('、') ? hashtag.split('、') : [hashtag];
                    
                    // 次に各部分を「,」で分割
                    parts.forEach((part: string) => {
                      if (part.includes(',')) {
                        const commaSplit = part.split(',').map((t: string) => t.trim());
                        allHashtags.push(...commaSplit);
                      } else {
                        allHashtags.push(part.trim());
                      }
                    });
                  } else {
                    // スラッシュによる分割は行わない
                    allHashtags.push(hashtag);
                  }
                }
              });
              // 重複を除去
              const uniqueHashtags = [...new Set(allHashtags)].filter(Boolean);
              setHashtagList(uniqueHashtags as string[]);
              console.log('処理後のハッシュタグ:', uniqueHashtags);
            }
          }
        } catch (error) {
          console.error('ハッシュタグの取得中にエラーが発生しました:', error);
          setHashtagList([]);
        }
      };

      // BGM(音声タイトル)リストの取得 - APIから取得するように変更
      const fetchAudioTitles = async () => {
        try {
          console.log('BGM一覧取得開始');
          const response = await fetch('http://localhost:8080/api/music');
          
          if (!response.ok) {
            console.error('BGM API応答エラー:', response.status, response.statusText);
            return;
          }
          
          const data = await response.json();
          console.log('BGM APIレスポンス:', data);
          
          if (data.success && Array.isArray(data.data)) {
            // 音声タイトルも「、」で分割して処理
            const allTitles: string[] = [];
            data.data.forEach((title: string) => {
              if (title && typeof title === 'string') {
                console.log(`検出された音声タイトル: "${title}"`);
                
                // 「、」「,」などで区切られている場合は分割
                if (title.includes('、') || title.includes(',')) {
                  // まず「、」で分割
                  const parts = title.includes('、') ? title.split('、') : [title];
                  
                  // 次に各部分を「,」で分割
                  parts.forEach((part: string) => {
                    if (part.includes(',')) {
                      const commaSplit = part.split(',').map((t: string) => t.trim());
                      allTitles.push(...commaSplit);
                    } else {
                      allTitles.push(part.trim());
                    }
                  });
                } else {
                  // スラッシュによる分割は行わない
                  allTitles.push(title);
                }
              }
            });
            // 重複を除去
            const uniqueTitles = [...new Set(allTitles)].filter(Boolean);
            setAudioTitleList(uniqueTitles as string[]);
            console.log('処理後の音声タイトル:', uniqueTitles);
          } else {
            console.error('BGMデータの取得に失敗:', data);
            // 失敗した場合はデータからの抽出を試みる
            extractAudioTitlesFromData();
          }
        } catch (error) {
          console.error('音声タイトルの取得中に例外が発生しました:', error);
          // 失敗した場合はデータからの抽出を試みる
          extractAudioTitlesFromData();
        }
      };

      // データから音声タイトルを抽出するフォールバック処理
      const extractAudioTitlesFromData = () => {
        if (Array.isArray(initialData) && initialData.length > 0) {
          const titles = initialData
            .map(item => item.audioTitle)
            .filter(Boolean);
          
          // 重複を除去
          const uniqueTitles = [...new Set(titles)];
          setAudioTitleList(uniqueTitles);
          console.log('データから抽出した音声タイトル:', uniqueTitles);
        }
      };
      
      // 取得処理の後にデバッグ出力を追加
      const logAvailableData = () => {
        // コンポーネントマウント後、遅延してデータ設定完了を確認
        setTimeout(() => {
          console.log('=== 利用可能なフィルターデータの確認 ===');
          console.log('カテゴリリスト:', categoryList);
          console.log('アカウントリスト:', accountList);
          console.log('ハッシュタグリスト:', hashtagList);
          console.log('BGMリスト:', audioTitleList);
          console.log('===============================');
        }, 1000);
      };
      
      fetchCategories();
      fetchAccounts();
      fetchHashtags();
      fetchAudioTitles(); // extractAudioTitlesの代わりにfetchAudioTitlesを呼び出す
      
      logAvailableData();
    }, [initialData]);

    const handleFilter = (field: string) => (filterValue: FilterValue, shouldMerge = false) => {
      console.log('DataTable handleFilter:', { field, filterValue, shouldMerge });

      // clearフラグがある場合の処理
      if ('clear' in filterValue && filterValue.clear === true) {
        // ソートのクリア処理（type: 'sort'の場合）
        if (filterValue.type === 'sort') {
          console.log('ソート情報のクリア:', { field });
          
          // ソート情報のみをクリア（通常のフィルターはそのまま）
          const newFilters = { ...columnFilters };
          // ソートフィールドの命名パターンに基づいて削除
          const sortKey = `${field}_sort`;
          delete newFilters[sortKey];
          setColumnFilters(newFilters);
          
          // 他のフィルターがあるかどうかを確認
          const hasOtherFilters = Object.keys(newFilters).length > 0;
          
          // ソートリセット情報を親コンポーネントに渡す
          onFilterChange(hasOtherFilters, {
            field: COLUMN_MAP[field] || field,
            type: 'sort',
            value: ''
          });
          return;
        } 
        
        // 通常のフィルタークリア処理
        const newFilters = { ...columnFilters };
        delete newFilters[field];
        setColumnFilters(newFilters);
        
        // 他のフィルターがあるかどうかを確認
        const hasOtherFilters = Object.keys(newFilters).length > 0;
        
        onFilterChange(hasOtherFilters, {
          field: COLUMN_MAP[field] || field,
          type: 'equal',
          value: ''
        });
        return;
      }

      // 以下は通常のフィルター設定処理（変更なし）
      setColumnFilters(prev => ({
        ...prev,
        [field]: true
      }));
      
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

    // フィルタリングされたデータから、各カラムで選択可能な値を抽出する関数
    const getFilteredOptions = useCallback((columnName: string) => {
      // APIで取得した全データの選択肢を使用
      switch (columnName) {
        case 'ジャンル':
          // APIから取得したカテゴリリストを使用（「カテゴリ」を削除し、「その他」を最後にソート）
          return [...categoryList]
            .filter(category => category !== 'カテゴリ') // 「カテゴリ」を除外
            .sort((a, b) => {
              if (a === 'その他') return 1;  // 「その他」を最後に
              if (b === 'その他') return -1; // 「その他」を最後に
              return a.localeCompare(b);     // それ以外は通常のソート
            });
          
        case 'アカウント名':
          // APIから取得したアカウントリストを使用
          return accountList;
          
        case 'ハッシュタグ':
          // APIから取得したハッシュタグリストを使用
          return hashtagList;
          
        case 'BGM':
          // APIから取得したBGMリストを使用
          return audioTitleList;
          
        default:
          return [];
      }
    }, [categoryList, accountList, hashtagList, audioTitleList]);

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
            type="text"
            onFilter={(value) => handleFilter('category')(value)}
            isActive={!!columnFilters['category']}
            categoryData={getFilteredOptions('ジャンル')}
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
            type="text"
            onFilter={(value) => handleFilter('accountName')(value)}
            isActive={!!columnFilters['accountName']}
            categoryData={getFilteredOptions('アカウント名')}
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
            isActive={!!columnFilters['hashtags']}
            categoryData={getFilteredOptions('ハッシュタグ')}
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
            type="text"
            onFilter={(value) => handleFilter('audioTitle')(value)}
            isActive={!!columnFilters['audioTitle']}
            categoryData={getFilteredOptions('BGM')}
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