'use client'

import React, { useState, useRef, useEffect, RefObject } from 'react'
import type { FilterValue, FilterType, ComparisonOperator } from '@/types/dashboard'
import { TIKTOK_COLORS, GENRE_COLORS, DEFAULT_GENRE_COLOR } from '@/lib/constants'
import { cn } from '@/lib/utils'

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
// type FilterType = 'date' | 'number' | 'text' | 'category' | 'sort' | 'multiselect'

// フィルター項目の定義
interface FilterField {
  id: string
  label: React.ReactNode
  type: FilterType
  options?: string[]
  supportSort?: boolean
}

// ハートアイコン（アウトライン）
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

// コメントアイコン（アウトライン）
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

// ソートアイコン（昇順）
const SortAscIcon = ({ size = 16 }: { size?: number }) => (
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
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <polyline points="19 12 12 5 5 12"></polyline>
  </svg>
);

// ソートアイコン（降順）
const SortDescIcon = ({ size = 16 }: { size?: number }) => (
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
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <polyline points="5 12 12 19 19 12"></polyline>
  </svg>
);

// ヘルプアイコン
const HelpIcon = ({ size = 16 }: { size?: number }) => (
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
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
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
  const [activeTab, setActiveTab] = useState<'date' | 'metrics' | 'categories' | 'text' | 'sort'>('date')
  // ジャンル用の複数選択状態
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  // コンテンツタイプ用の複数選択状態
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(['video', 'carousel'])
  // ソート用の状態を追加
  const [primarySort, setPrimarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null)
  const [secondarySort, setSecondarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null)

  // フィルターフィールドの定義
  const filterFields: Record<string, FilterField[]> = {
    date: [
      { id: 'createdAt', label: '投稿日時', type: 'date' }
    ],
    metrics: [
      { id: 'views', label: '再生数', type: 'number' },
      { id: 'viewsIncrease', label: '再生増加数', type: 'number' },
      { id: 'likes', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">いいね数</span></span>, type: 'number' },
      { id: 'comments', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">コメント数</span></span>, type: 'number' },
      { id: 'ten_days_increase', label: '10日間再生増加数', type: 'number' },
      { id: 'likes_count_increase', label: 'いいね増加数', type: 'number' },
      { id: 'ten_days_likes_increase', label: '10日間いいね増加数', type: 'number' },
      { id: 'comment_count_increase', label: 'コメント増加数', type: 'number' },
      { id: 'ten_days_comment_increase', label: '10日間コメント増加数', type: 'number' }
    ],
    categories: [
      { id: 'content_type', label: 'コンテンツタイプ', type: 'multiselect', options: ['video', 'carousel'] },
      { id: 'category', label: '動画ジャンル', type: 'multiselect', options: categories }
    ],
    text: [
      { id: 'accountName', label: 'アカウント検索', type: 'text' },
      { id: 'hashtags', label: 'ハッシュタグ検索', type: 'text' },
      { id: 'audioTitle', label: 'BGM検索', type: 'text' }
    ],
    // ソート用のフィールド - 4つに限定
    sort: [
      { id: 'views', label: '再生数', type: 'sort' },
      { id: 'viewsIncrease', label: '再生増加数', type: 'sort' },
      { id: 'likes', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">いいね数</span></span>, type: 'sort' },
      { id: 'comments', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">コメント数</span></span>, type: 'sort' },
      { id: 'ten_days_increase', label: '10日間再生増加数', type: 'sort' },
      { id: 'likes_count_increase', label: 'いいね増加数', type: 'sort' },
      { id: 'ten_days_likes_increase', label: '10日間いいね増加数', type: 'sort' },
      { id: 'comment_count_increase', label: 'コメント増加数', type: 'sort' },
      { id: 'ten_days_comment_increase', label: '10日間コメント増加数', type: 'sort' }
    ]
  }

  // ポップアップが開かれたときにcurrentFiltersから状態を初期化する
  useEffect(() => {
    if (isOpen) {
      // すべてのフィルターをコピー
      setTempFilters({...currentFilters});
      
      // カテゴリ選択の初期化
      const categoryFilter = currentFilters['category'];
      if (categoryFilter && categoryFilter.value) {
        // 文字列の場合は配列に変換
        if (typeof categoryFilter.value === 'string') {
          setSelectedCategories([categoryFilter.value]);
        } else if (Array.isArray(categoryFilter.value)) {
          setSelectedCategories(categoryFilter.value as string[]);
        }
      } else {
        setSelectedCategories([]);
      }

      // コンテンツタイプの選択初期化
      const contentTypeFilter = currentFilters['content_type'];
      if (contentTypeFilter && contentTypeFilter.value) {
        if (typeof contentTypeFilter.value === 'string') {
          setSelectedContentTypes([contentTypeFilter.value]);
        } else if (Array.isArray(contentTypeFilter.value)) {
          setSelectedContentTypes(contentTypeFilter.value as string[]);
        }
      } else {
        // デフォルトで両方選択された状態に
        setSelectedContentTypes(['video', 'carousel']);
      }
      
      // ソート状態の初期化
      let foundPrimarySort = false;
      
      // currentFiltersからソート情報を抽出
      Object.entries(currentFilters).forEach(([key, filter]) => {
        // ソートフィルターを検出
        if (filter.type === 'sort') {
          const field = filter.sortField || filter.field;
          const direction = filter.value as 'asc' | 'desc';
          
          // プライマリソートとして設定
          if (filter.isPrimarySort || !foundPrimarySort) {
            setPrimarySort({field, direction});
            foundPrimarySort = true;
          } else {
            // セカンダリソート
            setSecondarySort({field, direction});
          }
        }
      });
      
      // ソートが見つからなかった場合はnullに設定
      if (!foundPrimarySort) {
        setPrimarySort(null);
        setSecondarySort(null);
      }
    }
  }, [isOpen, currentFilters]);

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

  // フィルター変更ハンドラー
  const handleFilterChange = (fieldId: string, value: FilterValue) => {
    console.log('FilterPopup - フィルター変更:', {
      fieldId,
      value,
      isDateFilter: fieldId === 'createdAt',
      comparison: value.comparison,
      type: value.type
    });
    
    // 値が空の場合はフィルターをクリア
    if (
      (typeof value.value === 'string' && value.value.trim() === '') || 
      value.value === null || 
      value.value === undefined ||
      (typeof value.value === 'number' && isNaN(value.value))
    ) {
      // 数値が0の場合は有効な値として扱う（0より小さいなどのフィルターのため）
      if (!(typeof value.value === 'number' && value.value === 0)) {
        handleClearFilter(fieldId);
        return;
      }
    }
    
    // 日付フィルターの場合、type='date'になるよう確保
    if (fieldId === 'createdAt' && value.type === 'date') {
      // 比較演算子を変換せず、そのまま使用
      const apiCompatibleValue = {
        ...value,
        comparison: value.comparison || 'date' as ComparisonOperator
      };
      
      console.log('FilterPopup - 日付フィルター:', {
        comparison: apiCompatibleValue.comparison
      });
      
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: apiCompatibleValue
      }));
    } else if (value.type === 'sort') {
      // ソート操作の場合
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: value
      }));
    } else if (value.type === 'number') {
      // 数値フィールドの場合は値をそのまま使用（すでにnumber型）
      console.log(`数値フィルター適用: ${value.value}`);
      
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: {
          ...value,
          value: value.value // すでにnumber型なのでそのまま使用
        }
      }));
    } else if (value.type === 'multiselect' && fieldId === 'content_type') {
      // content_typeのmultiselect処理を特別に扱う
      console.log('FilterPopup - content_typeマルチセレクト処理:', value);
      
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: {
          ...value,
          comparison: 'contains', // 明示的にcomparison値を設定
          field: fieldId
        }
      }));
    } else {
      // テキストや他のタイプの場合はそのまま設定
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: value
      }));
    }
  }

  // フィルタークリアハンドラー
  const handleClearFilter = (fieldId: string) => {
    const newFilters = { ...tempFilters }
    delete newFilters[fieldId]
    setTempFilters(newFilters)
    // カテゴリーの場合は選択状態もクリア
    if (fieldId === 'category') {
      setSelectedCategories([]);
    }
  }

  // すべてのフィルターをクリア
  const handleClearAllFilters = () => {
    // ポップアップ内の入力のみをクリア
    setTempFilters({})
    setSelectedCategories([]);
    setSelectedContentTypes(['video', 'carousel']);
    setPrimarySort(null);
    setSecondarySort(null);
    
    // この時点では親コンポーネントのフィルター状態は変更しない
    // onClearAll(); -- 削除：これによりAPIリクエストが発生していた
    
    // フィルターポップアップは閉じない
    // onClose(); -- 削除：ユーザーがクリアした後に引き続き操作できるようにする
  }

  // フィルターを適用
  const handleApplyFilters = () => {
    console.log('フィルターポップアップ - フィルター適用開始');
    
    // 最終的なフィルター状態を構築
    const finalFilters: Record<string, FilterValue> = {};
    
    // 1. 通常のフィルターを処理
    Object.entries(tempFilters).forEach(([key, filter]) => {
      if (filter.type !== 'sort') {
        finalFilters[key] = filter;
      }
    });
    
    // 2. カテゴリフィルターの処理
    if (selectedCategories.length > 0) {
      finalFilters['category'] = {
        field: 'category',
        type: 'multiselect',
        value: selectedCategories,
        comparison: 'contains'
      };
    }
    
    // 3. コンテンツタイプフィルターの処理
    if (selectedContentTypes.length > 0 && selectedContentTypes.length < 3) {
      finalFilters['content_type'] = {
        field: 'content_type',
        type: 'multiselect',
        value: selectedContentTypes,
        comparison: 'contains'
      };
    }
    
    // 4. ソート情報の処理
    if (primarySort) {
      finalFilters[`sort_${primarySort.field}`] = {
        field: primarySort.field,
        type: 'sort',
        value: primarySort.direction,
        isPrimarySort: true,
        sortField: primarySort.field
      };
      
      // 第二ソートが設定されている場合
      if (secondarySort) {
        finalFilters[`sort_${secondarySort.field}`] = {
          field: secondarySort.field,
          type: 'sort',
          value: secondarySort.direction,
          isPrimarySort: false,
          sortField: secondarySort.field
        };
      }
    }
    
    console.log('フィルターポップアップ - 最終フィルター:', finalFilters);
    
    // フィルターを親コンポーネントに渡す
    onFilterChange(finalFilters);
    onClose();
  };

  // カテゴリの選択状態管理
  const handleCategoryChange = (category: string, checked: boolean) => {
    if (checked) {
      setSelectedCategories(prev => [...prev, category]);
    } else {
      setSelectedCategories(prev => prev.filter(c => c !== category));
    }
  }

  // ソート選択のハンドラー
  const handleSortChange = (fieldId: string, direction: 'asc' | 'desc') => {
    console.log('フィルターポップアップ - ソート変更:', { fieldId, direction });
    
    // 新しいソート情報を作成
    const sortFilter: FilterValue = {
      field: fieldId,
      type: 'sort',
      value: direction,
      sortField: fieldId
    };
    
    // 一時フィルターを更新
    setTempFilters(prev => ({
      ...prev,
      [`sort_${fieldId}`]: sortFilter
    }));
  };

  // ソート項目の設定関数
  const handlePrimarySortChange = (fieldId: string, direction: 'asc' | 'desc') => {
    // 同じフィールドが第二ソートに設定されている場合、第二ソートをクリア
    if (secondarySort && secondarySort.field === fieldId) {
      setSecondarySort(null);
    }
    setPrimarySort({ field: fieldId, direction });
  }

  const handleSecondarySortChange = (fieldId: string, direction: 'asc' | 'desc') => {
    // 同じフィールドが第一ソートに設定されている場合は処理しない
    if (primarySort && primarySort.field === fieldId) {
      return;
    }
    setSecondarySort({ field: fieldId, direction });
  }

  // 日付用のフィルター条件セクション
  const renderDateFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            {field.label || ''}
          </label>
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
              title="フィルターをクリア"
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
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="before"
                checked={isActive && filterValue.comparison === 'before'}
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date' as FilterType, 
                  comparison: 'before' as ComparisonOperator, 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">以前</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="date"
                checked={isActive && filterValue.comparison === 'date' as ComparisonOperator}
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date' as FilterType, 
                  comparison: 'date' as ComparisonOperator, 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">等しい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="after"
                checked={isActive && filterValue.comparison === 'after'}
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'date' as FilterType, 
                  comparison: 'after' as ComparisonOperator, 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">以降</span>
            </label>
          </div>
          
          <div className="flex items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon size={18} />
              </div>
              <input
                type="date"
                className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full pl-10 sm:text-sm border-gray-300 border rounded-md shadow-sm"
                value={filterValue?.value || ''}
                onChange={(e) => {
                  console.log('投稿日フィルター - 日付変更:', {
                    入力値: e.target.value,
                    前回の値: filterValue?.value || '',
                    比較演算子: filterValue?.comparison || 'equal'
                  });
                  
                  // 空の値の場合はフィルターをクリア
                  if (!e.target.value) {
                    handleClearFilter(field.id);
                    return;
                  }
                  
                  // 比較演算子が設定されていない場合はラジオボタンの選択状態に基づいて設定
                  // デフォルトは「等しい」(equal)
                  const comparison = filterValue?.comparison || 'equal';
                  
                  const newFilterValue = { 
                    field: field.id,
                    type: 'date' as FilterType, 
                    comparison: comparison as ComparisonOperator, 
                    value: e.target.value 
                  };
                  
                  console.log('投稿日フィルター - 作成されるフィルター値:', newFilterValue);
                  
                  handleFilterChange(field.id, newFilterValue);
                }}
                required={isActive}
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
    
    // 数値型の値を取得（値が無い場合は空文字列）
    const numericValue = filterValue?.type === 'number' && filterValue.value !== undefined && filterValue.value !== null 
      ? filterValue.value 
      : '';

    // 数値フィルターの変更を処理
    const handleNumberFilterChange = (value: string, comparison: ComparisonOperator = 'equal') => {
      console.log('数値フィルター変更:', {
        field: field.id,
        value,
        comparison
      });

      // 空の値の場合はフィルターをクリア
      if (value.trim() === '') {
        handleClearFilter(field.id);
        return;
      }

      // 数値に変換
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        console.error('無効な数値:', value);
        return;
      }

      // フィルター値を更新
      handleFilterChange(field.id, {
        field: field.id,
        type: 'number',
        value: numValue,
        comparison
      });
    };

    return (
      <div key={field.id} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            {field.label || ''}
          </label>
          
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
              title="フィルターをクリア"
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
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="greater"
                checked={isActive && filterValue.type === 'number' && filterValue.comparison === 'greater'}
                onChange={() => {
                  if (numericValue !== '') {
                    handleNumberFilterChange(numericValue.toString(), 'greater');
                  }
                }}
              />
              <span className="ml-2 text-sm text-gray-700">より大きい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="equal"
                checked={isActive && filterValue.type === 'number' && filterValue.comparison === 'equal'}
                onChange={() => {
                  if (numericValue !== '') {
                    handleNumberFilterChange(numericValue.toString(), 'equal');
                  }
                }}
              />
              <span className="ml-2 text-sm text-gray-700">等しい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300"
                name={`${field.id}-comparison`}
                value="less"
                checked={isActive && filterValue.type === 'number' && filterValue.comparison === 'less'}
                onChange={() => {
                  if (numericValue !== '') {
                    handleNumberFilterChange(numericValue.toString(), 'less');
                  }
                }}
              />
              <span className="ml-2 text-sm text-gray-700">より小さい</span>
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="number"
              className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full sm:text-sm border-gray-300 border rounded-md shadow-sm"
              value={numericValue}
              onChange={(e) => {
                const newValue = e.target.value;
                // 現在選択されている比較演算子を取得（デフォルトは'equal'）
                const currentComparison = filterValue?.comparison || 'equal';
                handleNumberFilterChange(newValue, currentComparison as ComparisonOperator);
              }}
              placeholder="数値を入力"
              min="0"
            />
          </div>
        </div>
      </div>
    );
  };

  // テキスト入力用のフィルター条件セクション
  const renderTextFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)
    
    // field.labelの値をReactNodeから文字列に安全に変換する関数
    const getLabelText = (label: React.ReactNode): string => {
      if (typeof label === 'string') {
        return label;
      } else if (React.isValidElement(label)) {
        // Reactエレメントの場合はレンダリング結果の取得が難しいので、固定値を返す
        return field.id === 'accountName' ? 'アカウント' :
               field.id === 'hashtags' ? 'ハッシュタグ' :
               field.id === 'audioTitle' ? 'BGM' : '';
      }
      return '';
    };
    
    const placeholderText = `${getLabelText(field.label).replace('検索', '')}を入力`;

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            {field.label || ''}
          </label>
          
          {isActive && (
            <button 
              onClick={() => handleClearFilter(field.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <input
          type="text"
          className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full sm:text-sm border-gray-300 border rounded-md shadow-sm"
          value={filterValue?.value || ''}
          placeholder={placeholderText}
          onChange={(e) => {
            // 空の値の場合はフィルターをクリア
            if (e.target.value.trim() === '') {
              handleClearFilter(field.id);
              return;
            }
            
            handleFilterChange(field.id, { 
              field: field.id,
              type: 'text', 
              comparison: 'contains', 
              value: e.target.value 
            })
          }}
        />
      </div>
    )
  }

  // カテゴリー用の複数選択フィルターセクション
  const renderMultiSelectFilter = (field: FilterField) => {
    // フィールドに応じた選択状態と更新関数を選択
    const selectedItems = field.id === 'category' ? selectedCategories : 
                         field.id === 'content_type' ? selectedContentTypes : [];
    const setSelectedItems = field.id === 'category' ? setSelectedCategories : 
                            field.id === 'content_type' ? setSelectedContentTypes : () => {};
    
    // コンテンツタイプの場合は表示名を変換
    const getDisplayName = (option: string) => {
      if (field.id === 'content_type') {
        return option === 'video' ? '動画' : option === 'carousel' ? 'カルーセル' : option;
      }
      return option;
    };

    const handleCheckboxChange = (option: string, checked: boolean) => {
      if (field.id === 'category') {
        handleCategoryChange(option, checked);
      } else if (field.id === 'content_type') {
        // コンテンツタイプの選択状態を更新
        if (checked) {
          setSelectedContentTypes(prev => [...prev, option]);
        } else {
          setSelectedContentTypes(prev => prev.filter(item => item !== option));
        }
        
        // フィルター状態を更新
        handleFilterChange(field.id, {
          field: field.id,
          type: 'multiselect',
          comparison: 'contains', // comparison値を明示的に設定
          value: checked 
            ? [...selectedItems.filter(item => item !== option), option] 
            : selectedItems.filter(item => item !== option)
        });
      }
    };

    // カテゴリーの並び替え（「その他」を最後に配置）
    const sortedOptions = field.options ? [...field.options].sort((a, b) => {
      if (a === 'その他') return 1;
      if (b === 'その他') return -1;
      return a.localeCompare(b);
    }) : [];
    
    const isActive = selectedItems.length > 0

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            {field.label || ''}
          </label>
          {isActive && (
            <button 
              onClick={() => {
                handleClearFilter(field.id);
                setSelectedItems([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-md shadow-sm p-2">
          {sortedOptions.map((option, index) => {
            // カテゴリー名に対応する色を取得
            const colors = option in GENRE_COLORS 
              ? GENRE_COLORS[option as keyof typeof GENRE_COLORS] 
              : DEFAULT_GENRE_COLOR;
            
            return (
              <div key={index} className="flex items-center mb-2">
                <input
                  id={`${field.id}-${index}`}
                  type="checkbox"
                  className="h-4 w-4 text-[#FE2C55] focus:ring-[#FE2C55] border-gray-300 rounded"
                  checked={selectedItems.includes(option)}
                  onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                />
                <label htmlFor={`${field.id}-${index}`} className="ml-2">
                  <div 
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold"
                    style={{ 
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    {getDisplayName(option)}
                  </div>
                </label>
              </div>
            );
          })}
          {sortedOptions.length === 0 && (
            <div className="text-sm text-gray-500 py-2 text-center">選択肢がありません</div>
          )}
        </div>
      </div>
    )
  }

  // ソートタブのレンダリング関数
  const renderSortContent = () => {
    const sortableFields = filterFields['sort'] || [];
    
    // ソート対象のプルダウン用オプション
    const fieldOptions = sortableFields.map(field => {
      // ReactNodeからテキスト表示用のラベルを抽出
      let label = '';
      if (typeof field.label === 'string') {
        label = field.label;
      } else if (React.isValidElement(field.label)) {
        // React要素の場合は、fieldIdからラベルを判断
        label = field.id === 'views' ? '再生数' :
                field.id === 'viewsIncrease' ? '再生増加数' :
                field.id === 'likes' ? 'いいね数' :
                field.id === 'comments' ? 'コメント数' :
                field.id === 'ten_days_increase' ? '10日間再生増加数' :
                field.id === 'likes_count_increase' ? 'いいね増加数' :
                field.id === 'ten_days_likes_increase' ? '10日間いいね増加数' :
                field.id === 'comment_count_increase' ? 'コメント増加数' :
                field.id === 'ten_days_comment_increase' ? '10日間コメント増加数' : field.id;
      }
      
      return {
        id: field.id,
        label
      };
    });
    
    const directionOptions = [
      { value: 'desc', label: '降順（大きい順）', icon: <SortDescIcon size={14} /> },
      { value: 'asc', label: '昇順（小さい順）', icon: <SortAscIcon size={14} /> }
    ];
    
    return (
      <div className="p-4">
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">第一優先ソート</h3>
          <div className="space-y-3">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ソート対象
                </label>
                <select
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white border border-gray-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 sm:text-sm rounded-md appearance-none"
                  value={primarySort?.field || ''}
                  onChange={(e) => {
                    const selectedField = e.target.value;
                    if (selectedField) {
                      // 既存のdirectionを保持するか、デフォルトで降順を設定
                      const direction = primarySort?.direction || 'desc';
                      handlePrimarySortChange(selectedField, direction);
                    } else {
                      // 未選択の場合はソートをクリア
                      setPrimarySort(null);
                    }
                  }}
                >
                  <option value="">選択してください</option>
                  {fieldOptions.map(option => (
                    <option 
                      key={option.id} 
                      value={option.id}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
            </div>

            {primarySort && (
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ソート順
                  </label>
                  <select
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white border border-gray-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 sm:text-sm rounded-md appearance-none"
                    value={primarySort.direction}
                    onChange={(e) => {
                      if (primarySort) {
                        handlePrimarySortChange(primarySort.field, e.target.value as 'asc' | 'desc');
                      }
                    }}
                  >
                    {directionOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
            )}
          </div>
        </div>
        
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">第二優先ソート</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ソート対象
              </label>
              <select
                className={`mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white border ${!primarySort ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-300'} shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 sm:text-sm rounded-md appearance-none`}
                value={secondarySort?.field || ''}
                onChange={(e) => {
                  const selectedField = e.target.value;
                  // 第一ソートと同じフィールドは選択できないようにする
                  if (selectedField && (!primarySort || primarySort.field !== selectedField)) {
                    // 既存のdirectionを保持するか、デフォルトで降順を設定
                    const direction = secondarySort?.direction || 'desc';
                    handleSecondarySortChange(selectedField, direction);
                  } else if (!selectedField) {
                    // 未選択の場合はソートをクリア
                    setSecondarySort(null);
                  }
                }}
                disabled={!primarySort}
              >
                <option value="">選択してください</option>
                {fieldOptions
                  .filter(option => !primarySort || option.id !== primarySort.field)
                  .map(option => (
                    <option 
                      key={option.id} 
                      value={option.id}
                    >
                      {option.label}
                    </option>
                  ))
                }
              </select>
            </div>
            
            {secondarySort && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ソート順
                </label>
                <select
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white border border-gray-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 sm:text-sm rounded-md appearance-none"
                  value={secondarySort.direction}
                  onChange={(e) => {
                    if (secondarySort) {
                      handleSecondarySortChange(secondarySort.field, e.target.value as 'asc' | 'desc');
                    }
                  }}
                >
                  {directionOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // アクティブなタブに応じたフィルター項目を表示
  const renderActiveTabContent = () => {
    // ソートタブの場合は専用レンダリング関数を使用
    if (activeTab === 'sort') {
      return renderSortContent();
    }

    const fields = filterFields[activeTab] || []
    
    return (
      <div className="space-y-4 p-4">
        {fields.map((field) => {
          if (field.type === 'date') {
            return renderDateFilter(field)
          }
          if (field.type === 'number') {
            return renderNumberFilter(field)
          }
          if (field.type === 'text') {
            return renderTextFilter(field)
          }
          if (field.type === 'multiselect') {
            return renderMultiSelectFilter(field)
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
        width: '380px'
      }}
    >
      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-800">フィルター</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClearAllFilters}
            className="text-gray-400 hover:text-gray-600"
            title="すべてクリア"
          >
            <ClearIcon size={18} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        <div className="flex border-b sticky top-0 bg-white z-10">
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'date' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('date')}
          >
            <span className="flex items-center"><CalendarIcon size={12} /><span className="ml-1">日付</span></span>
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'metrics' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('metrics')}
          >
            数値
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'categories' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('categories')}
          >
            ジャンル
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'text' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('text')}
          >
            テキスト
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === 'sort' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('sort')}
          >
            並び替え
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FE2C55] mx-auto"></div>
          </div>
        ) : (
          renderActiveTabContent()
        )}
      </div>

      {/* フッター: 適用ボタン */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 sticky bottom-0">
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55]"
          >
            キャンセル
          </button>
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 text-sm font-medium text-white bg-[#FE2C55] border border-transparent rounded-md shadow-sm hover:bg-[#DE1B47] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55]"
          >
            適用
          </button>
        </div>
      </div>
    </div>
  )
} 