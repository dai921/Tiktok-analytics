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
// 蠕ｪ迺ｰ蜿ら・繧帝∩縺代ｋ縺溘ａ縺ｫ./constants縺九ｉ繧､繝ｳ繝昴・繝医＠縺ｦ縺・◆繧ゅ・繧剃ｸ驛ｨ遘ｻ蜍・
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
import { getDbData, getAffiliateData, getCorporateData, getInfluencerData } from '@/lib/api';
import { recordCsvExportLog } from '@/lib/api/csv-export-logs';
const MAX_EXPORT_RANGE = 100;

// EXCLUDED_COLUMNS をここで定義
const EXCLUDED_COLUMNS = ['description'];

// ダッシュボード表示名に合わせたCSVヘッダー
const COLUMN_LABELS: Record<string, string> = {
  url: 'URL',
  thumbnail_url: '\u30b5\u30e0\u30cd\u30a4\u30eb',
  account_type: '\u30a2\u30ab\u30a6\u30f3\u30c8\u30b8\u30e3\u30f3\u30eb',
  second_account_type: '\u76ee\u7684',
  third_account_type: '\u30b5\u30d6\u30ab\u30c6\u30b4\u30ea',
  category: 'PR\u30ab\u30c6\u30b4\u30ea',
  product: '\u5546\u54c1',
  createdAt: '\u6295\u7a3f\u65e5',
  views: '\u518d\u751f\u6570',
  viewsIncrease: '2\u65e5\u518d\u751f\u5897\u52a0',
  ten_days_increase: '10\u65e5\u518d\u751f\u5897\u52a0',
  likes: '\u3044\u3044\u306d\u6570',
  likes_count_increase: '2\u65e5\u3044\u3044\u306d\u5897\u52a0',
  ten_days_likes_increase: '10\u65e5\u3044\u3044\u306d\u5897\u52a0',
  comments: '\u30b3\u30e1\u30f3\u30c8\u6570',
  comment_count_increase: '2\u65e5\u30b3\u30e1\u30f3\u30c8\u5897\u52a0',
  ten_days_comment_increase: '10\u65e5\u30b3\u30e1\u30f3\u30c8\u5897\u52a0',
  play_count_per_follower: '\u518d\u751f/\u30d5\u30a9\u30ed\u30ef\u30fc',
  play_increase_per_follower: '\u518d\u751f\u5897/\u30d5\u30a9\u30ed\u30ef\u30fc',
  save_count: '\u4fdd\u5b58\u6570',
  save_count_increase: '2\u65e5\u4fdd\u5b58\u5897\u52a0',
  ten_days_save_increase: '10\u65e5\u4fdd\u5b58\u5897\u52a0',
  account_name: '\u30a2\u30ab\u30a6\u30f3\u30c8\u540d',
  hashtags: '\u30cf\u30c3\u30b7\u30e5\u30bf\u30b0',
  audioTitle: 'BGM',
  content_type: '\u30b3\u30f3\u30c6\u30f3\u30c4\u30bf\u30a4\u30d7',
  followers: '\u30d5\u30a9\u30ed\u30ef\u30fc\u6570'
};


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
  isAdmin?: boolean;
  
  // 笘・菫ｮ豁｣: 蝙九・荳雋ｫ諤ｧ繧剃ｿ昴▽
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

  // 笘・霑ｽ蜉: 陦ｨ遉ｺ險ｭ螳壹Γ繝九Η繝ｼ逕ｨ・井ｻｻ諢擾ｼ・
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
    onFilterOptionsUpdate, // 笘・霑ｽ蜉
    filterOptions = {      // 笘・霑ｽ蜉: 繝・ヵ繧ｩ繝ｫ繝亥､繧定ｨｭ螳・      categories: [],
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
    showSearchInput = true,
    isAdmin = false
  }, ref) => {
    // 驕ｸ謚槭＆繧後◆繝・く繧ｹ繝茨ｼ医・繝・・繧｢繝・・陦ｨ遉ｺ逕ｨ・・
    const [selectedText, setSelectedText] = useState<{ title: string; content: string } | null>(null);
    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);
    const [exportColumnMode, setExportColumnMode] = useState<'visible' | 'all'>('visible');
    const [exportPageStartInput, setExportPageStartInput] = useState('');
    const [exportPageEndInput, setExportPageEndInput] = useState('');
    const [exportError, setExportError] = useState('');
    
    // 繧ｽ繝ｼ繝医Ο繧ｸ繝・け
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
    
    // 繝輔ぅ繝ｫ繧ｿ繝ｼ繝ｭ繧ｸ繝・け - 螟夜Κ繝輔ぅ繝ｫ繧ｿ繝ｼ繧呈ｸ｡縺・
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
      currentTabFilters // 竊・螟夜Κ繝輔ぅ繝ｫ繧ｿ繝ｼ迥ｶ諷九ｒ貂｡縺・
    );
    
    const { 
      columnFilters, 
      currentFilters, 
      hasActiveFilters,
      // isPrOnly: internalIsPrOnly, // 蜑企勁
      // isCorporateOnly: internalIsCorporateOnly // 蜑企勁
    } = filterState;
    
    const { 
      handleFilter, 
      handleBulkFilterChange, 
      handleClearAllFilters, 
      handleClearFilterInputs,
      setIsFilterPopupOpen,
      // handlePrOnlyChange, // 蜑企勁
      // handleCorporateOnlyChange // 蜑企勁
    } = filterHandlers;

    // 螟夜Κ迥ｶ諷九→蜀・Κ迥ｶ諷九・蜷梧悄 - 蜑企勁
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
    
    // 繝輔ぅ繝ｫ繧ｿ繝ｼ繝昴ャ繝励い繝・・縺ｮ迥ｶ諷・
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
    
    // 繧ｫ繧ｹ繧ｿ繝繝輔ャ繧ｯ縺九ｉ繝輔ぅ繝ｫ繧ｿ繝ｼ繧ｪ繝励す繝ｧ繝ｳ繧貞叙蠕・
    // 笘・菫ｮ豁｣: onFilterOptionsUpdate繧呈ｸ｡縺・
    const { 
      categoryList, 
      productList, 
      productCategories, 
      productCategoryMap, 
      isLoadingFilterOptions, 
      getFilteredOptions
    } = useFilterOptions(currentFilters, onFilterOptionsUpdate);


    // 繧ｫ繝ｩ繝螳夂ｾｩ繧貞叙蠕・
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
        createProductCellRenderer() // 逶ｴ謗･蜻ｼ縺ｳ蜃ｺ縺・
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
    
    // 繧ｫ繝ｩ繝縺ｮ繝峨Λ繝・げ・・ラ繝ｭ繝・・讖溯・
    const {
      orderedColumns,
      setOrderedColumns,
      DndContextProvider,
      SortableContextProvider
    } = useColumnDnd(columns);
    
    // 蛻晄悄蛹匁凾縺ｫ繧ｫ繝ｩ繝縺ｮ鬆・ｺ上ｒ險ｭ螳・
    const isInitialRenderRef = useRef(true);
    useEffect(() => {
      if (isInitialRenderRef.current) {
        setOrderedColumns(columns);
        isInitialRenderRef.current = false;
      }
    }, [columns, setOrderedColumns]);
    
    // 繧ｫ繝ｩ繝陦ｨ遉ｺ險ｭ螳・
    const {
      isColumnSettingsOpen,
      setIsColumnSettingsOpen,
      visibleColumns,
      columnSettingsButtonRef,
      handleColumnVisibilityChange
    } = useColumnVisibility(defaultVisibleColumns, onColumnSettingsChange);

    const formatDateForCsv = useCallback((value: string): string => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }, []);

    const normalizeCellValue = useCallback((columnKey: string, row: VideoData): string => {
      if (columnKey === 'url') {
        return row.url || '';
      }

      const raw = (row as Record<string, unknown>)[columnKey];
      if (raw === undefined || raw === null) return '';

      if (columnKey === 'createdAt') {
        return formatDateForCsv(String(raw));
      }

      if (Array.isArray(raw)) {
        return raw.join(' ');
      }

      if (typeof raw === 'object') {
        if ('url' in (raw as Record<string, unknown>) && typeof (raw as Record<string, unknown>).url === 'string') {
          return (raw as Record<string, string>).url || '';
        }
        return JSON.stringify(raw);
      }

      return String(raw);
    }, [formatDateForCsv]);

    const escapeForCsv = useCallback((value: string): string => {
      const sanitized = value.replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
      return `"${sanitized}"`;
    }, []);

    const buildExportColumns = useCallback(() => {
      const baseColumns =
        exportColumnMode === 'all'
          ? orderedColumns.map((col) => String(col.accessorKey))
          : visibleColumns;

      const replaced = baseColumns
        .map((col) => (col === 'thumbnail_url' ? 'url' : col))
        .filter((col) => col !== 'thumbnail_url' && !EXCLUDED_COLUMNS.includes(col));

      const unique = Array.from(new Set(replaced));
      if (!unique.includes('url')) {
        unique.unshift('url');
      }
      return unique;
    }, [exportColumnMode, orderedColumns, visibleColumns]);

    const fetchPageData = useCallback(
      async (page: number): Promise<VideoData[]> => {
        const filtersToUse = currentFilters || {};
        const size = pageSize || 50;
        try {
          let response;
          if (isPrOnly) {
            response = await getAffiliateData(page, filtersToUse, size);
          } else if (isCorporateOnly) {
            response = await getCorporateData(page, filtersToUse, size);
          } else if (isInfluencerOnly) {
            response = await getInfluencerData(page, filtersToUse, size);
          } else {
            response = await getDbData(page, filtersToUse, size);
          }

          if (response?.success && Array.isArray(response.data)) {
            return response.data as VideoData[];
          }
        } catch (error) {
          console.warn('CSV export fetch failed:', error);
        }
        return [];
      },
      [currentFilters, isCorporateOnly, isInfluencerOnly, isPrOnly, pageSize]
    );

    const handleExportCsv = useCallback(async () => {
      if (!data || data.length === 0 || isExporting) return;

      setIsExportOptionsOpen(false);
      setIsExporting(true);
      try {
        setExportError('');
        const total = totalPages || 1;
        const startStr = exportPageStartInput.trim();
        const endStr = exportPageEndInput.trim();

        if (!startStr) {
          setExportError('開始ページを入力してください。');
          return;
        }
        if (!endStr) {
          setExportError('終了ページを入力してください。');
          return;
        }

        const start = Number(startStr);
        const end = Number(endStr);

        if (Number.isNaN(start) || Number.isNaN(end)) {
          setExportError('ページ番号は数字で入力してください。');
          return;
        }
        if (start < 1 || start > total) {
          setExportError(`開始ページは1〜${total}で入力してください。`);
          return;
        }
        if (end < start) {
          setExportError('終了ページは開始ページ以上にしてください。');
          return;
        }
        if (end > total) {
          setExportError(`終了ページは1〜${total}で入力してください。`);
          return;
        }
        if (end - start + 1 > MAX_EXPORT_RANGE) {
          setExportError(`一度に出力できるのは最大${MAX_EXPORT_RANGE}ページまでです。`);
          return;
        }

        const exportColumns = buildExportColumns();
        const rows: VideoData[] = [];

        for (let page = start; page <= end; page += 1) {
          if (page === currentPage) {
            rows.push(...data);
          } else {
            const pageData = await fetchPageData(page);
            rows.push(...pageData);
          }
        }

        const headerRow = exportColumns
          .map((key) => COLUMN_LABELS[key] || key)
          .map(escapeForCsv)
          .join(',');

        const bodyRows = rows.map((row) =>
          exportColumns
            .map((key) => normalizeCellValue(key, row))
            .map(escapeForCsv)
            .join(',')
        );

        const csvContent = ['\ufeff' + headerRow, ...bodyRows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
        anchor.href = url;
        anchor.download = `dashboard-export-${timestamp}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);

        // CSV出力ログを記録
        recordCsvExportLog({
          export_source: 'dashboard',
          tab_type: isPrOnly ? 'affiliate' : isCorporateOnly ? 'corporate' : isInfluencerOnly ? 'influencer' : 'all',
          export_params: {
            page_start: start,
            page_end: end,
            page_size: pageSize,
            filters: currentFilters,
            visible_columns: visibleColumns,
          },
          export_status: 'success',
          row_count: rows.length,
          file_size_bytes: blob.size,
        });
      } catch (error) {
        // CSV出力失敗ログを記録
        recordCsvExportLog({
          export_source: 'dashboard',
          tab_type: isPrOnly ? 'affiliate' : isCorporateOnly ? 'corporate' : isInfluencerOnly ? 'influencer' : 'all',
          export_params: {
            page_start: Number(exportPageStartInput),
            page_end: Number(exportPageEndInput),
            page_size: pageSize,
          },
          export_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      } finally {
        setIsExporting(false);
      }
    }, [
      data,
      isExporting,
      exportPageStartInput,
      exportPageEndInput,
      totalPages,
      currentPage,
      buildExportColumns,
      escapeForCsv,
      normalizeCellValue,
      fetchPageData,
      isPrOnly,
      isCorporateOnly,
      isInfluencerOnly,
      pageSize,
      currentFilters,
      visibleColumns
    ]);

    // 蜿ら・繧定ｨｭ螳・
    useImperativeHandle(ref, () => ({
      clearAllFilters
    }));
    
    // 繝壹・繧ｸ蛻・ｊ譖ｿ縺医ワ繝ｳ繝峨Λ繝ｼ
    const handlePageChange = (page: number) => {
      onPageChange(page);
    };
    
    // 陦ｨ遉ｺ莉ｶ謨ｰ螟画峩縺ｮ繝上Φ繝峨Λ繝ｼ
    const handlePageSizeChange = (size: number) => {
      if (onPageSizeChange) {
        onPageSizeChange(size);
      }
    };


    // filteredColumns 縺ｮ螳夂ｾｩ縺ｧ columns 繧堤峩謗･菴ｿ逕ｨ
    const filteredColumns = useMemo(() => {
      return orderedColumns.filter(col => 
        !EXCLUDED_COLUMNS.includes(String(col.accessorKey)) &&
        visibleColumns.includes(String(col.accessorKey))
      );
    }, [orderedColumns, visibleColumns]); // columnsWithProductRenderer繧剃ｾ晏ｭ倬・蛻励°繧牙炎髯､
  

    // 縺吶∋縺ｦ縺ｮ蜍慕判繧ｿ繝悶・繝上Φ繝峨Λ繝ｼ
    const handleAllVideosToggle = useCallback(() => {
      console.log('縺吶∋縺ｦ縺ｮ蜍慕判繧ｿ繝悶け繝ｪ繝・け');
      onPrOnlyChange(false);
      onCorporateOnlyChange(false);
      onInfluencerOnlyChange(false);
    }, [onPrOnlyChange, onCorporateOnlyChange, onInfluencerOnlyChange]);

    // 繝輔ぅ繝ｫ繧ｿ繝ｼ繝昴ャ繝励い繝・・縺ｫ貂｡縺兮ccountTypeContext繧貞虚逧・↓逕滓・
    const getAccountTypeContext = (): 'influencer' | 'corporate' | 'affiliate' | 'all' => {
      if (isCorporateOnly) return 'corporate';
      if (isInfluencerOnly) return 'influencer';
      if (isPrOnly) return 'affiliate';
      return 'all';
    };

    // 陦ｨ遉ｺ險ｭ螳夂畑: 迴ｾ蝨ｨ縺ｮ繧ｿ繝悶ち繧､繝励→蜿ｯ隕悶き繝ｩ繝謫堺ｽ・
    const tabTypeForPreset = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly) as PresetTabType;
    const getFiltersForPreset = useCallback(() => currentFilters, [currentFilters]);
    const getVisibleColumnsForPreset = useCallback(() => visibleColumns, [visibleColumns]);
    const applyVisibleColumnsForPreset = useCallback((cols: string[]) => {
      // newColumns 邨檎罰縺ｧ荳諡ｬ驕ｩ逕ｨ
      handleColumnVisibilityChange('', false, cols);
    }, [handleColumnVisibilityChange]);

    // 繝励Μ繧ｻ繝・ヨ驕ｩ逕ｨ譎ゅ↓繧ｿ繝也憾諷九ｒ蛻・ｊ譖ｿ縺医ｋ
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
        {/* 譛譁ｰ蜍慕判荳隕ｧ縺ｮ繧ｿ繧､繝医Ν縺ｮ縺ｿ陦ｨ遉ｺ */}
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
          
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => {
                setExportError('');
                setIsExportOptionsOpen((prev) => !prev);
              }}
              disabled={isExporting || !data || data.length === 0}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isExporting || !data || data.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-[#FE2C55] text-white hover:bg-[#e6264c] focus:ring-[#FE2C55]'
              }`}
            >
              {isExporting ? 'CSV出力中...' : 'CSV出力'}
            </button>

            {isExportOptionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg p-3 z-30">
                <div className="space-y-3 text-sm text-gray-800">
                  <div>
                    <p className="font-semibold">カラム</p>
                    <div className="mt-1 space-y-1">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          checked={exportColumnMode === 'visible'}
                          onChange={() => setExportColumnMode('visible')}
                        />
                        <span>表示中のみ</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          checked={exportColumnMode === 'all'}
                          onChange={() => setExportColumnMode('all')}
                        />
                        <span>すべての列を含む</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold">ページ範囲（最大{MAX_EXPORT_RANGE}ページ）</p>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <input
                        type="number"
                        min={1}
                        max={totalPages || 1}
                        value={exportPageStartInput}
                        onChange={(e) => {
                          setExportPageStartInput(e.target.value);
                        }}
                        className="w-16 rounded border border-gray-300 px-2 py-1"
                      />
                      <span>〜</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages || 1}
                        value={exportPageEndInput}
                        onChange={(e) => {
                          setExportPageEndInput(e.target.value);
                        }}
                        className="w-16 rounded border border-gray-300 px-2 py-1"
                      />
                      <span className="text-[11px] text-gray-500">全{totalPages || 1}ページ</span>
                    </div>
                    {exportError && (
                      <p className="mt-1 text-xs text-red-600">{exportError}</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExportError('');
                        setIsExportOptionsOpen(false);
                        setExportPageStartInput('');
                        setExportPageEndInput('');
                      }}
                      className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={isExporting}
                      className={`rounded px-3 py-1 text-xs font-semibold text-white ${
                        isExporting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#FE2C55] hover:bg-[#e6264c]'
                      }`}
                    >
                      出力開始
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              ref={columnSettingsButtonRef}
              onClick={() => setIsColumnSettingsOpen(true)}
              className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE2C55] transition-colors duration-200"
            >
              <SettingsIcon size={16} />
              <span className="ml-1">表示設定</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 p-2">
          <div className="flex min-w-[260px] flex-1 flex-col gap-3">
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
              
              {/* Video type tabs */}
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
                    console.log("\u30a2\u30d5\u30a3\u30ea\u30a8\u30a4\u30c8\u7cfb\u52d5\u753b\u30bf\u30d6\u30af\u30ea\u30c3\u30af");
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
                    console.log("\u4f01\u696d\u7cfb\u52d5\u753b\u30bf\u30d6\u30af\u30ea\u30c3\u30af");
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
                    console.log("\u30a4\u30f3\u30d5\u30eb\u30a8\u30f3\u30b5\u30fc\u7cfb\u52d5\u753b\u30bf\u30d6\u30af\u30ea\u30c3\u30af");
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
        
        {/* 繝・・繝悶Ν縺ｮ蜀・ｮｹ */}
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

        {/* Portal繧剃ｽｿ逕ｨ縺励※DOM髫主ｱ､縺ｮ荳贋ｽ阪↓陦ｨ遉ｺ */}
        {typeof window !== 'undefined' && createPortal(
          <FilterPopup
            isOpen={isFilterPopupOpen}
            onClose={closeFilterPopup}
            anchorRef={filterButtonRef}
            onFilterChange={handleBulkFilterChange}
            currentFilters={columnFilters}
            categories={categoryList}
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
