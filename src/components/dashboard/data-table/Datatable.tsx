// src/components/dashboard/data-table/DataTable.tsx
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
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  defaultVisibleColumns?: string[];
  onColumnSettingsChange?: (visibleColumns: string[]) => void;
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
    pageSize = 10,
    onPageSizeChange,
    defaultVisibleColumns,
    onColumnSettingsChange
  }, ref) => {
    // コールバック関数の参照変化を追跡するためのref
    const onFilterChangeRef = useRef(onFilterChange);
    const onPageChangeRef = useRef(onPageChange);
    const onPrOnlyChangeRef = useRef(onPrOnlyChange);
    const onPageSizeChangeRef = useRef(onPageSizeChange);

    // コールバック関数の参照変化をログ出力
    useEffect(() => {
      if (onFilterChangeRef.current !== onFilterChange) {
        console.log('[DEBUG-PROPS] DataTable - onFilterChange の参照が変化しました');
        onFilterChangeRef.current = onFilterChange;
      }
      
      if (onPageChangeRef.current !== onPageChange) {
        console.log('[DEBUG-PROPS] DataTable - onPageChange の参照が変化しました');
        onPageChangeRef.current = onPageChange;
      }
      
      if (onPrOnlyChangeRef.current !== onPrOnlyChange) {
        console.log('[DEBUG-PROPS] DataTable - onPrOnlyChange の参照が変化しました');
        onPrOnlyChangeRef.current = onPrOnlyChange;
      }
      
      if (onPageSizeChangeRef.current !== onPageSizeChange) {
        console.log('[DEBUG-PROPS] DataTable - onPageSizeChange の参照が変化しました');
        onPageSizeChangeRef.current = onPageSizeChange;
      }
    }, [onFilterChange, onPageChange, onPrOnlyChange, onPageSizeChange]);
    
    // コンポーネントのマウント回数をカウント
    const renderCountRef = useRef(0);
    
    // レンダリングごとにカウントを増加
    useEffect(() => {
      renderCountRef.current += 1;
      console.log(`[DEBUG-LOOP] DataTable - レンダリング回数: ${renderCountRef.current}`);
    });
    
    // 選択されたテキスト（ポップアップ表示用）
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null);
    const [forceUpdate, setForceUpdate] = useState(0);
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
    
    // ソート状態の初期化をログ
    useEffect(() => {
      console.log('[DEBUG-LOOP] DataTable - sortLogic 初期化:', {
        primarySort,
        secondarySort,
        sortField,
        sortDirection
      });
    }, []);
    
    // フィルターロジック
    const [filterState, filterHandlers] = useFilterLogic(onFilterChange, {
      primarySort,
      secondarySort,
      setPrimarySort,
      setSecondarySort,
      setSortField,
      setSortDirection
    });
    
    const { 
      columnFilters, 
      currentFilters, 
      hasActiveFilters 
    } = filterState;
    
    const { 
      handleFilter, 
      handleBulkFilterChange, 
      handleClearAllFilters, 
      handleClearFilterInputs,
      setIsFilterPopupOpen
    } = filterHandlers;
    
    // フィルターポップアップの状態
    const [isFilterPopupOpen, setFilterPopupOpenState] = useState(false);
    
    // カスタムフックからフィルターオプションを取得
    const {
      categoryList,
      accountList,
      hashtagList,
      audioTitleList,
      isLoadingFilterOptions,
      getFilteredOptions
    } = useFilterOptions(currentFilters);
    
    // filterOptions関数の参照変化を監視（useFilterOptionsの近く）
    const prevHandleFilterRef = useRef(handleFilter);
    const prevGetFilteredOptionsRef = useRef(getFilteredOptions);

    useEffect(() => {
      if (prevHandleFilterRef.current !== handleFilter) {
        console.log('[DEBUG-FUNC-REFS] handleFilter の参照が変化しました');
        prevHandleFilterRef.current = handleFilter;
      }
      
      if (prevGetFilteredOptionsRef.current !== getFilteredOptions) {
        console.log('[DEBUG-FUNC-REFS] getFilteredOptions の参照が変化しました');
        prevGetFilteredOptionsRef.current = getFilteredOptions;
      }
    }, [handleFilter, getFilteredOptions]);
    
    // 製品カテゴリを取得
    const { productCategories, loading: loadingProductCategories } = useProductCategories();
    
    useEffect(() => {
      if (!loadingProductCategories) {
        console.log('[DEBUG-PRODUCTS] 製品カテゴリマッピング取得完了', productCategories);
      }
    }, [loadingProductCategories, productCategories]);

    const productCellRenderer = useMemo(() => {
      return createProductCellRenderer(productCategories);
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
        productCellRenderer
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
      sortDirection,
      productCellRenderer
    ]);
    
    // 依存配列の変更を監視するための追加ログ
    useEffect(() => {
      console.log('[DEBUG-LOOP] DataTable - columns 依存配列の変更:', {
        primarySort: primarySort?.field,
        secondarySort: secondarySort?.field,
        sortField,
        sortDirection,
        timestamp: new Date().toISOString(),
      });
    }, [primarySort, secondarySort, sortField, sortDirection]);
    
    // カラムのドラッグ＆ドロップ機能
    const {
      orderedColumns,
      setOrderedColumns,
      DndContextProvider,
      SortableContextProvider
    } = useColumnDnd(columns);
    
    // useColumnDndの直後にメモイゼーションのデバッグログを追加
    useEffect(() => {
      console.log('[DEBUG-COLUMNS-REF] columns参照変更検知:', {
        columnsLength: columns.length,
        columnsRef: columns,
        timestamp: new Date().toISOString()
      });
    }, [columns]);
    
    // orderedColumnsの変更をデバッグ
    useEffect(() => {
      console.log('[DEBUG-ORDERED-COLUMNS] orderedColumns変更検知:', {
        orderedColumnsLength: orderedColumns.length,
        orderedColumnsRef: orderedColumns,
        timestamp: new Date().toISOString()
      });
    }, [orderedColumns]);
    
    // 初期化時にカラムの順序を設定（ここが問題と思われる箇所）
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

    // ColumnのcellプロパティをDataTable.tsx側で直接オーバーライド
    // filteredColumnsを作成する前に、product カラムの cell プロパティを直接変更する
    const columnsWithProductRenderer = useMemo(() => {
      return columns.map(column => {
        if (column.accessorKey === 'product') {
          return {
            ...column,
            cell: ({ row }: { row: VideoData }) => {
              // 完全なrow情報をログ出力
              console.log('製品セル内のrow全データ:', row);
              
              // キーが"product"ではなく別の可能性がある場合の検証
              const possibleProductKeys = ['product', 'products', 'productName', 'product_name'];
              const foundKey = possibleProductKeys.find(key => row[key as keyof typeof row]);
              
              console.log('検出された製品キー:', {
                foundKey,
                value: foundKey ? row[foundKey as keyof typeof row] : null
              });
              
              return (
                <div className="w-[120px] min-w-[120px]">
                  <div className="flex flex-wrap gap-1 justify-start items-center">
                    {row.product && (
                      <div className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {row.product} 
                        <span className="text-gray-500">
                          ({productCategories?.[row.product] || 'その他'})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
          };
        }
        return column;
      });
    }, [columns, productCategories]);

    // filteredColumns の定義で columnsWithProductRenderer を使用
    const filteredColumns = useMemo(() => {
      console.log('[DEBUG-FILTERED] filteredColumns の再計算:', {
        orderedColumnsLength: orderedColumns.length,
        visibleColumnsLength: visibleColumns.length,
        timestamp: new Date().toISOString()
      });
      
      console.log('EXCLUDED_COLUMNS:', EXCLUDED_COLUMNS);
      console.log('visibleColumns:', visibleColumns);
      
      return orderedColumns.length > 0
        ? orderedColumns.filter(col =>
            !EXCLUDED_COLUMNS.includes(String(col.accessorKey)) &&
            visibleColumns.includes(String(col.accessorKey))
          )
        : columnsWithProductRenderer.filter(col =>
            !EXCLUDED_COLUMNS.includes(String(col.accessorKey)) &&
            visibleColumns.includes(String(col.accessorKey))
          );
    }, [orderedColumns, columnsWithProductRenderer, visibleColumns]);
    
    useEffect(() => {
      // ソート状態の変更をデバッグ

    }, [primarySort, secondarySort, sortField, sortDirection]);
    
    // フィルターのバルク変更ハンドラーにデバッグログを追加
    const handleDebugBulkFilterChange = (filters: Record<string, FilterValue>) => {
      
      // ソート関連のフィルターを特に詳しくログ
      const sortFilters = Object.entries(filters).filter(([key, value]) => 
        value.type === 'sort' || key.startsWith('sort_')
      );
      
      if (sortFilters.length > 0) {
        
        sortFilters.forEach(([key, value]) => {

        });
      } else {
      }
      
      // 元のハンドラーを呼び出し
      handleBulkFilterChange(filters);
      
      // ソート状態が正しく更新されたか確認

    };

    // productCategoriesの変化を監視
    useEffect(() => {
      console.log('[PRODUCT-CATEGORIES-CHANGE] productCategories変更検知', {
        timestamp: new Date().toISOString(),
        hasProductCategories: !!productCategories,
        productCategoriesSize: productCategories ? Object.keys(productCategories).length : 0,
        loadingState: loadingProductCategories,
        renderCount: renderCountRef.current
      });
    }, [productCategories, loadingProductCategories]);

    console.log('製品名とカテゴリーのマッピング比較:', {
      availableProducts: data.map(item => item.product).filter(Boolean),
      availableCategories: productCategories ? Object.keys(productCategories) : []
    });

    console.log('データサンプル詳細確認:', {
      firstRow: data.length > 0 ? data[0] : null,
      allKeys: data.length > 0 ? Object.keys(data[0]) : [],
    });

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 最新動画一覧のタイトルのみ表示 */}
        <div className="flex items-center justify-between p-3">
          <h2 className="text-xl font-bold text-gray-800">最新動画一覧</h2>
          
          {/* 表示設定ボタンをヘッダー右上に移動 */}
          <button
            ref={columnSettingsButtonRef}
            onClick={() => setIsColumnSettingsOpen(true)}
            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55] transition-colors duration-200"
          >
            <SettingsIcon size={16} />
            <span className="ml-1">表示設定</span>
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
            
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPrOnly}
                onChange={(e) => onPrOnlyChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[#FE2C55] peer-focus:ring-2 peer-focus:ring-[#FE2C55]/30 transition-colors">
                <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-all duration-300 peer-checked:translate-x-5"></div>
              </div>
              <span className="ml-2 text-sm font-medium text-black">#PR動画のみ</span>
            </label>
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
        
        {/* フィルターポップアップを追加 */}
        <FilterPopup 
          isOpen={isFilterPopupOpen}
          onClose={() => setFilterPopupOpenState(false)}
          anchorRef={filterButtonRef}
          onFilterChange={handleDebugBulkFilterChange}
          currentFilters={columnFilters}
          categories={categoryList}
          accounts={accountList}
          hashtags={hashtagList}
          products={[]}
          isLoading={isLoadingFilterOptions}
          onClearAll={handleClearFilterInputs}
        />
        
        {/* カラム設定ポップアップを追加 */}
        <ColumnSettings
          isOpen={isColumnSettingsOpen}
          onClose={() => setIsColumnSettingsOpen(false)}
          anchorRef={columnSettingsButtonRef}
          columns={columns}
          visibleColumns={visibleColumns}
          onColumnVisibilityChange={handleColumnVisibilityChange}
        />
        
        
        <div className="relative">
          <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
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
                {/* プロバイダーの値をより詳細にログ出力 */}
                {(() => {
                  console.log('[CONTEXT-PROVIDER] TableContext.Provider値設定', {
                    timestamp: new Date().toISOString(),
                    hasProductCategories: !!productCategories,
                    productCategoriesSize: productCategories ? Object.keys(productCategories).length : 0,
                    productCategoriesKeys: productCategories ? Object.keys(productCategories).slice(0, 5) : [], // 最初の5つだけ表示
                    renderCount: renderCountRef.current
                  });
                  return null;
                })()}
                <table className="min-w-full divide-y divide-gray-200">
                  <DndContextProvider>
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <SortableContextProvider>
                          {filteredColumns.map((column, index) => {
                            // 再生数カラムの場合、特別に詳細なログを出力
                            if (column.accessorKey === 'views') {
                            }
                            
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
                                    column.accessorKey === 'product' ? '120px' :
                                    column.accessorKey === 'account_type' ? '120px' :
                                    column.accessorKey === 'hashtags' ? '120px' :
                                    column.accessorKey === 'ten_days_increase' ? '120px' :
                                    column.accessorKey === 'likes_count_increase' ? '120px' :
                                    column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                    column.accessorKey === 'comment_count_increase' ? '120px' :
                                    column.accessorKey === 'ten_days_comment_increase' ? '140px' :
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
                                       column.accessorKey === 'product' ? '120px' :
                                       column.accessorKey === 'account_type' ? '120px' :
                                       column.accessorKey === 'hashtags' ? '120px' :
                                       column.accessorKey === 'ten_days_increase' ? '120px' :
                                       column.accessorKey === 'likes_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                       column.accessorKey === 'comment_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_comment_increase' ? '140px' :
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
                                       column.accessorKey === 'product' ? '120px' :
                                       column.accessorKey === 'account_type' ? '120px' :
                                       column.accessorKey === 'hashtags' ? '120px' :
                                       column.accessorKey === 'ten_days_increase' ? '120px' :
                                       column.accessorKey === 'likes_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_likes_increase' ? '140px' :
                                       column.accessorKey === 'comment_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_comment_increase' ? '140px' :
                                       column.accessorKey === 'save_count' ? '100px' :
                                       column.accessorKey === 'save_count_increase' ? '120px' :
                                       column.accessorKey === 'ten_days_save_increase' ? '140px' : undefined,
                              overflow: 'hidden'
                            }}
                          >
                            {column.cell 
                              ? column.cell({ row }) 
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
              </TableContext.Provider>
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
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';