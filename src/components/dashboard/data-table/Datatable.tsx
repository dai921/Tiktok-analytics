'use client'
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
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
import { useProductCategories } from '@/hooks/useProductCategories';
import { TableContext } from './cell-renderers';
import { createProductCellRenderer } from './cell-renderers';
import { ProductBadge } from '@/components/ui/badge';
import { createPortal } from 'react-dom'; 
import { PresetMenu } from '@/components/dashboard/preset-menu';
import { getCurrentTabType } from './tab-columns';
import type { TabType as PresetTabType } from '@/lib/filter_presets_api';

// EXCLUDED_COLUMNS をここで定義
const EXCLUDED_COLUMNS = ['description'];

interface DataTableProps {
  data: VideoData[];
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  isPrOnly: boolean;
  onPrOnlyChange: (isPrOnly: boolean) => void;
  isCorporateOnly: boolean;
  onCorporateOnlyChange: (isCorporateOnly: boolean) => void;
  isInfluencerOnly: boolean;
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
    accounts: string[];
    hashtags: string[];
    music: string[];
    products: string[];
    accountTypes: string[];
    isLoading: boolean;
  }) => void;
  filterOptions?: {
    categories: string[];
    accounts: string[];
    hashtags: string[];
    music: string[];
    products: string[];
    accountTypes: string[];
    isLoading: boolean;
  };

  // ★ 追加: 表示設定メニュー用（任意）
  presetApplyFilters?: (filters: Record<string, FilterQuery>, targetTabKey?: string) => void;
  presetClearFilters?: () => void;
  presetGetFiltersByTab?: () => Record<PresetTabType, Record<string, FilterQuery>>;
  presetGetVisibleColumns?: () => string[];
  presetApplyVisibleColumns?: (cols: string[]) => void;
  // 動画タイプ切替用のコールバック
  onVideoTypeChange?: (type: 'all' | 'affiliate' | 'corporate' | 'influencer') => void;
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
      accounts: [],
      hashtags: [],
      music: [],
      products: [],
      accountTypes: [],
      isLoading: false
    },
    presetApplyFilters,
    presetClearFilters,
    presetGetFiltersByTab,
    presetGetVisibleColumns,
    presetApplyVisibleColumns,
    onVideoTypeChange
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
    
    // カスタムフックからフィルターオプションを取得
    // ★ 修正: onFilterOptionsUpdateを渡す
    const {
      categoryList,
      accountList,
      hashtagList,
      audioTitleList,
      isLoadingFilterOptions,
      getFilteredOptions
    } = useFilterOptions(currentFilters, onFilterOptionsUpdate);

    const { productCategories } = useProductCategories();

    // ★ 追加: productCategoriesを適切な形式に変換
    const convertedProductCategories = useMemo(() => {
      const converted: Record<string, string[]> = {};
      
      Object.entries(productCategories).forEach(([productName, categoryName]) => {
        if (!converted[categoryName]) {
          converted[categoryName] = [];
        }
        converted[categoryName].push(productName);
      });
      
      return converted;
    }, [productCategories]);

    // カラム定義を取得
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
      clearAllFilters: handleClearAllFilters
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
                clearFilters={presetClearFilters || handleClearAllFilters}
                getFiltersByTab={presetGetFiltersByTab}
                getVisibleColumns={presetGetVisibleColumns || getVisibleColumnsForPreset}
                applyVisibleColumns={presetApplyVisibleColumns || applyVisibleColumnsForPreset}
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
        
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center space-x-2">
            {/* フィルターボタンを追加 */}
            <button
              ref={filterButtonRef}
              onClick={() => setFilterPopupOpenState(true)}
              className="inline-flex items-center px-2.5 py-1.5 border border-[#FE2C55] shadow-sm text-xs font-medium rounded text-[#FE2C55] bg-white hover:bg-[#FE2C55] hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55] transition-colors duration-200"
            >
              <FilterIcon size={16} />
              <span className="ml-1">フィルター</span>
            </button>
            
            {/* 動画タイプタブ */}
            <div className="flex bg-gray-50 rounded-lg p-1">
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
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ml-1 ${
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
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ml-1 ${
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
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 border-2 ml-1 ${
                  isInfluencerOnly
                    ? 'bg-white text-gray-900 border-[#FE2C55] shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
              >
                インフルエンサー系動画
              </button>
            </div>
          </div>
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[10, 20, 50]}
          />
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
                productCategories 
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
            onClose={() => setFilterPopupOpenState(false)}
            anchorRef={filterButtonRef}
            onFilterChange={handleBulkFilterChange}
            currentFilters={columnFilters}
            categories={categoryList}
            accounts={accountList}
            hashtags={hashtagList}
            // ★ 修正: filterOptionsはデフォルト値があるのでオプショナルチェイニング不要
            products={filterOptions.products}
            // ★ 修正: 変換されたproductCategoriesを渡す
            productCategories={convertedProductCategories}
            accountTypes={filterOptions.accountTypes}
            isLoading={isLoadingFilterOptions || filterOptions.isLoading}
            onClearAll={handleClearFilterInputs}
            tabFilterFields={tabFilterFields}
            accountTypeContext={getAccountTypeContext()}
            onVideoTypeChange={onVideoTypeChange}
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