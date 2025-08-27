'use client'

import React, { useState, useRef, useEffect, RefObject, useLayoutEffect } from 'react'
import type { FilterValue, FilterType, ComparisonOperator } from '@/types/dashboard'
import { 
  TIKTOK_COLORS, 
  GENRE_COLORS, 
  AFFILIATE_TYPE_COLORS,      // 新規追加
  INFLUENCER_TYPE_COLORS,     // 名前変更
  CORPORATE_TYPE_COLORS, 
  DEFAULT_GENRE_COLOR,
  getAffiliateAccountTypes,   // 新規追加
  getInfluencerAccountTypes,
  getCorporateAccountTypes,
  getAllAccountTypes,
  getAccountTypeColor         // 追加
} from '@/lib/constants'
import { cn } from '@/lib/utils'

const apiUrl = process.env.NEXT_PUBLIC_API_URL 
interface FilterPopupProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
  onFilterChange: (filters: Record<string, FilterValue>) => void
  currentFilters: Record<string, FilterValue>
  categories: string[]
  accounts: string[]
  hashtags: string[]
  products: string[]
  // ★ 商品カテゴリとアカウントタイプを追加
  productCategories?: Record<string, string[]>
  accountTypes?: string[]
  isLoading: boolean
  onClearAll: () => void
  tabFilterFields?: {
    date: string[];
    metrics: string[];
    categories: string[];
    text: string[];
    sort: string[];
  };
  accountTypeContext?: 'influencer' | 'corporate' | 'affiliate' | 'all'
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

// 保存（アウトライン）
export const SaveIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#F59E0B"
      strokeWidth="2"
      strokeLinecap="round" 
      strokeLinejoin="round"
      className="drop-shadow-sm"
  >
     <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
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


export const FilterPopup = ({
  isOpen,
  onClose,
  anchorRef,
  onFilterChange,
  currentFilters,
  categories,
  accounts,
  hashtags,
  products: productsList,
  // ★ 新しいpropsを追加
  productCategories = {},
  accountTypes = [],
  isLoading,
  onClearAll,
  tabFilterFields,
  accountTypeContext,
}: FilterPopupProps) => {
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
  const popupRef = useRef<HTMLDivElement>(null)
  const [tempFilters, setTempFilters] = useState<Record<string, FilterValue>>(currentFilters || {})
  const [activeTab, setActiveTab] = useState<'date' | 'metrics' | 'categories' | 'text' | 'sort'>('date')
  // ジャンル用の複数選択状態
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  // コンテンツタイプ用の複数選択状態
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([]) // ★ デフォルトを空配列に変更
  // ソート用の状態を追加
  const [primarySort, setPrimarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null)
  const [secondarySort, setSecondarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null)
  // アカウントジャンル用の複数選択状態
  const [selectedAccountCategories, setSelectedAccountCategories] = useState<string[]>([])
  // 商品用の複数選択状態
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  // ★ フィルター状態を復元（初期化ではなく復元）
  // ポップアップが開かれたときにcurrentFiltersからフィルター状態を復元
  useEffect(() => {
    if (isOpen) {
      console.log('[FILTER-POPUP] フィルター状態復元開始:', {
        currentFilters,
        accountTypeContext,
        timestamp: new Date().toISOString()
      });

      // すべてのフィルターをコピー
      setTempFilters({...currentFilters});
      
      // カテゴリ選択の復元
      const categoryFilter = currentFilters['category'];
      let initialCategories: string[] = [];
      if (categoryFilter && categoryFilter.value) {
        if (typeof categoryFilter.value === 'string') {
          initialCategories = [categoryFilter.value];
        } else if (Array.isArray(categoryFilter.value)) {
          initialCategories = categoryFilter.value as string[];
        }
      }
      setSelectedCategories(initialCategories);
      console.log('[FILTER-POPUP] カテゴリ復元:', { categoryFilter, initialCategories });

      // コンテンツタイプの選択復元
      const contentTypeFilter = currentFilters['content_type'];
      let initialContentTypes: string[] = []; // ★ デフォルトを空配列に変更
      if (contentTypeFilter && contentTypeFilter.value) {
        if (typeof contentTypeFilter.value === 'string') {
          initialContentTypes = [contentTypeFilter.value];
        } else if (Array.isArray(contentTypeFilter.value)) {
          initialContentTypes = contentTypeFilter.value as string[];
        }
      }
      setSelectedContentTypes(initialContentTypes);
      console.log('[FILTER-POPUP] コンテンツタイプ復元:', { contentTypeFilter, initialContentTypes });
      
      // ソート状態の復元
      let foundPrimarySort = false;
      let newPrimarySort = null;
      let newSecondarySort = null;
      
      // currentFiltersからソート情報を抽出
      Object.entries(currentFilters).forEach(([key, filter]) => {
        // ソートフィルターを検出
        if (filter.type === 'sort') {
          const field = filter.sortField || filter.field;
          const direction = filter.value as 'asc' | 'desc';
          
          // プライマリソートとして設定
          if (filter.isPrimarySort || !foundPrimarySort) {
            newPrimarySort = {field, direction};
            foundPrimarySort = true;
          } else {
            // セカンダリソート
            newSecondarySort = {field, direction};
          }
        }
      });
      
      setPrimarySort(newPrimarySort);
      setSecondarySort(newSecondarySort);
      console.log('[FILTER-POPUP] ソート復元:', { newPrimarySort, newSecondarySort });

      // アカウントジャンルの選択復元
      const accountTypeFilter = currentFilters['account_type'];
      let initialAccountTypes: string[] = [];
      if (accountTypeFilter && accountTypeFilter.value) {
        if (typeof accountTypeFilter.value === 'string') {
          initialAccountTypes = [accountTypeFilter.value];
        } else if (Array.isArray(accountTypeFilter.value)) {
          initialAccountTypes = accountTypeFilter.value as string[];
        }
      }
      setSelectedAccountCategories(initialAccountTypes);
      console.log('[FILTER-POPUP] アカウントタイプ復元:', { accountTypeFilter, initialAccountTypes });
      
      // 商品の選択復元
      const productFilter = currentFilters['product'];
      let initialProducts: string[] = [];
      if (productFilter && productFilter.value) {
        if (typeof productFilter.value === 'string') {
          initialProducts = [productFilter.value];
        } else if (Array.isArray(productFilter.value)) {
          initialProducts = productFilter.value as string[];
        }
      }
      setSelectedProducts(initialProducts);
      console.log('[FILTER-POPUP] 商品復元:', { productFilter, initialProducts });

      console.log('[FILTER-POPUP] フィルター状態復元完了');
    }
  }, [isOpen, currentFilters, accountTypeContext]);

  // フィルターフィールドの定義を動的に生成
  const getFilterFields = () => {
    // アカウントタイプの選択肢を決定
    const getAccountTypeOptions = () => {
      switch (accountTypeContext) {
        case 'influencer':
          return getInfluencerAccountTypes();
        case 'corporate':
          return getCorporateAccountTypes();
        case 'affiliate':
          return getAffiliateAccountTypes();
        case 'all':
        default:
          // ★ propsから受け取ったaccountTypesを使用
          return accountTypes.length > 0 ? accountTypes : getAllAccountTypes();
      }
    };

    const baseFields = {
      date: [
        { id: 'createdAt', label: '投稿日時', type: 'date' as FilterType }
      ],
      metrics: [
        { id: 'views', label: '再生数', type: 'number' as FilterType },
        { id: 'viewsIncrease', label: '2日再生増加数', type: 'number' as FilterType },
        { id: 'ten_days_increase', label: '10日再生増加数', type: 'number' as FilterType },
        { id: 'likes', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">いいね数</span></span>, type: 'number' as FilterType },
        { id: 'likes_count_increase', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">2日いいね増加数</span></span>, type: 'number' as FilterType },
        { id: 'ten_days_likes_increase', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">10日いいね増加数</span></span>, type: 'number' as FilterType },
        { id: 'comments', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">コメント数</span></span>, type: 'number' as FilterType },
        { id: 'comment_count_increase', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">2日コメント増加数</span></span>, type: 'number' as FilterType },
        { id: 'ten_days_comment_increase', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">10日コメント増加数</span></span>, type: 'number' as FilterType },
        { id: 'play_count_per_follower', label: '再生/フォロワー', type: 'number' as FilterType },
        { id: 'play_increase_per_follower', label: '再生増/フォロワー', type: 'number' as FilterType },
        { id: 'saves', label: <span className="flex items-center"><SaveIcon size={14} /><span className="ml-1">保存数</span></span>, type: 'number' as FilterType },
        { id: 'saves_count_increase', label: <span className="flex items-center"><SaveIcon size={14} /><span className="ml-1">2日保存増加数</span></span>, type: 'number' as FilterType },
        { id: 'ten_days_saves_increase', label: <span className="flex items-center"><SaveIcon size={14} /><span className="ml-1">10日保存増加数</span></span>, type: 'number' as FilterType }
      ],
      categories: [
        { id: 'content_type', label: 'コンテンツタイプ', type: 'multiselect' as FilterType, options: ['video', 'carousel'] },
        { id: 'category', label: 'PR動画ジャンル', type: 'multiselect' as FilterType, options: categories },
        { 
          id: 'product', 
          label: '商品', 
          type: 'multiselect' as FilterType, 
          // ★ propsから受け取った商品リストを使用
          options: productsList
        },
        { 
          id: 'account_type', 
          label: 'アカウントジャンル', 
          type: 'multiselect' as FilterType, 
          options: getAccountTypeOptions()
        }
      ],
      text: [
        { id: 'account_name', label: 'アカウント検索', type: 'text' as FilterType },
        { id: 'hashtags', label: 'ハッシュタグ検索', type: 'text' as FilterType },
        { id: 'audioTitle', label: 'BGM検索', type: 'text' as FilterType }
      ],
      sort: [
        { id: 'views', label: '再生数', type: 'sort' as FilterType },
        { id: 'viewsIncrease', label: '2日再生増加数', type: 'sort' as FilterType },
        { id: 'ten_days_increase', label: '10日再生増加数', type: 'sort' as FilterType },
        { id: 'likes', label: <span className="flex items-center"><HeartIcon size={14} /><span className="ml-1">いいね数</span></span>, type: 'sort' as FilterType },
        { id: 'likes_count_increase', label: '2日いいね増加数', type: 'sort' as FilterType },
        { id: 'ten_days_likes_increase', label: '10日いいね増加数', type: 'sort' as FilterType },
        { id: 'comments', label: <span className="flex items-center"><CommentIcon size={14} /><span className="ml-1">コメント数</span></span>, type: 'sort' as FilterType },
        { id: 'comment_count_increase', label: '2日コメント増加数', type: 'sort' as FilterType },
        { id: 'ten_days_comment_increase', label: '10日コメント増加数', type: 'sort' as FilterType },
        { id: 'play_count_per_follower', label: '再生/フォロワー', type: 'sort' as FilterType },
        { id: 'play_increase_per_follower', label: '再生増/フォロワー', type: 'sort' as FilterType },
        { id: 'saves', label: '保存数', type: 'sort' as FilterType },
        { id: 'saves_count_increase', label: '2日保存増加数', type: 'sort' as FilterType },
        { id: 'ten_days_saves_increase', label: '10日保存増加数', type: 'sort' as FilterType }
      ]
    };

    if (!tabFilterFields) return baseFields;

    // タブ設定に基づいてフィールドをフィルタリング
    return {
      date: baseFields.date.filter(field => tabFilterFields.date.includes(field.id)),
      metrics: baseFields.metrics.filter(field => tabFilterFields.metrics.includes(field.id)),
      categories: baseFields.categories.filter(field => tabFilterFields.categories.includes(field.id)),
      text: baseFields.text.filter(field => tabFilterFields.text.includes(field.id)),
      sort: baseFields.sort.filter(field => tabFilterFields.sort.includes(field.id))
    };
  };

  const filterFields = getFilterFields();
  
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
        setSelectedContentTypes([]);
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

      // アカウントジャンルの選択初期化
      const accountTypeFilter = currentFilters['account_type'];
      if (accountTypeFilter && accountTypeFilter.value) {
        if (typeof accountTypeFilter.value === 'string') {
          setSelectedAccountCategories([accountTypeFilter.value]);
        } else if (Array.isArray(accountTypeFilter.value)) {
          setSelectedAccountCategories(accountTypeFilter.value as string[]);
        }
      } else {
        setSelectedAccountCategories([]);
      }
      
      // 商品の選択初期化
      const productFilter = currentFilters['product'];
      if (productFilter && productFilter.value) {
        if (typeof productFilter.value === 'string') {
          setSelectedProducts([productFilter.value]);
        } else if (Array.isArray(productFilter.value)) {
          setSelectedProducts(productFilter.value as string[]);
        }
      } else {
        setSelectedProducts([]);
      }
    }
  }, [isOpen, currentFilters]);

  // ポップアップの位置を計算
  // ① 座標計算ユーティリティはそのまま
  const calcPos = (anchor: HTMLElement | null) => {
    if (!anchor) return { top: 0, left: 0 };
  
    const { bottom, left } = anchor.getBoundingClientRect();
    const xoffset = 0;
    const yoffset = 0;                         // 下方向に 8px 余白
    return {
      top:  bottom + window.scrollY - yoffset, // ← window.scrollY を必ず加算
      left: left   + window.scrollX - xoffset           // ← 横スクロール対策
    };
  };
  

  /* ② useLayoutEffect ―― "開いた瞬間だけ" 計算 */
  useLayoutEffect(() => {
    if (!isOpen) return
    // 1回だけ座標を決定
    setPopupPosition(calcPos(anchorRef.current))
  }, [isOpen, anchorRef])   // ← listener は付けない！



  useEffect(() => {
    // console.log('[pos]', popupPosition);
  }, [popupPosition]);
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
    
    // 値が空の場合でも比較演算子のみ選択する場合は処理を続行
    // 数値や日付でない場合のみ空値チェックを行う
    if (
      value.type !== 'date' && 
      value.type !== 'number' && 
      (
        (typeof value.value === 'string' && value.value.trim() === '') || 
        value.value === null || 
        value.value === undefined ||
        (typeof value.value === 'number' && isNaN(value.value))
      )
    ) {
      // 数値が0の場合は有効な値として扱う（0より小さいなどのフィルターのため）
      if (!(typeof value.value === 'number' && value.value === 0)) {
        handleClearFilter(fieldId);
        return;
      }
    }
    
    // 数値型で空文字列の場合、比較演算子だけを設定
    if (value.type === 'number' && (value.value === '' || value.value === undefined)) {
      setTempFilters(prev => ({
        ...prev,
        [fieldId]: {
          ...value,
          value: ''  // 空のままにして比較演算子だけを保持
        }
      }));
      return;
    }
    
    // 日付フィルターの場合、type='date'になるよう確保
    if (fieldId === 'createdAt' && value.type === 'date') {
      // 比較演算子を変換せず、そのまま使用
      const apiCompatibleValue = {
        ...value,
        comparison: value.comparison || 'equal' as ComparisonOperator
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

  // すべてのフィルターをクリア（簡素化）
  const handleClearAllFilters = () => {
    setTempFilters({});
    setSelectedCategories([]);
    setSelectedContentTypes([]); // ★ 空配列に変更
    setSelectedAccountCategories([]);
    setSelectedProducts([]);
    setPrimarySort(null);
    setSecondarySort(null);
    
    console.log('フィルターをクリアしました');
  }

  // フィルターを適用
  const handleApplyFilters = () => {
    console.log('[FILTER-DEBUG] フィルターポップアップ - フィルター適用開始');
    
    // 最終的なフィルター状態を構築
    const finalFilters: Record<string, FilterValue> = {};
    
    // 1. 通常のフィルターを処理
    Object.entries(tempFilters).forEach(([key, filter]) => {
      if (filter.type !== 'sort') {
        // 各フィルターに明示的にactive=trueを追加して、テーブルヘッダーに状態を伝達
        finalFilters[key] = {
          ...filter,
          active: true
        };
      }
    });
    
    // 2. カテゴリフィルターの処理
    if (selectedCategories.length > 0) {
      finalFilters['category'] = {
        field: 'category',
        type: 'multiselect',
        value: selectedCategories,
        comparison: 'contains',
        active: true
      };
    }
    
    // 3. アカウントジャンルフィルターの処理を追加
    if (selectedAccountCategories && selectedAccountCategories.length > 0) {
      finalFilters['account_type'] = {
        field: 'account_type',
        type: 'multiselect',
        value: selectedAccountCategories,
        comparison: 'contains',
        active: true
      };
    }
    
    // 4. 商品フィルターの処理を追加
    if (selectedProducts && selectedProducts.length > 0) {
      finalFilters['product'] = {
        field: 'product',
        type: 'multiselect',
        value: selectedProducts,
        comparison: 'contains',
        active: true
      };
    }
    
    // 5. コンテンツタイプフィルターの処理
    if (selectedContentTypes.length > 0) { // ★ 条件を変更（&& selectedContentTypes.length < 3を削除）
      finalFilters['content_type'] = {
        field: 'content_type',
        type: 'multiselect',
        value: selectedContentTypes,
        comparison: 'contains',
        active: true
      };
    }
    
    // 6. ソート情報の処理
    if (primarySort) {
      // primarySortのフィルターを詳細にログ
      console.log('[SORT-DEBUG] フィルターポップアップ - 第一ソート詳細情報:', {
        field: primarySort.field,
        direction: primarySort.direction,
        isPrimarySort: true,
        filterKey: `sort_${primarySort.field}`,
        timestamp: new Date().toISOString()
      });
      
      finalFilters[`sort_${primarySort.field}`] = {
        field: primarySort.field,
        type: 'sort',
        value: primarySort.direction,
        isPrimarySort: true,
        sortField: primarySort.field,
        active: true  // 明示的にactiveをtrueに設定
      };
      
      console.log('[SORT-DEBUG] フィルターポップアップ - 第一ソート設定:', {
        field: primarySort.field,
        direction: primarySort.direction,
        isPrimarySort: true,
        active: true,
        filterValue: finalFilters[`sort_${primarySort.field}`]
      });
      
      // 第二ソートが設定されている場合
      if (secondarySort) {
        finalFilters[`sort_${secondarySort.field}`] = {
          field: secondarySort.field,
          type: 'sort',
          value: secondarySort.direction,
          isPrimarySort: false,
          sortField: secondarySort.field,
          active: true  // 明示的にactiveをtrueに設定
        };
        
        console.log('[SORT-DEBUG] フィルターポップアップ - 第二ソート設定:', {
          field: secondarySort.field,
          direction: secondarySort.direction,
          isPrimarySort: false,
          active: true
        });
      }
    }
    
    // フィルターを親コンポーネントに渡す
    console.log('[FILTER-DEBUG] フィルターポップアップ - 最終フィルター：', finalFilters);
    
    // ソート関連の最終フィルターを詳細にログ
    const sortFilters = Object.entries(finalFilters)
      .filter(([key, filter]) => filter.type === 'sort' || key.startsWith('sort_'))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(sortFilters).length > 0) {
      console.log('[SORT-DEBUG] フィルターポップアップ - 最終ソートフィルター:', {
        sortFilters,
        count: Object.keys(sortFilters).length,
        keys: Object.keys(sortFilters),
        timestamp: new Date().toISOString()
      });
    }
    
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
    console.log('[SORT-DEBUG] フィルターポップアップ - ソート変更:', { 
      fieldId, 
      direction,
      tempFiltersBeforeUpdate: { ...tempFilters }
    });
    
    // 新しいソート情報を作成
    const sortFilter: FilterValue = {
      field: fieldId,
      type: 'sort',
      value: direction,
      sortField: fieldId,
      active: true // activeフラグを明示的に追加
    };
    
    // 一時フィルターを更新
    setTempFilters(prev => {
      const updated = {
        ...prev,
        [`sort_${fieldId}`]: sortFilter
      };
      console.log('[SORT-DEBUG] フィルターポップアップ - 一時フィルター更新後:', {
        updatedFilters: updated,
        sortFilterAdded: updated[`sort_${fieldId}`],
        timestamp: new Date().toISOString()
      });
      return updated;
    });
  };

  // ソート項目の設定関数
  const handlePrimarySortChange = (fieldId: string, direction: 'asc' | 'desc') => {
    console.log('[SORT-DEBUG] フィルターポップアップ - 第一ソート変更:', {
      fieldId,
      direction,
      prevPrimarySort: primarySort,
      prevSecondarySort: secondarySort
    });
    
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
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="before"
                checked={tempFilters[field.id]?.comparison === 'before'}
                onChange={() => {
                  console.log('日付フィルター - "以前"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value || '';
                  handleFilterChange(field.id, { 
                    field: field.id,
                    type: 'date' as FilterType, 
                    comparison: 'before' as ComparisonOperator, 
                    value: currentValue 
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'before' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>以前</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="equal"
                checked={tempFilters[field.id]?.comparison === 'equal'}
                onChange={() => {
                  console.log('日付フィルター - "等しい"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value || '';
                  handleFilterChange(field.id, { 
                    field: field.id,
                    type: 'date' as FilterType, 
                    comparison: 'equal' as ComparisonOperator, 
                    value: currentValue 
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'equal' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>等しい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="after"
                checked={tempFilters[field.id]?.comparison === 'after'}
                onChange={() => {
                  console.log('日付フィルター - "以降"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value || '';
                  handleFilterChange(field.id, { 
                    field: field.id,
                    type: 'date' as FilterType, 
                    comparison: 'after' as ComparisonOperator, 
                    value: currentValue 
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'after' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>以降</span>
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
                  
                  // 比較演算子が設定されていない場合はデフォルトで"等しい"に設定
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
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="greater"
                checked={tempFilters[field.id]?.comparison === 'greater'}
                onChange={() => {
                  console.log('数値フィルター - "より大きい"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value !== undefined ? 
                    tempFilters[field.id].value : 
                    '';
                  handleFilterChange(field.id, {
                    field: field.id,
                    type: 'number',
                    value: currentValue === '' ? '' : parseFloat(currentValue.toString()),
                    comparison: 'greater'
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'greater' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>より大きい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="equal"
                checked={tempFilters[field.id]?.comparison === 'equal'}
                onChange={() => {
                  console.log('数値フィルター - "等しい"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value !== undefined ? 
                    tempFilters[field.id].value : 
                    '';
                  handleFilterChange(field.id, {
                    field: field.id,
                    type: 'number',
                    value: currentValue === '' ? '' : parseFloat(currentValue.toString()),
                    comparison: 'equal'
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'equal' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>等しい</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-[#FE2C55] border-gray-300 focus:ring-[#FE2C55]"
                name={`${field.id}-comparison`}
                value="less"
                checked={tempFilters[field.id]?.comparison === 'less'}
                onChange={() => {
                  console.log('数値フィルター - "より小さい"選択');
                  // 既存の値を保持しながら比較演算子だけを更新
                  const currentValue = tempFilters[field.id]?.value !== undefined ? 
                    tempFilters[field.id].value : 
                    '';
                  handleFilterChange(field.id, {
                    field: field.id,
                    type: 'number',
                    value: currentValue === '' ? '' : parseFloat(currentValue.toString()),
                    comparison: 'less'
                  });
                }}
              />
              <span className={`ml-2 text-sm ${tempFilters[field.id]?.comparison === 'less' ? 'text-[#FE2C55] font-semibold' : 'text-gray-700'}`}>より小さい</span>
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
                const currentComparison = tempFilters[field.id]?.comparison || 'equal';
                handleNumberFilterChange(newValue, currentComparison as ComparisonOperator);
              }}
              onWheel={(e) => {
                e.preventDefault();       // ① 値の変化を止める
                e.currentTarget.blur();   // ② フォーカスを外して次のホイールも無効化
              }}
              /* ↑↓キーも無効にしたい場合は追加 */
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                }
              }}
              placeholder="数値を入力"
              step="1"
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
        // Reactエレメントの場合は、fieldIdからラベルを判断
        return field.id === 'account_name' ? 'アカウント' :
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

  // 商品用のマルチセレクトフィルターを追加
  const renderProductFilter = (field: FilterField) => {
    const isActive = selectedProducts.length > 0;

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
                setSelectedProducts([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <ClearIcon size={14} />
            </button>
          )}
        </div>
        
        <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-md shadow-sm p-2">
          {Object.entries(productCategories).map(([category, productList]) => (
            <div key={category} className="mb-3">
              <div className="font-medium text-gray-700 mb-1">{category}</div>
              {productList.map((productName, index) => (
                <div key={index} className="flex items-center mb-2 ml-2">
                  <input
                    id={`product-${index}-${category}`}
                    type="checkbox"
                    className="h-4 w-4 text-[#FE2C55] focus:ring-[#FE2C55] border-gray-300 rounded"
                    checked={selectedProducts.includes(productName)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(prev => [...prev, productName]);
                      } else {
                        setSelectedProducts(prev => prev.filter(p => p !== productName));
                      }
                    }}
                  />
                  <label htmlFor={`product-${index}-${category}`} className="ml-2 text-sm text-gray-700">
                    {productName}
                  </label>
                </div>
              ))}
            </div>
          ))}
          {Object.keys(productCategories).length === 0 && (
            <div className="text-sm text-gray-500 py-2 text-center">
              {isLoading ? '商品情報を読み込み中...' : '商品情報がありません'}
            </div>
          )}
        </div>
      </div>
    );
  };

  // カテゴリー用の複数選択フィルターセクション
  const renderMultiSelectFilter = (field: FilterField) => {
    // フィールドに応じた選択状態と更新関数を選択
    const selectedItems = field.id === 'category' ? selectedCategories : 
                         field.id === 'content_type' ? selectedContentTypes :
                         field.id === 'account_type' ? selectedAccountCategories : [];
                         
    const setSelectedItems = field.id === 'category' ? setSelectedCategories : 
                            field.id === 'content_type' ? setSelectedContentTypes :
                            field.id === 'account_type' ? setSelectedAccountCategories : () => {};
    
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
      } else if (field.id === 'account_type') {
        // アカウントタイプの選択状態を更新
        if (checked) {
          setSelectedAccountCategories(prev => [...prev, option]);
        } else {
          setSelectedAccountCategories(prev => prev.filter(item => item !== option));
        }
        
        // フィルター状態を更新
        handleFilterChange(field.id, {
          field: field.id,
          type: 'multiselect',
          comparison: 'contains',
          value: checked 
            ? [...selectedItems.filter(item => item !== option), option] 
            : selectedItems.filter(item => item !== option)
        });
      } else if (field.id === 'product') {
        // 商品の選択状態を更新
        if (checked) {
          setSelectedProducts(prev => [...prev, option]);
        } else {
          setSelectedProducts(prev => prev.filter(item => item !== option));
        }
        
        // フィルター状態を更新
        handleFilterChange(field.id, {
          field: field.id,
          type: 'multiselect',
          comparison: 'contains',
          value: checked 
            ? [...selectedItems.filter(item => item !== option), option] 
            : selectedItems.filter(item => item !== option)
        });
      }
    };

    // カテゴリーの並び替え（"その他"を最後に配置）
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
            // フィールドIDに応じて適切な色を取得
            let colors;
            if (field.id === 'account_type') {
              colors = getAccountTypeColor(option, accountTypeContext);
            } else {
              // カテゴリー(動画ジャンル)やその他の場合はGENRE_COLORSを使用
              colors = option in GENRE_COLORS 
                ? GENRE_COLORS[option as keyof typeof GENRE_COLORS] 
                : DEFAULT_GENRE_COLOR;
            }
            
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
    const sortableFields = filterFields['sort'] || []
    
    // ソート対象のプルダウン用オプション
    const fieldOptions = sortableFields.map(field => {
      // ReactNodeからテキスト表示用のラベルを抽出
      let label = '';
      if (typeof field.label === 'string') {
        label = field.label;
      } else if (React.isValidElement(field.label)) {
        // React要素の場合は、fieldIdからラベルを判断
        label = field.id === 'views' ? '再生数' :
                field.id === 'viewsIncrease' ? '2日再生増加数' :
                field.id === 'ten_days_increase' ? '10日再生増加数' :
                field.id === 'likes' ? 'いいね数' :
                field.id === 'likes_count_increase' ? '2日いいね増加数' :
                field.id === 'ten_days_likes_increase' ? '10日いいね増加数' :
                field.id === 'comments' ? 'コメント数' :
                field.id === 'comment_count_increase' ? '2日コメント増加数' :
                field.id === 'ten_days_comment_increase' ? '10日コメント増加数' :
                field.id === 'saves' ? '保存数' :
                field.id === 'saves_count_increase' ? '2日保存増加数' :
                field.id === 'ten_days_saves_increase' ? '10日保存増加数' : field.id;
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
            // 商品フィルターの場合は専用レンダリング関数を使用
            if (field.id === 'product') {
              return renderProductFilter(field);
            }
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
      className="absolute z-50 mt-2 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 flex flex-col max-h-[66vh]"
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
            className="text-sm font-medium text-[#FE2C55] hover:text-[#DE1B47]"
          >
            フィルタを全てクリア
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
      <div className="flex-1 overflow-y-auto">
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