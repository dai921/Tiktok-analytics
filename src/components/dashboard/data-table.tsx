'use client'

import { useState, useRef, useEffect, forwardRef, useCallback, useImperativeHandle, ReactElement } from 'react'
import type { VideoData, FilterValue, Column, FilterQuery } from '@/types/dashboard'
import { TableHeaderCell } from './table-header-cell'
import Image from 'next/image'
import { TextPopup } from '@/components/ui/text-popup'
import { COLUMN_MAP } from '@/lib/api'
import { Pagination } from './pagination'
import { ImageHover } from '@/components/ui/image-hover'
import { getFilterOptions } from '@/lib/api'

interface DataTableProps {
  initialData: VideoData[]
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void
  onPageChange: (page: number) => void
  currentPage: number
  totalPages: number
  isLoading: boolean
  isPrOnly: boolean
  onPrOnlyChange: (isPrOnly: boolean) => void
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

const TIKTOK_COLORS = {
  black: "#000000",
  cyan: "#25F4EE",
  red: "#FE2C55",
  white: "#FFFFFF",
  green: "#4CAF50"  // 緑色を追加
} as const;

// サイズを props として受け取るように修正
const VideoTypeIcon = ({ size = 32 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 80 80" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="40" cy="40" r="35" fill={TIKTOK_COLORS.black} />
    <path d="M40 75C59.33 75 75 59.33 75 40C75 20.67 59.33 5 40 5" stroke={TIKTOK_COLORS.cyan} strokeWidth="10" />
    <path d="M40 5C20.67 5 5 20.67 5 40C5 59.33 20.67 75 40 75" stroke={TIKTOK_COLORS.white} strokeWidth="3" />
    <circle cx="40" cy="40" r="18" fill={TIKTOK_COLORS.red} />
    <path d="M48 40L36 48V32L48 40Z" fill={TIKTOK_COLORS.white} />
  </svg>
);

// サイズを props として受け取るように修正
const PhotoTypeIcon = ({ size = 32 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 80 80" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="15" y="15" width="50" height="50" rx="4" fill={TIKTOK_COLORS.black} />
    <rect x="15" y="15" width="50" height="50" rx="4" stroke={TIKTOK_COLORS.cyan} strokeWidth="3" fill="none" />
    <rect x="20" y="20" width="40" height="40" rx="2" fill={TIKTOK_COLORS.white} />
    <path d="M20 50L30 40L40 50L50 35L60 50V60H20V50Z" fill={TIKTOK_COLORS.red} />
    <circle cx="50" cy="30" r="5" fill={TIKTOK_COLORS.red} />
  </svg>
);

// ハートアイコン（アウトライン）を追加
const HeartIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={TIKTOK_COLORS.red} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
);

// コメントアイコン（アウトライン）を追加
const CommentIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={TIKTOK_COLORS.cyan} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

// 上矢印アイコンを追加
const UpArrowIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={TIKTOK_COLORS.green} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12L12 5l7 7"/>
  </svg>
);

// 数値フォーマット関数を修正 - num と type を受け取るように変更
const formatNumber = (num: number, type?: 'views' | 'viewsIncrease' | 'likes' | 'comments'): ReactElement => {
  const formattedNum = new Intl.NumberFormat('ja-JP').format(num);
  
  // 再生増加数の場合
  if (type === 'viewsIncrease' && num > 0) {
    return (
      <div className="text-center font-medium text-green-600 flex items-center justify-center">
        <UpArrowIcon size={14} />
        <span className="tabular-nums ml-1">
          {formattedNum}
        </span>
      </div>
    );
  }
  
  // いいね数の場合
  if (type === 'likes') {
    return (
      <div className="text-center font-medium text-gray-700 flex items-center justify-center">
        <HeartIcon size={14} />
        <span className="tabular-nums ml-1">
          {formattedNum}
        </span>
      </div>
    );
  }
  
  // コメント数の場合
  if (type === 'comments') {
    return (
      <div className="text-center font-medium text-gray-700 flex items-center justify-center">
        <CommentIcon size={14} />
        <span className="tabular-nums ml-1">
          {formattedNum}
        </span>
      </div>
    );
  }
  
  // 通常の数値表示
  return (
    <div className="text-center font-medium text-gray-700">
      <span className="tabular-nums">
        {formattedNum}
      </span>
    </div>
  );
};

// カテゴリ型の追加
interface CategoryItem {
  category: string;
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({ initialData = [], onFilterChange, onPageChange, currentPage, totalPages, isLoading = false, isPrOnly = false, onPrOnlyChange }, ref) => {
    const [hasActiveFilters, setHasActiveFilters] = useState(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, FilterValue>>({})
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null)
    const [categoryList, setCategoryList] = useState<string[]>([])
    const [accountList, setAccountList] = useState<string[]>([])
    const [hashtagList, setHashtagList] = useState<string[]>([])
    const [audioTitleList, setAudioTitleList] = useState<string[]>([])
    const [currentFilters, setCurrentFilters] = useState<Record<string, FilterQuery>>({})
    const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false)
    const [sortField, setSortField] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
    
    // API関連の設定
    const API_BASE_URL = 'http://localhost:8080';

    // 最後にクリックしたソートフィールドを追跡
    const [lastClickedSort, setLastClickedSort] = useState<string | null>(null);

    // 参照を設定
    useImperativeHandle(ref, () => ({
      clearAllFilters: handleClearAllFilters
    }));

    // フィルターをクリアする関数
    const handleClearAllFilters = useCallback(() => {
      console.log('DataTable - handleClearAllFilters called');
      console.log('DataTable - columnFilters before clear:', columnFilters);
      
      // 状態をリセット
      setHasActiveFilters(false);
      setColumnFilters({});
      setCurrentFilters({});
      setSortField(null);
      setSortDirection(null);
      
      console.log('DataTable - columnFilters after clear: {}');
      
      // 親コンポーネントに通知
      onFilterChange(false);
      
      // 遅延実行は無限ループの原因になる可能性があるため削除
    }, [onFilterChange]);

    // columnFiltersの変更を監視
    useEffect(() => {
      console.log('DataTable - columnFilters changed:', columnFilters);
    }, [columnFilters]);

    // フィルター条件に基づいて選択肢を取得する関数（共通関数として抽出）
    const loadFilterOptions = useCallback(async () => {
      try {
        setIsLoadingFilterOptions(true);
        console.log('フィルター条件に基づく選択肢データの取得開始:', {
          currentFilters,
          フィルター数: Object.keys(currentFilters).length,
          詳細: JSON.stringify(currentFilters)
        });
        
        // 最適化されたAPIを使って選択肢のみを取得
        const result = await getFilterOptions(currentFilters);
        
        if (result.success) {
          console.log(`選択肢データの取得成功:`, {
            カテゴリ数: result.categories.length,
            アカウント数: result.accounts.length,
            ハッシュタグ数: result.hashtags.length,
            音声タイトル数: result.music.length,
            カテゴリサンプル: result.categories.slice(0, 3)
          });
          
          // 取得した選択肢をセット
          setCategoryList(result.categories);
          setAccountList(result.accounts);
          setHashtagList(result.hashtags);
          setAudioTitleList(result.music);
        } else {
          console.error('選択肢データの取得に失敗:', result.error || '不明なエラー');
        }
      } catch (error) {
        console.error('フィルター選択肢取得中のエラー:', error);
      } finally {
        setIsLoadingFilterOptions(false);
      }
    }, [currentFilters]);

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
        // APIエンドポイントを修正 - limit指定なしで全てのハッシュタグを取得
        const response = await fetch(`${API_BASE_URL}/api/hashtags`);
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
      // 最初の読み込みでもAPIベースのフィルターオプション取得を使用
      loadFilterOptions();
    }, [loadFilterOptions]);

    // フィルター変更時に、フィルターされたデータに基づいて選択肢を更新
    useEffect(() => {
      // 常にフィルターオプションを取得する（初期状態でも、フィルター適用時でも）
      loadFilterOptions();
    }, [currentFilters, loadFilterOptions]);

    // handleFilterを拡張してソート処理を明示的に扱う
    const handleFilter = (field: string) => (filterValue: FilterValue, shouldMerge = false) => {
      console.log(`フィルター処理: ${field}`, filterValue);
      
      if (filterValue.type === 'sort') {
        // ソート処理
        setSortField(field);
        setSortDirection(filterValue.value as 'asc' | 'desc');
        
        // 親コンポーネントに通知
        onFilterChange(true, filterValue);
        return;
      }
      
      if (filterValue.type === 'clear') {
        // ソートもクリアする
        if (sortField === field) {
          setSortField(null);
          setSortDirection(null);
        }
        // ... 既存のクリア処理 ...
      }
      
      // ... 既存のフィルター処理 ...
    };

    const handlePageChange = (page: number) => {
      onPageChange(page)
    }

    // フィルタリングされたデータから、各カラムで選択可能な値を抽出する関数
    const getFilteredOptions = useCallback((columnName: string) => {
      // 現在アクティブなフィルターの数を確認
      const activeFilterCount = Object.keys(currentFilters).length;
      
      // すべてのフィルターがクリアされた場合のみ初期キャッシュを使用
      const useInitialCache = activeFilterCount === 0;
      
      // フィルタークリア直後のローディング中であるかを判断
      const isTransitioning = isLoadingFilterOptions && activeFilterCount > 0;
      
      // フィルタークリア直後のローディング中かつ一部フィルターのみクリアの場合はloadingを表示
      if (isTransitioning) {
        console.log(`${columnName} - ローディング中のため空の配列を返します`);
        return [];
      }
      
      switch (columnName) {
        case 'ジャンル':
          // すべてのフィルターがクリアされた場合のみ初期キャッシュを使用
          return useInitialCache && categoryList.length > 0 
            ? categoryList 
            : categoryList;
          
        case 'アカウント名':
          return useInitialCache && accountList.length > 0
            ? accountList
            : accountList;
          
        case 'ハッシュタグ':
          return useInitialCache && hashtagList.length > 0
            ? hashtagList
            : hashtagList;
          
        case 'BGM':
          return useInitialCache && audioTitleList.length > 0
            ? audioTitleList
            : audioTitleList;
          
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
          if (!row.thumbnail) {
            return <NoThumbnail />
          }

          const imageUrl = typeof row.thumbnail === 'string' 
            ? row.thumbnail  
            : row.thumbnail.url;  

          if (!imageUrl) {
            return <NoThumbnail />
          }

          return (
            <div className="relative">
              <ImageHover 
                src={imageUrl} 
                alt="サムネイル" 
                videoUrl={row.url}
                videoData={row}
              />
              <div className="absolute -bottom-1 -right-1">
                <div className="bg-white p-0.2 rounded-lg shadow-sm">
                  {row.content_type === 'video' ? (
                    <VideoTypeIcon size={32} />
                  ) : (
                    <PhotoTypeIcon size={32} />
                  )}
                </div>
              </div>
            </div>
          )
        }
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => {
          return (
            <TableHeaderCell
              title="投稿日時"
              type="date"
              onFilter={(value) => handleFilter('createdAt')(value)}
              isActive={Boolean(columnFilters['createdAt'])}
              sortDirection={sortField === 'createdAt' ? sortDirection : null}
              isLoadingFilterOptions={isLoadingFilterOptions}
              align="right"
            />
          );
        },
        cell: ({ row }) => {
          const date = row.createdAt;
          if (!date) return '';
          
          try {
            // ISO形式や標準的な日付文字列の場合
            const dateObj = new Date(date);
            if (!isNaN(dateObj.getTime())) {
              // YY/MM/DD形式に変換
              const year = dateObj.getFullYear().toString().slice(2); // 下2桁のみ
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const day = dateObj.getDate().toString().padStart(2, '0');
              return (
                <div className="text-right font-medium text-gray-700">
                  {`${year}/${month}/${day}`}
                </div>
              );
            }
            
            // すでに文字列として存在する日付形式の変換
            if (typeof date === 'string') {
              // YYYY-MM-DDパターンにマッチ
              const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (match) {
                const year = match[1].slice(2); // 下2桁
                const month = match[2];
                const day = match[3];
                return (
                  <div className="text-right font-medium text-gray-700">
                    {`${year}/${month}/${day}`}
                  </div>
                );
              }
            }
            
            return <div className="text-right text-gray-700">{date}</div>;
          } catch (e) {
            console.error('日付変換エラー:', e);
            return <div className="text-right text-gray-700">{date}</div>;
          }
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
            isActive={Boolean(columnFilters['views'])}
            sortDirection={sortField === 'views' ? sortDirection : null}
          />
        ),
        cell: ({ row }) => formatNumber(row.views, 'views')
      },
      {
        accessorKey: 'viewsIncrease',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生増加数"
            type="number"
            align="center"
            onFilter={(value) => handleFilter('viewsIncrease')(value)}
            isActive={Boolean(columnFilters['viewsIncrease'])}
            sortDirection={sortField === 'viewsIncrease' ? sortDirection : null}
          />
        ),
        cell: ({ row }) => formatNumber(row.viewsIncrease, 'viewsIncrease')
      },
      {
        accessorKey: 'category',
        header: ({ column }) => {
          const options = getFilteredOptions('ジャンル');
          console.log('ジャンルカラムのレンダリング:', {
            categoryDataLength: options.length,
            sample: options.slice(0, 3),
            hasActiveFilter: Boolean(columnFilters['category']),
            isLoading: isLoadingFilterOptions
          });
          return (
            <TableHeaderCell
              title="ジャンル"
              type="text"
              onFilter={(value) => handleFilter('category')(value)}
              isActive={Boolean(columnFilters['category'])}
              categoryData={options}
              sortDirection={sortField === 'category' ? sortDirection : null}
              isLoadingFilterOptions={isLoadingFilterOptions}
            />
          );
        },
      },
      {
        accessorKey: 'accountName',
        header: ({ column }) => (
          <TableHeaderCell
            title="アカウント名"
            type="text"
            onFilter={(value) => handleFilter('accountName')(value)}
            isActive={Boolean(columnFilters['accountName'])}
            categoryData={getFilteredOptions('アカウント名')}
            sortDirection={sortField === 'accountName' ? sortDirection : null}
          />
        ),
        cell: ({ row }) => (
          <div className="w-[120px] min-w-[120px]">
            <div className="flex flex-col">
              <span className="font-bold truncate text-base">
                {row.accountName}
              </span>
              {row.display_name && (
                <span className="text-xs text-gray-500 truncate">
                  {row.display_name}
                </span>
              )}
            </div>
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
            isActive={Boolean(columnFilters['likes'])}
            sortDirection={sortField === 'likes' ? sortDirection : null}
          />
        ),
        cell: ({ row }) => formatNumber(row.likes, 'likes')
      },
      {
        accessorKey: 'comments',
        header: ({ column }) => (
          <TableHeaderCell
            title="コメント数"
            type="number"
            align="center"
            onFilter={(value) => handleFilter('comments')(value)}
            isActive={Boolean(columnFilters['comments'])}
            sortDirection={sortField === 'comments' ? sortDirection : null}
          />
        ),
        cell: ({ row }) => formatNumber(row.comments, 'comments')
      },
      {
        accessorKey: 'hashtags',
        header: ({ column }) => (
          <TableHeaderCell
            title="ハッシュタグ"
            type="text"
            onFilter={(value) => handleFilter('hashtags')(value)}
            isActive={Boolean(columnFilters['hashtags'])}
            categoryData={getFilteredOptions('ハッシュタグ')}
            sortDirection={sortField === 'hashtags' ? sortDirection : null}
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
            isActive={Boolean(columnFilters['audioTitle'])}
            categoryData={getFilteredOptions('BGM')}
            sortDirection={sortField === 'audioTitle' ? sortDirection : null}
          />
        ),
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <TableHeaderCell
            title="キャプション"
            onFilter={(value) => handleFilter('description')(value)}
            isActive={Boolean(columnFilters['description'])}
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
        <div className="flex items-center space-x-2 p-2">
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
          <label className="flex items-center cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={isPrOnly}
              onChange={(e) => onPrOnlyChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-red-500 peer-focus:ring-2 peer-focus:ring-red-300 transition-colors">
              <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-all duration-300 peer-checked:translate-x-5"></div>
            </div>
            <span className="ml-2 text-sm font-medium text-red-600">#PRを含む動画のみ表示</span>
          </label>
        </div>
        
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
                        className="px-3 py-2 font-medium text-gray-700 bg-gray-50 sticky top-0"
                        style={{ 
                          minWidth: column.accessorKey === 'thumbnail' ? '100px' : 
                                   column.accessorKey === 'createdAt' ? '80px' :
                                   column.accessorKey === 'accountName' ? '100px' :
                                   column.accessorKey === 'hashtags' ? '50px' :
                                   column.accessorKey === 'description' ? '120px' : '70px',
                          color: Boolean(columnFilters[column.accessorKey]) ? 'var(--color-sky-500)' : undefined
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
                          className={`px-3 py-3 bg-white ${
                            ['views', 'viewsIncrease', 'likes', 'comments'].includes(column.accessorKey) 
                              ? 'text-center font-medium' 
                              : ''
                          }`}
                          style={{ 
                            minWidth: column.accessorKey === 'thumbnail' ? '100px' : 
                                     column.accessorKey === 'createdAt' ? '80px' :
                                     column.accessorKey === 'accountName' ? '100px' :
                                     column.accessorKey === 'hashtags' ? '50px' :
                                     column.accessorKey === 'description' ? '120px' : '70px',
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
        
        <div className="flex items-center p-2">
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    )
  }
)

DataTable.displayName = 'DataTable' 