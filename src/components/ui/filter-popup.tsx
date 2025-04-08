'use client'

import React, { useState, useRef, useEffect, RefObject } from 'react'
import type { FilterValue, FilterType, ComparisonOperator } from '@/types/dashboard'
import { TIKTOK_COLORS, GENRE_COLORS, DEFAULT_GENRE_COLOR } from '@/lib/constants'

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
  const [activeTab, setActiveTab] = useState<'date' | 'metrics' | 'categories' | 'accounts'>('date')
  // ジャンル用の複数選択状態
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // フィルターフィールドの定義
  const filterFields: Record<string, FilterField[]> = {
    date: [
      { id: 'createdAt', label: '投稿日時', type: 'date' }
    ],
    metrics: [
      { id: 'views', label: '再生数', type: 'number', supportSort: true },
      { id: 'viewsIncrease', label: '再生増加数', type: 'number', supportSort: true },
      { id: 'likes', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">いいね数</span></span>, type: 'number', supportSort: true },
      { id: 'comments', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">コメント数</span></span>, type: 'number', supportSort: true }
    ],
    categories: [
      { id: 'category', label: '動画ジャンル', type: 'multiselect', options: categories }
    ],
    accounts: [
      { id: 'keywords', label: 'キーワード検索', type: 'text' }
    ]
  }

  // コンポーネントマウント時にカテゴリの選択状態を初期化
  useEffect(() => {
    if (isOpen) {
      // カテゴリフィルターがある場合その値を取得
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

  // コンポーネントマウント時に現在のフィルターを取得
  useEffect(() => {
    if (isOpen) {
      setTempFilters(currentFilters || {})
    }
  }, [isOpen, currentFilters])

  // フィルター変更ハンドラー
  const handleFilterChange = (fieldId: string, value: FilterValue) => {
    console.log('FilterPopup - フィルター変更:', {
      fieldId,
      value,
      isDateFilter: fieldId === 'createdAt',
      comparison: value.comparison,
      type: value.type
    });
    
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
    } else {
      // 日付以外のフィルターはそのまま設定
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: value
      }));
    }

    if (fieldId === 'views' || fieldId === 'likes' || fieldId === 'comments' || fieldId === 'viewsIncrease') {
      // 数値フィールドの場合は整数値に変換して2桁ずらしてから戻す（精度問題を回避）
      const numValue = parseInt(value.value, 10);
      console.log(`数値変換前: ${value.value}, 変換後: ${numValue}`);
      
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: {
          ...value,
          value: numValue // 整数値に変換
        }
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
    setTempFilters({})
    setSelectedCategories([]);
    onClearAll()
  }

  // フィルターを適用
  const handleApplyFilters = () => {
    // 一時フィルターのコピーを作成
    const updatedFilters = { ...tempFilters };
    
    console.log('FilterPopup - フィルター適用前:', {
      tempFilters,
      createdAtFilter: tempFilters['createdAt'],
      hasCreatedAt: 'createdAt' in tempFilters
    });
    
    // 日付フィルターの最終確認と修正
    if (updatedFilters['createdAt']) {
      const dateFilter = updatedFilters['createdAt'];
      
      // 比較演算子が設定されていない場合はデフォルト値を設定
      if (!dateFilter.comparison) {
        // デフォルトで'date'を使用（「等しい」の状態）
        updatedFilters['createdAt'] = {
          ...dateFilter,
          type: 'date',  // typeは'date'で固定
          comparison: 'date' as ComparisonOperator  // comparisonをComparisonOperator型で設定
        };
        
        console.log('FilterPopup - 日付フィルターのデフォルト比較演算子を設定:', {
          defaultComparison: 'date',
          comparison: updatedFilters['createdAt'].comparison
        });
      } else {
        // 比較演算子はすでに設定されているが、typeが上書きされないようにする
        updatedFilters['createdAt'] = {
          ...dateFilter,
          type: 'date'  // typeは'date'で固定
        };
      }
      
      // 値が空の場合はフィルターを削除
      if (!dateFilter.value) {
        delete updatedFilters['createdAt'];
        console.log('FilterPopup - 日付フィルターの値が空のため削除');
      }
    }
    
    // カテゴリーの複数選択をフィルターに適用
    if (selectedCategories.length > 0) {
      updatedFilters['category'] = {
        field: 'category',
        type: 'text',
        comparison: 'contains',
        value: selectedCategories.length === 1 ? selectedCategories[0] : selectedCategories.join(',')
      };
    } else if ('category' in updatedFilters) {
      // カテゴリーが選択されていない場合、既存のカテゴリーフィルターを削除
      delete updatedFilters['category'];
    }
    
    // キーワード検索の処理（アカウント名、BGM、キャプションの3つに適用）
    if (updatedFilters['keywords'] && updatedFilters['keywords'].value) {
      const keywordValue = updatedFilters['keywords'].value;
      
      // キーワード検索をアカウント名、BGM、キャプションに適用
      updatedFilters['accountName'] = {
        field: 'accountName',
        type: 'text',
        comparison: 'contains',
        value: keywordValue
      };
      
      updatedFilters['audioTitle'] = {
        field: 'audioTitle',
        type: 'text',
        comparison: 'contains',
        value: keywordValue
      };
      
      updatedFilters['description'] = {
        field: 'description',
        type: 'text',
        comparison: 'contains',
        value: keywordValue
      };
      
      // キーワードフィルター自体は削除（代わりに個別フィールドフィルターを使用）
      delete updatedFilters['keywords'];
    }
    
    console.log('FilterPopup - フィルター適用後:', {
      updatedFilters,
      createdAtFilter: updatedFilters['createdAt'],
      hasCreatedAt: 'createdAt' in updatedFilters,
      currentState: {
        selectedTab: activeTab,
        dateInput: tempFilters['createdAt']?.value || '未設定',
        dateComparison: tempFilters['createdAt']?.comparison || '未設定'
      }
    });
    
    // フィルターを適用
    onFilterChange(updatedFilters);
    onClose(); // フィルター適用後にポップアップを閉じる
  }

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
    handleFilterChange(fieldId, {
      field: fieldId,
      type: 'sort',
      value: direction
    });
  }

  // 日付用のフィルター条件セクション
  const renderDateFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
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
                checked={isActive && filterValue.comparison === 'date'}
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

  // 数値用のフィルター条件セクション（ソート機能付き）
  const renderNumberFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)
    const sortFilterValue = filterValue?.type === 'sort' ? filterValue : null;

    return (
      <div key={field.id} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">{field.label}</label>
            
            {/* ソート機能が必要な場合 */}
            {field.supportSort && (
              <div className="flex space-x-1">
                <button
                  onClick={() => handleSortChange(field.id, 'asc')}
                  className={`p-1 rounded ${sortFilterValue && sortFilterValue.value === 'asc' 
                    ? 'bg-[#FE2C55]/10 text-[#FE2C55] ring-1 ring-[#FE2C55]' 
                    : 'text-gray-400 hover:text-[#FE2C55] hover:bg-[#FE2C55]/5'}`}
                  title="昇順で並べ替え"
                >
                  <SortAscIcon size={16} />
                </button>
                <button
                  onClick={() => handleSortChange(field.id, 'desc')}
                  className={`p-1 rounded ${sortFilterValue && sortFilterValue.value === 'desc' 
                    ? 'bg-[#FE2C55]/10 text-[#FE2C55] ring-1 ring-[#FE2C55]' 
                    : 'text-gray-400 hover:text-[#FE2C55] hover:bg-[#FE2C55]/5'}`}
                  title="降順で並べ替え"
                >
                  <SortDescIcon size={16} />
                </button>
              </div>
            )}
          </div>
          
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
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'greater', 
                  value: filterValue?.value || '' 
                })}
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
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'equal', 
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
                value="less"
                checked={isActive && filterValue.type === 'number' && filterValue.comparison === 'less'}
                onChange={(e) => handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: 'less', 
                  value: filterValue?.value || '' 
                })}
              />
              <span className="ml-2 text-sm text-gray-700">より小さい</span>
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="number"
              className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full sm:text-sm border-gray-300 border rounded-md shadow-sm"
              value={filterValue?.type === 'number' ? filterValue.value || '' : ''}
              placeholder="値を入力"
              onChange={(e) => {
                // comparisionが設定されていない場合はデフォルトで'greater'を使用
                const comparison = filterValue?.type === 'number' ? filterValue.comparison || 'greater' : 'greater';
                handleFilterChange(field.id, { 
                  field: field.id,
                  type: 'number', 
                  comparison: comparison, 
                  value: Number(e.target.value)  // 文字列から数値への明示的な変換
                });
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // テキスト入力用のフィルター条件セクション
  const renderTextFilter = (field: FilterField) => {
    const filterValue = tempFilters[field.id]
    const isActive = Boolean(filterValue)

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <label className="text-sm font-medium text-gray-700">{field.label}</label>
            
            {/* キーワード検索の場合、ヘルプアイコンを表示 */}
            {field.id === 'keywords' && (
              <div className="relative ml-1 group">
                <button className="text-gray-400 hover:text-gray-600">
                  <HelpIcon size={14} />
                </button>
                <div className="absolute left-0 mt-1 w-60 px-2 py-1 bg-gray-800 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  アカウント名、BGM、キャプションから検索
                </div>
              </div>
            )}
          </div>
          
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
          placeholder={`${field.label}を入力`}
          onChange={(e) => handleFilterChange(field.id, { 
            field: field.id,
            type: 'text', 
            comparison: 'contains', 
            value: e.target.value 
          })}
        />
      </div>
    )
  }

  // カテゴリー用の複数選択フィルターセクション
  const renderMultiSelectFilter = (field: FilterField) => {
    // カテゴリーの並び替え（「その他」を最後に配置）
    const sortedOptions = field.options ? [...field.options].sort((a, b) => {
      if (a === 'その他') return 1;
      if (b === 'その他') return -1;
      return a.localeCompare(b);
    }) : [];
    
    const isActive = selectedCategories.length > 0

    return (
      <div key={field.id} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          {isActive && (
            <button 
              onClick={() => {
                handleClearFilter(field.id);
                setSelectedCategories([]);
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
                  id={`category-${index}`}
                  type="checkbox"
                  className="h-4 w-4 text-[#FE2C55] focus:ring-[#FE2C55] border-gray-300 rounded"
                  checked={selectedCategories.includes(option)}
                  onChange={(e) => handleCategoryChange(option, e.target.checked)}
                />
                <label htmlFor={`category-${index}`} className="ml-2">
                  <div 
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold"
                    style={{ 
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    {option}
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

  // アクティブなタブに応じたフィルター項目を表示
  const renderActiveTabContent = () => {
    const fields = filterFields[activeTab] || []
    return (
      <div className="p-4">
        {fields.map((field) => {
          if (field.type === 'date') {
            return renderDateFilter(field)
          } else if (field.type === 'number') {
            return renderNumberFilter(field)
          } else if (field.type === 'text') {
            return renderTextFilter(field)
          } else if (field.type === 'multiselect') {
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
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          className={`px-3 py-2 text-xs font-medium ${
            activeTab === 'date' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('date')}
        >
          投稿日
        </button>
        <button
          className={`px-3 py-2 text-xs font-medium ${
            activeTab === 'metrics' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('metrics')}
        >
          再生数、いいね数等
        </button>
        <button
          className={`px-3 py-2 text-xs font-medium ${
            activeTab === 'categories' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('categories')}
        >
          ジャンル
        </button>
        <button
          className={`px-3 py-2 text-xs font-medium ${
            activeTab === 'accounts' ? 'text-[#FE2C55] border-b-2 border-[#FE2C55]' : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('accounts')}
        >
          キーワード
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FE2C55]" />
        </div>
      ) : (
        renderActiveTabContent()
      )}

      <div className="px-4 py-3 bg-gray-50 flex justify-between border-t border-gray-200">
        <button
          onClick={handleClearAllFilters}
          className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55]"
        >
          すべてクリア
        </button>
        <button
          onClick={handleApplyFilters}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#FE2C55] hover:bg-[#FE2C55]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55]"
        >
          適用
        </button>
      </div>
    </div>
  )
} 