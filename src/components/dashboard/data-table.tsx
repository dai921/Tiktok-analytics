'use client'

import { useState, useRef, useEffect, forwardRef, useCallback, useImperativeHandle, ReactElement } from 'react'
import type { VideoData, FilterValue, Column, FilterQuery } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'
import Image from 'next/image'
import { TextPopup } from '@/components/ui/text-popup'
import { COLUMN_MAP } from '@/lib/api'
import { Pagination } from './pagination'
import { ImageHover } from '@/components/ui/image-hover'
import { getAllFilteredData } from '@/lib/api'

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
    const [currentFilters, setCurrentFilters] = useState<Record<string, FilterQuery>>({})
    const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false)
    
    // API関連の設定
    const API_BASE_URL = 'http://localhost:8080';

    // 参照を設定
    useImperativeHandle(ref, () => ({
      clearAllFilters: handleClearAllFilters
    }));

    // フィルターをクリアする関数
    const handleClearAllFilters = useCallback(() => {
      console.log('DataTable - handleClearAllFilters called');
      console.log('DataTable - columnFilters before clear:', columnFilters);
      setHasActiveFilters(false);
      setColumnFilters({});
      setCurrentFilters({});
      console.log('DataTable - columnFilters after clear: {}');
      onFilterChange(false);
    }, [onFilterChange, columnFilters]);

    // columnFiltersの変更を監視
    useEffect(() => {
      console.log('DataTable - columnFilters changed:', columnFilters);
    }, [columnFilters]);

    // API から各種選択肢データを取得する関数
    const fetchCategoriesFromApi = async () => {
      try {
        console.log('カテゴリ一覧取得開始');
        const response = await fetch(`${API_BASE_URL}/api/categories`);
        
        if (!response.ok) {
          console.error('カテゴリAPI応答エラー:', response.status, response.statusText);
          return;
        }
        
        const data = await response.json();
        console.log('カテゴリAPIレスポンス:', data);
        
        if (data.success) {
          if (Array.isArray(data.categories)) {
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
                  allCategories.push(...splitCategories);
                } else {
                  allCategories.push(category);
                }
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

    const fetchAccountsFromApi = async () => {
      try {
        // APIエンドポイントを修正
        const response = await fetch(`${API_BASE_URL}/api/accounts`);
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

    const fetchHashtagsFromApi = async () => {
      try {
        // APIエンドポイントを修正
        const response = await fetch(`${API_BASE_URL}/api/hashtags?limit=100`);
        if (response.ok) {
          const data = await response.json();
          console.log('ハッシュタグAPIレスポンス:', data);
          
          if (data.success && Array.isArray(data.data)) {
            // ハッシュタグを抽出
            const allHashtags: string[] = [];
            data.data.forEach((tagObj: any) => {
              if (tagObj && tagObj.hashtag && typeof tagObj.hashtag === 'string') {
                const hashtag = tagObj.hashtag;
                
                // 「、」「,」などで区切られている場合は分割
                if (hashtag.includes('、') || hashtag.includes(',')) {
                  const splitTags = hashtag.split(/[、,]/).map((tag: string) => tag.trim()).filter(Boolean);
                  allHashtags.push(...splitTags);
                } else {
                  allHashtags.push(hashtag);
                }
              }
            });
            
            const uniqueHashtags = [...new Set(allHashtags)].filter(Boolean);
            // 型キャストを使用してエラーを解決
            setHashtagList(uniqueHashtags as string[]);
            console.log('処理後のハッシュタグ:', uniqueHashtags);
          }
        }
      } catch (error) {
        console.error('ハッシュタグの取得中にエラーが発生しました:', error);
        setHashtagList([]);
      }
    };

    const fetchAudioTitlesFromApi = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/music?limit=100`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.data)) {
            const audioTitles = data.data
              .filter((item: any) => item && item.audio_title)
              .map((item: any) => item.audio_title)
              .filter(Boolean);
            
            const uniqueTitles = [...new Set(audioTitles)];
            setAudioTitleList(uniqueTitles as string[]);
            console.log('取得した音声タイトル:', uniqueTitles);
          }
        }
      } catch (error) {
        console.error('音声タイトルの取得中にエラーが発生しました:', error);
        setAudioTitleList([]);
      }
    };

    // コンポーネント初期表示時に、選択肢データを取得
    useEffect(() => {
      console.log('初回レンダリング時のデータ取得開始');
      // 選択肢データの初期ロード
      fetchCategoriesFromApi();
      fetchAccountsFromApi();
      fetchHashtagsFromApi();
      fetchAudioTitlesFromApi();
    }, []);

    // フィルターが変更されたときに全データから選択肢を生成する
    useEffect(() => {
      const loadAllFilteredOptions = async () => {
        if (!hasActiveFilters) return;
        
        try {
          setIsLoadingFilterOptions(true);
          console.log('フィルターによる全データ取得開始:', currentFilters);
          
          // 現在のフィルター条件で全データを取得
          const result = await getAllFilteredData(currentFilters);
          
          if (result.success && result.data.length > 0) {
            console.log(`フィルター条件に一致する全データ取得成功: ${result.data.length}件`);
            
            // 全データから選択肢を抽出
            extractOptionsFromData(result.data);
          } else {
            console.error('フィルターデータの取得に失敗:', result.error || '不明なエラー');
          }
        } catch (error) {
          console.error('フィルター選択肢取得中のエラー:', error);
        } finally {
          setIsLoadingFilterOptions(false);
        }
      };
      
      // 選択肢を抽出する共通関数
      const extractOptionsFromData = (data: VideoData[]) => {
        // カテゴリを抽出
        const categories = new Set<string>();
        data.forEach(item => {
          if (item.category) {
            // カテゴリが「、」や「,」で区切られている場合は分割
            const categoryItems = typeof item.category === 'string' 
              ? item.category.split(/[、,]/).map(cat => cat.trim())
              : [];
            categoryItems.forEach(cat => {
              if (cat) categories.add(cat);
            });
          }
        });
        
        // アカウント名を抽出
        const accounts = new Set<string>();
        data.forEach(item => {
          if (item.accountName) {
            accounts.add(item.accountName);
          }
        });
        
        // ハッシュタグを抽出
        const hashtags = new Set<string>();
        data.forEach(item => {
          if (item.hashtags) {
            // hashtagsが配列の場合はそのまま使用し、文字列の場合は分割する
            if (Array.isArray(item.hashtags)) {
              item.hashtags.forEach(tag => {
                if (tag) hashtags.add(tag);
              });
            } else if (typeof item.hashtags === 'string') {
              // 文字列の場合は分割して処理
              const hashtagStr = item.hashtags;
              hashtagStr.split(/[\s#]/).forEach(tag => {
                if (tag) hashtags.add(tag);
              });
            }
          }
        });
        
        // 音声タイトルを抽出
        const audioTitles = new Set<string>();
        data.forEach(item => {
          if (item.audioTitle) {
            audioTitles.add(item.audioTitle);
          }
        });
        
        // 選択肢を更新
        setCategoryList(Array.from(categories).filter(Boolean) as string[]);
        setAccountList(Array.from(accounts).filter(Boolean) as string[]);
        setHashtagList(Array.from(hashtags).filter(Boolean) as string[]);
        setAudioTitleList(Array.from(audioTitles).filter(Boolean) as string[]);
        
        console.log('フィルターデータから選択肢を生成:', {
          カテゴリ数: categories.size,
          アカウント数: accounts.size,
          ハッシュタグ数: hashtags.size,
          音声タイトル数: audioTitles.size
        });
      };
      
      if (hasActiveFilters && Object.keys(currentFilters).length > 0) {
        loadAllFilteredOptions();
      }
    }, [currentFilters, hasActiveFilters]);

    // フィルターハンドラーを更新して現在のフィルターを保存するように
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
          
          // 現在のフィルター条件からも削除
          const newCurrentFilters = { ...currentFilters };
          delete newCurrentFilters[`${field}_sort`];
          setCurrentFilters(newCurrentFilters);
          
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
        
        // 現在のフィルター条件からも削除
        const newCurrentFilters = { ...currentFilters };
        delete newCurrentFilters[field];
        setCurrentFilters(newCurrentFilters);
        
        // 他のフィルターがあるかどうかを確認
        const hasOtherFilters = Object.keys(newFilters).length > 0;
        
        onFilterChange(hasOtherFilters, {
          field: COLUMN_MAP[field] || field,
          type: filterValue.type,
          value: '',
          clear: true
        });
        return;
      }

      // ソートフィルターの場合の処理（ソート情報のみを更新）
      if (filterValue.type === 'sort') {
        const sortKey = `${field}_sort`;
        setColumnFilters(prev => ({
          ...prev,
          [sortKey]: true
        }));
        
        // 現在のフィルター条件にも保存
        setCurrentFilters(prev => ({
          ...prev,
          [sortKey]: {
            field: COLUMN_MAP[field] || field,
            type: 'sort',
            value: filterValue.value
          }
        }));
        
        // ソート情報を親コンポーネントに渡す
        onFilterChange(true, {
          field: COLUMN_MAP[field] || field,
          type: 'sort',
          value: filterValue.value
        });
        return;
      }

      // 通常のフィルター処理
      const isHashtagFilter = field === 'hashtags';
      setColumnFilters(prev => ({
        ...prev,
        [field]: true
      }));
      
      // ハッシュタグフラグが設定されているかチェック
      if (isHashtagFilter || 'isHashtag' in filterValue) {
        // 現在のフィルター条件にも保存
        setCurrentFilters(prev => ({
          ...prev,
          [field]: {
            field: COLUMN_MAP[field] || field,
            value: filterValue.value,
            type: filterValue.type,
            isHashtag: true
          }
        }));
        
        setHasActiveFilters(true);
        onFilterChange(true, {
          field: COLUMN_MAP[field] || field,
          value: filterValue.value,
          type: filterValue.type,
          isHashtag: true
        });
      } else if (shouldMerge) {
        // 現在のフィルター条件にも保存
        setCurrentFilters(prev => ({
          ...prev,
          [field]: {
            field: COLUMN_MAP[field] || field,
            value: filterValue.value,
            type: filterValue.type
          }
        }));
        
        setHasActiveFilters(true);
        onFilterChange(true, {
          field: COLUMN_MAP[field] || field,
          value: filterValue.value,
          type: filterValue.type
        });
      } else {
        // 現在のフィルター条件にも保存
        setCurrentFilters(prev => ({
          ...prev,
          [field]: {
            field: COLUMN_MAP[field] || field,
            value: filterValue.value,
            type: filterValue.type
          }
        }));
        
        setHasActiveFilters(true);
        onFilterChange(true, {
          field: COLUMN_MAP[field] || field,
          value: filterValue.value,
          type: filterValue.type
        });
      }
    };

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