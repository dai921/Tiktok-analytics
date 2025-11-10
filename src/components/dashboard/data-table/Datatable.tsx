'use client'
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import type { ReactNode, ChangeEvent } from 'react';
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard';
import { Pagination } from '../pagination';
import { TextPopup } from '@/components/ui/text-popup';
import { FilterPopup } from '@/components/ui/filter-popup';
import { ColumnSettings } from '@/components/ui/column-settings';
import { SettingsIcon, FilterIcon } from './icons';
import { SortableHeaderCell } from './SortableHeaderCell';
import { createColumns } from './columns';
// 循環参照を避けるために./constantsからインポートしていたものを一部移動
import { DEFAULT_VISIBLE_COLUMNS } from './constants';
import { useFilterOptions } from './filter-hooks';
import { useFilterLogic } from './filter-logic';
import { useSortLogic } from './sort-logic';
import { useColumnDnd } from './column-dnd';
import { useColumnVisibility } from './column-visibility';
import { TableContext } from './cell-renderers';
import { createProductCellRenderer } from './cell-renderers';
import { createPortal } from 'react-dom'; 
import { PresetMenu } from '@/components/dashboard/preset-menu';
import { getCurrentTabType } from './tab-columns';
import type { TabType as PresetTabType } from '@/lib/filter_presets_api';

// EXCLUDED_COLUMNS をここで定義
const EXCLUDED_COLUMNS = ['description'];

const SearchIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.5" />
    <line x1="12.8" y1="12.8" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ClearIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <line x1="6" y1="6" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="6" y1="14" x2="14" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface DataTableProps {
  data: VideoData[];
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  totalPages: number;
  isLoading?: boolean;
  isPrOnly?: boolean;
  onPrOnlyChange: (isPrOnly: boolean) => void;
  isCorporateOnly?: boolean;
  onCorporateOnlyChange: (isCorporateOnly: boolean) => void;
  isInfluencerOnly?: boolean;
  onInfluencerOnlyChange: (isInfluencerOnly: boolean) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  defaultVisibleColumns?: string[];
  onColumnSettingsChange?: (visibleColumns: string[]) => void;
  tabFilterFields?: {
    date: string[];
    metrics: string[];
    categories: string[];
    text: string[];
    sort: string[];
  };
  currentTabFilters?: Record<string, FilterQuery>;
  
  // ★ 修正: 型の一貫性を保つ
  onFilterOptionsUpdate?: (options: {
    categories: string[];
    products: string[];
    productCategories: Record<string, string[]>;
    productCategoryMap: Record<string, string>;
    accountTypes: string[];
    secondAccountTypes: string[];
    thirdAccountTypes: string[];
    thirdAccountTypeMap: Record<string, string>;
    isLoading: boolean;
  }) => void;
  filterOptions?: {
    categories: string[];
    products: string[];
    productCategories: Record<string, string[]>;
    productCategoryMap: Record<string, string>;
    accountTypes: string[];
    secondAccountTypes: string[];
    thirdAccountTypes: string[];
    thirdAccountTypeMap: Record<string, string>;
    isLoading: boolean;
  };

  // ★ 追加: 表示設定メニュー用（任意）
  presetApplyFilters?: (filters: Record<string, FilterQuery>, targetTabKey?: string) => void;
  presetClearFilters?: () => void;
  presetGetFiltersByTab?: () => Record<PresetTabType, Record<string, FilterQuery>>;
  presetGetVisibleColumns?: () => string[];
  presetGetVisibleColumnsByTab?: () => Record<PresetTabType, string[]>;
  presetApplyVisibleColumns?: (cols: string[]) => void;
  searchKeyword?: string;
  onSearchKeywordChange?: (value: string) => void;
  notificationButton?: ReactNode;
  showSearchInput?: boolean;
}

export const DataTable = forwardRef<{ clearAllFilters: () => void }, DataTableProps>(
  ({
    data,
    onFilterChange,
    onPageChange,
    currentPage,
    totalPages,
    isLoading = false,
    isPrOnly = false,
    onPrOnlyChange,
    isCorporateOnly = false,
    onCorporateOnlyChange,
    isInfluencerOnly = false,
    onInfluencerOnlyChange,
    pageSize = 50,
    onPageSizeChange,
    defaultVisibleColumns,
    onColumnSettingsChange,
    tabFilterFields,
    currentTabFilters = {},
    onFilterOptionsUpdate, // ★ 追加
    filterOptions = {      // ★ 追加: デフォルト値を設定
      categories: [],
      products: [],
      productCategories: {},
      productCategoryMap: {},
      accountTypes: [],
      secondAccountTypes: [],
      thirdAccountTypes: [],
      thirdAccountTypeMap: {},
      isLoading: false
    },
    presetApplyFilters,
    presetClearFilters,
    presetGetFiltersByTab,
    presetGetVisibleColumns,
    presetGetVisibleColumnsByTab,
    presetApplyVisibleColumns,
    searchKeyword,
    onSearchKeywordChange,
    notificationButton,
    showSearchInput = true
  }, ref) => {
    // 選択されたテキスト（ポップアップ表示用）
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null);
    const filterButtonRef = useRef<HTMLButtonElement>(null);
    
    // ソートロジック
    const sortLogic = useSortLogic();
    const { 
      primarySort, 
      secondarySort, 
      sortField, 
      sortDirection,
      setPrimarySort,
      setSecondarySort,
      setSortField,
      setSortDirection
    } = sortLogic;
    
    // フィルターロジック - 外部フィルターを渡す
    const [filterState, filterHandlers] = useFilterLogic(
      onFilterChange, 
      {
        primarySort,
        secondarySort,
        setPrimarySort,
        setSecondarySort,
        setSortField,
        setSortDirection
      }, 
      isPrOnly, 
      isCorporateOnly,
      currentTabFilters // ← 外部フィルター状態を渡す
    );
    
    const { 
      columnFilters, 
      currentFilters, 
      hasActiveFilters,
      // isPrOnly: internalIsPrOnly, // 削除
      // isCorporateOnly: internalIsCorporateOnly // 削除
    } = filterState;
    
    const { 
      handleFilter, 
      handleBulkFilterChange, 
      handleClearAllFilters, 
      handleClearFilterInputs,
      setIsFilterPopupOpen,
      // handlePrOnlyChange, // 削除
      // handleCorporateOnlyChange // 削除
    } = filterHandlers;

    // 外部状態と内部状態の同期 - 削除
    // useEffect(() => {
    //   if (internalIsPrOnly !== isPrOnly) {
    //     handlePrOnlyChange(isPrOnly);
    //   }
    // }, [isPrOnly, internalIsPrOnly, handlePrOnlyChange]);

    // useEffect(() => {
    //   if (internalIsCorporateOnly !== isCorporateOnly) {
    //     handleCorporateOnlyChange(isCorporateOnly);
    //   }
    // }, [isCorporateOnly, internalIsCorporateOnly, handleCorporateOnlyChange]);
    
    // フィルターポップアップの状態
    const [isFilterPopupOpen, setFilterPopupOpenState] = useState(false);

    const openFilterPopup = useCallback(() => {
      setIsFilterPopupOpen(true);
      setFilterPopupOpenState(true);
    }, [setIsFilterPopupOpen, setFilterPopupOpenState]);

    const closeFilterPopup = useCallback(() => {
      setIsFilterPopupOpen(false);
      setFilterPopupOpenState(false);
    }, [setIsFilterPopupOpen, setFilterPopupOpenState]);

    const clearAllFilters = useCallback(() => {
      handleClearAllFilters();
      closeFilterPopup();
      onSearchKeywordChange?.('');
    }, [handleClearAllFilters, closeFilterPopup, onSearchKeywordChange]);
    
    // カスタムフックからフィルターオプションを取得
    // ★ 修正: onFilterOptionsUpdateを渡す
    const { 
      categoryList, 
      productList, 
      productCategories, 
      productCategoryMap, 
      isLoadingFilterOptions, 
      getFilteredOptions
    } = useFilterOptions(currentFilters, onFilterOptionsUpdate);


    // カラム定義を取得
    const resolvedProductCategories = useMemo(() => {
      if (productCategories && Object.keys(productCategories).length > 0) {
        return productCategories;
      }
      return filterOptions.productCategories || {};
    }, [productCategories, filterOptions.productCategories]);

    const resolvedProductCategoryMap = useMemo(() => {
      if (productCategoryMap && Object.keys(productCategoryMap).length > 0) {
        return productCategoryMap;
      }
      return filterOptions.productCategoryMap || {};
    }, [productCategoryMap, filterOptions.productCategoryMap]);

    const columns = useMemo(() => {
      const createdColumns = createColumns(
        columnFilters,
        primarySort,
        secondarySort,
        handleFilter,
        getFilteredOptions,
        isLoadingFilterOptions,
        sortField,
        sortDirection,
        createProductCellRenderer() // 直接呼び出し
      );
      
      return createdColumns;
    }, [
      columnFilters, 
      primarySort, 
      secondarySort, 
      handleFilter, 
      getFilteredOptions, 
      isLoadingFilterOptions, 
      sortField, 
      sortDirection
    ]);
    
    // カラムのドラッグ＆ドロップ機能
    const {
      orderedColumns,
      setOrderedColumns,
      DndContextProvider,
      SortableContextProvider
    } = useColumnDnd(columns);
    
    // 初期化時にカラムの順序を設定
    const isInitialRenderRef = useRef(true);
    useEffect(() => {
      if (isInitialRenderRef.current) {
        setOrderedColumns(columns);
        isInitialRenderRef.current = false;
      }
    }, [columns, setOrderedColumns]);
    
    // カラム表示設定
    const {
      isColumnSettingsOpen,
      setIsColumnSettingsOpen,
      visibleColumns,
      columnSettingsButtonRef,
      handleColumnVisibilityChange
    } = useColumnVisibility(defaultVisibleColumns, onColumnSettingsChange);

    // 参照を設定
    useImperativeHandle(ref, () => ({
      clearAllFilters
    }));
    
    // ページ切り替えハンドラー
    const handlePageChange = (page: number) => {
      onPageChange(page);
    };
    
    // 表示件数変更のハンドラー
    const handlePageSizeChange = (size: number) => {
      if (onPageSizeChange) {
        onPageSizeChange(size);
      }
    };


    // filteredColumns の定義で columns を直接使用
    const filteredColumns = useMemo(() => {
      return orderedColumns.filter(col => 
        !EXCLUDED_COLUMNS.includes(String(col.accessorKey)) &&
        visibleColumns.includes(String(col.accessorKey))
      );
    }, [orderedColumns, visibleColumns]); // columnsWithProductRendererを依存配列から削除
  

    // すべての動画タブのハンドラー
    const handleAllVideosToggle = useCallback(() => {
      console.log('すべての動画タブクリック');
      onPrOnlyChange(false);
      onCorporateOnlyChange(false);
      onInfluencerOnlyChange(false);
    }, [onPrOnlyChange, onCorporateOnlyChange, onInfluencerOnlyChange]);

    // フィルターポップアップに渡すaccountTypeContextを動的に生成
    const getAccountTypeContext = (): 'influencer' | 'corporate' | 'affiliate' | 'all' => {
      if (isCorporateOnly) return 'corporate';
      if (isInfluencerOnly) return 'influencer';
      if (isPrOnly) return 'affiliate';
      return 'all';
    };

    // 表示設定用: 現在のタブタイプと可視カラム操作
    const tabTypeForPreset = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly) as PresetTabType;
    const getFiltersForPreset = useCallback(() => currentFilters, [currentFilters]);
    const getVisibleColumnsForPreset = useCallback(() => visibleColumns, [visibleColumns]);
    const applyVisibleColumnsForPreset = useCallback((cols: string[]) => {
      // newColumns 経由で一括適用
      handleColumnVisibilityChange('', false, cols);
    }, [handleColumnVisibilityChange]);

    // プリセット適用時にタブ状態を切り替える
    const presetSetTabFlags = useCallback((flags: { isPrOnly?: boolean; isCorporateOnly?: boolean; isInfluencerOnly?: boolean }) => {
      onPrOnlyChange(!!flags.isPrOnly);
      onCorporateOnlyChange(!!flags.isCorporateOnly);
      onInfluencerOnlyChange(!!flags.isInfluencerOnly);
    }, [onPrOnlyChange, onCorporateOnlyChange, onInfluencerOnlyChange]);

    const currentSearchKeyword = searchKeyword ?? '';

    const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
      onSearchKeywordChange?.(event.target.value);
    }, [onSearchKeywordChange]);

    const handleSearchClear = useCallback(() => {
      onSearchKeywordChange?.('');
    }, [onSearchKeywordChange]);

    return (
      <div className="data-table-wrapper relative bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 最新動画一覧のタイトルのみ表示 */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-800">最新動画一覧</h2>
            {presetApplyFilters && (
              <PresetMenu
                tabType={tabTypeForPreset}
                getFilters={getFiltersForPreset}
                applyFilters={presetApplyFilters}
                clearFilters={presetClearFilters || clearAllFilters}
                getFiltersByTab={presetGetFiltersByTab}
                getVisibleColumns={presetGetVisibleColumns || getVisibleColumnsForPreset}
                getVisibleColumnsByTab={presetGetVisibleColumnsByTab}
                applyVisibleColumns={presetApplyVisibleColumns || applyVisibleColumnsForPreset}
                setTabFlags={presetSetTabFlags}
                notificationButton={notificationButton}
              />
            )}
          </div>
          
          {/* 表示設定ボタンをヘッダー右上に移動 */}
          <button
            ref={columnSettingsButtonRef}
            onClick={() => setIsColumnSettingsOpen(true)}
            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55] transition-colors duration-200"
          >
            <SettingsIcon size={16} />
            <span className="ml-1">表示カラム</span>
          </button>
        </div>
        
        <div className="flex flex-wrap items-start justify-between gap-4 p-2">
          {showSearchInput && (
            <div className="flex min-w-[240px] flex-col gap-2">
              <div className="relative w-full md:w-80">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={currentSearchKeyword}
                  onChange={handleSearchInputChange}
                  placeholder="キーワードで検索"
                  className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#FE2C55] focus:outline-none focus:ring-1 focus:ring-[#FE2C55]"
                />
                {currentSearchKeyword && (
                  <button
                    type="button"
                    onClick={handleSearchClear}
                    className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">検索キーワードをクリア</span>
                    <ClearIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              ref={filterButtonRef}
              onClick={openFilterPopup}
              className="inline-flex w-full items-center justify-center rounded border border-[#FE2C55] px-2.5 py-1.5 text-xs font-medium text-[#FE2C55] shadow-sm transition-colors duration-200 hover:bg-[#FE2C55] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#FE2C55] focus:ring-offset-2 sm:w-auto"
            >
              <FilterIcon size={16} />
              <span className="ml-1">フィルター</span>
            </button>
            
            {/* 動画タイプタブ */}
            <div className="flex flex-wrap gap-1 rounded-lg bg-gray-50 p-1 sm:flex-nowrap">
              <button
                onClick={handleAllVideosToggle}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ${
                  !isPrOnly && !isCorporateOnly && !isInfluencerOnly
                    ? 'bg-white text-gray-900 border-[#FE2C55] shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
              >
                すべての動画
              </button>
              <button
                onClick={() => {
                  console.log('アフィリエイト系動画タブクリック');
                  onPrOnlyChange(true);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ${
                  isPrOnly
                    ? 'bg-white text-gray-900 border-[#FE2C55] shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
              >
                アフィ系動画
              </button>
              <button
                onClick={() => {
                  console.log('運用代行用動画タブクリック');
                  onCorporateOnlyChange(true);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ${
                  isCorporateOnly
                    ? 'bg-white text-gray-900 border-[#FE2C55] shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
              >
                企業系動画
              </button>
              <button
                onClick={() => {
                  console.log('インフルエンサー動画タブクリック');
                  onInfluencerOnlyChange(true);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ${
                  isInfluencerOnly
                    ? 'bg-white text-gray-900 border-[#FE2C55] shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
              >
                インフルエンサー系動画
              </button>
            </div>
          </div>

          <div className="ml-auto">
            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        </div>
        
        {/* テーブルの内容 */}
        <div className="relative">
          <div className="bg-white rounded-lg shadow-sm">
            {isLoading && (
              <div className="absolute inset-0 bg-white/50 z-[9999] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
              </div>
            )}
            <div className="overflow-x-auto">
              <TableContext.Provider value={{ 
                setSelectedText, 
                productCategories: resolvedProductCategoryMap, 
                thirdAccountTypeMap: filterOptions.thirdAccountTypeMap ?? {} 
              }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <DndContextProvider>
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <SortableContextProvider>
                          {filteredColumns.map((column, index) => {
                            return (
                              <SortableHeaderCell
                                key={column.accessorKey}
                                column={column}
                                index={index}
                              />
                            );
                          })}
                        </SortableContextProvider>
                      </tr>
                    </thead>
                  </DndContextProvider>
                  <tbody>
                    {data.map((row: VideoData, rowIndex: number) => (
                      <tr 
                        key={`row-${row.id || rowIndex}`}
                        className="border-b hover:bg-gray-50 transition-colors duration-150 h-[100px]"
                      >
                        {filteredColumns.map((column, colIndex) => (
                          <td 
                            key={`cell-${rowIndex + 1}-${column.accessorKey || colIndex}`}
                            className={`px-2 py-1 bg-white ${
                              ['views', 'viewsIncrease', 'likes', 'comments'].includes(String(column.accessorKey)) 
                                ? 'font-medium' 
                                : ''
                            }`}
                            style={{ 
                              width: column.accessorKey === 'thumbnail_url' ? '160px' :
                                    column.accessorKey === 'category' ? '160px' :
                                    column.accessorKey === 'createdAt' ? '80px' : 
                                    column.accessorKey === 'account_name' ? '120px' :
                                    column.accessorKey === 'audioTitle' ? '120px' :
                                    column.accessorKey === 'description' ? '150px' :
                                    column.accessorKey === 'url' ? '70px' :
                                    column.accessorKey === 'views' ? '100px' :
                                    column.accessorKey === 'viewsIncrease' ? '100px' :
                                    column.accessorKey === 'likes' ? '100px' :
                                    column.accessorKey === 'comments' ? '100px' :
                                    column.accessorKey === 'product' ? '150px' :
                                    column.accessorKey === 'account_type' ? '150px' :
                                       column.accessorKey === 'second_account_type' ? '150px' :
                                       column.accessorKey === 'third_account_type' ? '150px' :
                                    column.accessorKey === 'hashtags' ? '150px' :
                                    column.accessorKey === 'ten_days_increase' ? '120px' :
                                    column.accessorKey === 'likes_count_increase' ? '120px' :
                                    column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                    column.accessorKey === 'comment_count_increase' ? '120px' :
                                    column.accessorKey === 'ten_days_comment_increase' ? '140px' :
                                    column.accessorKey === 'play_count_per_follower' ? '120px' :
                                    column.accessorKey === 'play_increase_per_follower' ? '120px' :
                                    column.accessorKey === 'saves' ? '100px' :
                                    column.accessorKey === 'save_count' ? '100px' :
                                    column.accessorKey === 'save_count_increase' ? '120px' :
                                    column.accessorKey === 'ten_days_save_increase' ? '140px' : undefined,
                              minWidth: column.accessorKey === 'thumbnail_url' ? '160px' :
                                       column.accessorKey === 'category' ? '160px' :
                                       column.accessorKey === 'createdAt' ? '80px' : 
                                       column.accessorKey === 'views' ? '100px' :
                                       column.accessorKey === 'viewsIncrease' ? '100px' :
                                       column.accessorKey === 'likes' ? '100px' :
                                       column.accessorKey === 'comments' ? '100px' :
                                       column.accessorKey === 'product' ? '150px' :
                                       column.accessorKey === 'account_type' ? '150px' :
                                       column.accessorKey === 'second_account_type' ? '150px' :
                                       column.accessorKey === 'third_account_type' ? '150px' :
                                       column.accessorKey === 'hashtags' ? '150px' :
                                       column.accessorKey === 'ten_days_increase' ? '120px' :
                                       column.accessorKey === 'likes_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                       column.accessorKey === 'comment_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_comment_increase' ? '140px' :
                                       column.accessorKey === 'play_count_per_follower' ? '120px' :
                                       column.accessorKey === 'play_increase_per_follower' ? '120px' :
                                       column.accessorKey === 'save_count' ? '100px' :
                                       column.accessorKey === 'save_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_save_increase' ? '140px' : undefined,
                              maxWidth: column.accessorKey === 'thumbnail_url' ? '160px' :
                                       column.accessorKey === 'category' ? '160px' :
                                       column.accessorKey === 'createdAt' ? '80px' : 
                                       column.accessorKey === 'views' ? '100px' :
                                       column.accessorKey === 'viewsIncrease' ? '100px' :
                                       column.accessorKey === 'likes' ? '100px' :
                                       column.accessorKey === 'comments' ? '100px' :
                                       column.accessorKey === 'product' ? '150px' :
                                       column.accessorKey === 'account_type' ? '150px' :
                                       column.accessorKey === 'second_account_type' ? '150px' :
                                       column.accessorKey === 'third_account_type' ? '150px' :
                                       column.accessorKey === 'hashtags' ? '150px' :
                                       column.accessorKey === 'ten_days_increase' ? '120px' :
                                       column.accessorKey === 'likes_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                       column.accessorKey === 'comment_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_comment_increase' ? '140px' :
                                       column.accessorKey === 'play_count_per_follower' ? '120px' :
                                       column.accessorKey === 'play_increase_per_follower' ? '120px' :
                                       column.accessorKey === 'save_count' ? '100px' :
                                       column.accessorKey === 'save_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_save_increase' ? '140px' : undefined,
                              overflow: 'hidden'
                            }}
                          >
                            {column.cell 
                              ? column.cell({ row }) 
                              : typeof row[column.accessorKey as keyof VideoData] === 'object'
                                ? JSON.stringify(row[column.accessorKey as keyof VideoData])
                                : String(row[column.accessorKey as keyof VideoData] || '')
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContext.Provider>
            </div>
          </div>
          
          {selectedText && (
            <TextPopup
              isOpen={!!selectedText}
              onClose={() => setSelectedText(null)}
              title={selectedText?.title || ''}
              content={selectedText?.content || ''}
            />
          )}
        </div>
        
        <div className="flex items-center justify-end p-2">
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>

        {/* Portalを使用してDOM階層の上位に表示 */}
        {typeof window !== 'undefined' && createPortal(
          <FilterPopup
            isOpen={isFilterPopupOpen}
            onClose={closeFilterPopup}
            anchorRef={filterButtonRef}
            onFilterChange={handleBulkFilterChange}
            currentFilters={columnFilters}
            categories={categoryList}
            // ★ 修正: filterOptionsはデフォルト値があるのでオプショナルチェイニング不要
            products={productList.length ? productList : filterOptions.products}
            productCategories={resolvedProductCategories}
            accountTypes={filterOptions.accountTypes}
            secondAccountTypes={filterOptions.secondAccountTypes}
            thirdAccountTypes={filterOptions.thirdAccountTypes}
            thirdAccountTypeMap={filterOptions.thirdAccountTypeMap}
            isLoading={isLoadingFilterOptions || filterOptions.isLoading}
            onClearAll={handleClearFilterInputs}
            tabFilterFields={tabFilterFields}
            accountTypeContext={getAccountTypeContext()}
          />, 
          document.body
        )}

        <ColumnSettings
          isOpen={isColumnSettingsOpen}
          onClose={() => setIsColumnSettingsOpen(false)}
          anchorRef={columnSettingsButtonRef}
          columns={columns}
          visibleColumns={visibleColumns}
          onColumnVisibilityChange={handleColumnVisibilityChange}
        />
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';
