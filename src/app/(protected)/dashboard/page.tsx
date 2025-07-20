'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { DataTable } from '@/components/dashboard/data-table/Datatable'
import { getDbData, getAffiliateData, getCorporateData, getInfluencerData, COLUMN_MAP } from '@/lib/api'
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard'
import { displaySettingsApi } from '@/lib/display_settings_api'
import { toast } from "@/hooks/use-toast"
import { TAB_DEFAULT_COLUMNS, TAB_FILTER_FIELDS, getCurrentTabType, getTabFilterFields } from '@/components/dashboard/data-table/tab-columns'

const headers = [
  { key: 'createdAt', title: '作成日時', type: 'date' as const },
  { key: 'views', title: '再生数', type: 'number' as const },
  { key: 'viewsIncrease', title: '再生増加数', type: 'number' as const },
  { key: 'ten_days_increase', title: '10日間再生増加数', type: 'number' as const },
  { key: 'category', title: 'ジャンル' },
  { key: 'product', title: '商材' },
  { key: 'account_name', title: 'アカウント名' },
  { key: 'account_type', title: 'アカウントジャンル' },
  { key: 'description', title: '説明' },
  { key: 'hashtags', title: 'ハッシュタグ' },
  { key: 'likes', title: 'いいね数', type: 'number' as const },
  { key: 'likes_count_increase', title: 'いいね増加数', type: 'number' as const },
  { key: 'ten_days_likes_increase', title: '10日間いいね増加数', type: 'number' as const },
  { key: 'comments', title: 'コメント数', type: 'number' as const },
  { key: 'comment_count_increase', title: 'コメント増加数', type: 'number' as const },
  { key: 'ten_days_comment_increase', title: '10日間コメント増加数', type: 'number' as const },
  { key: 'shares', title: '共有数', type: 'number' as const },
  { key: 'saves', title: '保存数', type: 'number' as const },
  { key: 'duration', title: '動画時間(秒)', type: 'number' as const },
  { key: 'audioTitle', title: '音声タイトル' },
  { key: 'artist', title: 'アーティスト' }
] as const

const Dashboard = () => {
  const CACHE_DURATION = 5 * 60 * 1000;
  
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<VideoData[]>([])
  const tableRef = useRef<{ clearAllFilters: () => void } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [filters, setFilters] = useState<Record<string, FilterQuery>>({})
  const [isPrOnly, setIsPrOnly] = useState(false)
  const [isCorporateOnly, setIsCorporateOnly] = useState(false)
  const [isInfluencerOnly, setIsInfluencerOnly] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)

  // ★ prefetch状態を先に定義
  const [prefetchCompleted, setPrefetchCompleted] = useState(false);

  // タブごとの独立したフィルター状態
  const [filtersByTab, setFiltersByTab] = useState<Record<string, Record<string, FilterQuery>>>({
    all: {},
    corporate: {},
    influencer: {},
    affiliate: {}
  });

  // タブごとのデータキャッシュ
  const [dataByTab, setDataByTab] = useState<Record<string, Record<string, {
    data: VideoData[];
    currentPage: number;
    totalPages: number;
    lastFetchTime: number;
    filters: Record<string, FilterQuery>;
  }>>>({
    all: {},
    corporate: {},
    influencer: {},
    affiliate: {}
  });

  // 基本関数群
  const getCurrentTabKey = () => {
    if (isCorporateOnly) return 'corporate';
    if (isInfluencerOnly) return 'influencer';
    if (isPrOnly) return 'affiliate';
    return 'all';
  };

  const getCurrentFilters = () => {
    const baseFilters = isCorporateOnly ? filtersByTab.corporate :
                       isInfluencerOnly ? filtersByTab.influencer :
                       isPrOnly ? filtersByTab.affiliate :
                       filtersByTab.all;
    
    // 深いコピーを作成して参照共有を防ぐ
    return JSON.parse(JSON.stringify(baseFilters));
  };

  const generateFilterHash = (filters: Record<string, FilterQuery>) => {
    if (Object.keys(filters).length === 0) return 'default';
    
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {} as Record<string, FilterQuery>);
    
    const jsonString = JSON.stringify(sortedFilters);
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'f' + Math.abs(hash).toString(16);
  };

  const isCacheValidWithFilters = (
    tabKey: string, 
    filterHash: string, 
    targetFilters: Record<string, FilterQuery>
  ) => {
    const cache = dataByTab[tabKey]?.[filterHash];
    if (!cache) return false;

    const now = Date.now();
    const isExpired = now - cache.lastFetchTime > CACHE_DURATION;
    const filtersChanged = JSON.stringify(cache.filters) !== JSON.stringify(targetFilters);
    
    return !isExpired && !filtersChanged && cache.data.length > 0;
  };

  const convertFilterValueToQuery = (filterValue: FilterValue): FilterQuery => {
    return {
      field: filterValue.field,
      type: filterValue.type,
      value: filterValue.value,
      active: filterValue.active || true,
      ...(filterValue.comparison && { comparison: filterValue.comparison }),
      ...(filterValue.isPrimarySort !== undefined && { isPrimarySort: filterValue.isPrimarySort }),
      ...(filterValue.sortField && { sortField: filterValue.sortField }),
      ...(filterValue.isHashtag && { isHashtag: filterValue.isHashtag }),
      ...(filterValue.timestamp !== undefined && { timestamp: filterValue.timestamp })
    };
  };

  // ★ fetchData関数を定義
  const fetchData = useCallback(async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(currentFilters || {});
    
    console.log('[DEBUG] fetchData開始:', { 
      page, 
      tabKey,
      filterHash,
      filtersCount: Object.keys(currentFilters || {}).length,
      filters: currentFilters
    });
    
    setIsLoading(true);
    try {
      let response;
      if (isPrOnly) {
        response = await getAffiliateData(page, currentFilters, pageSize);
      } else if (isCorporateOnly) {
        response = await getCorporateData(page, currentFilters, pageSize);
      } else if (isInfluencerOnly) {
        response = await getInfluencerData(page, currentFilters, pageSize);
      } else {
        response = await getDbData(page, currentFilters, pageSize);
      }
      
      console.log('[DEBUG] API応答:', response);
      
      if (response && response.success && Array.isArray(response.data)) {
        const newData = response.data;
        const newCurrentPage = response.currentPage || page;
        const newTotalPages = response.totalPages || 1;

        console.log('[DEBUG] UIを更新:', {
          dataCount: newData.length,
          page: newCurrentPage,
          totalPages: newTotalPages
        });

        setData(newData);
        setCurrentPage(newCurrentPage);
        setTotalPages(newTotalPages);

        setDataByTab(prev => ({
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            [`${filterHash}_page${newCurrentPage}`]: { // ★ ページ番号を含むキー
              data: newData,
              currentPage: newCurrentPage,
              totalPages: newTotalPages,
              lastFetchTime: Date.now(),
              filters: { ...currentFilters || {} }
            }
          }
        }));

        console.log('[DEBUG] キャッシュ更新完了');
      } else {
        console.log('[DEBUG] 無効な応答、データをクリア');
        setData([]);
      }
    } catch (error) {
      console.error('[DEBUG] データ取得エラー:', error);
      setData([]);
    } finally {
      setIsLoading(false);
      console.log('[DEBUG] fetchData完了');
    }
  }, [pageSize, isPrOnly, isCorporateOnly, isInfluencerOnly]);

  // ★ タブ切り替え専用のuseEffect
  useEffect(() => {
    const tabKey = getCurrentTabKey();
    const currentTabFilters = getCurrentFilters();
    
    console.log('[DEBUG] ★★★ タブ切り替え詳細 ★★★:', {
      currentTab: tabKey,
      filtersByTabState: filtersByTab,
      corporateFilters: filtersByTab.corporate,
      allFilters: filtersByTab.all,
      affiliateFilters: filtersByTab.affiliate,
      influencerFilters: filtersByTab.influencer,
      currentTabFilters: currentTabFilters,
      oldFilters: filters,
      areCurrentTabFiltersEmpty: Object.keys(currentTabFilters).length === 0,
      areAllAndCorporateSameRef: filtersByTab.all === filtersByTab.corporate,
      // ★ 詳細な中身を確認
      corporateFiltersDetail: JSON.stringify(filtersByTab.corporate),
      allFiltersDetail: JSON.stringify(filtersByTab.all),
      currentTabFiltersDetail: JSON.stringify(currentTabFilters)
    });

    // フィルター状態を復元（データ復元はしない）
    setFilters(currentTabFilters);
    setCurrentPage(1); // ページもリセット
  }, [isCorporateOnly, isInfluencerOnly, isPrOnly]);

  // ★ フィルタ変更専用のuseEffect（修正版）
  useEffect(() => {
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(filters);

    console.log('[DEBUG] フィルタ変更検知:', {
      tabKey,
      filterHash,
      filters: filters,
      filtersCount: Object.keys(filters).length,
      currentPage
    });

    // ★ ページ番号を含むキャッシュキーを生成
    const cacheKey = `${filterHash}_page${currentPage}`;
    
    // ★ ページ固有のキャッシュをチェック
    if (dataByTab[tabKey]?.[cacheKey]) {
      const cache = dataByTab[tabKey][cacheKey];
      const now = Date.now();
      const isExpired = now - cache.lastFetchTime > CACHE_DURATION;
      
      if (!isExpired) {
        console.log('[DEBUG] ページ固有キャッシュからデータを復元:', cache);
        setData(cache.data);
        setTotalPages(cache.totalPages);
        setIsLoading(false);
        return; // ★ currentPageは更新しない
      }
    }

    // APIコール（現在のページ番号を使用）
    console.log('[DEBUG] 新しいデータを取得');
    if (Object.keys(filters).length === 0) {
      fetchData(currentPage, {});
    } else {
      const timer = setTimeout(() => {
        fetchData(currentPage, filters);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filters, currentPage]);

  // ★ updateTabFiltersを先に定義
  const updateTabFilters = useCallback((newFilters: Record<string, FilterQuery>, targetTabKey?: string) => {
    const currentTab = targetTabKey || getCurrentTabKey();
    
    console.log('[DEBUG] updateTabFilters:', {
      currentTab,
      targetTabKey,
      newFilters: JSON.stringify(newFilters),
      beforeUpdate: JSON.stringify(filtersByTab[currentTab])
    });
    
    setFiltersByTab(prev => {
      const updated = { ...prev };
      // 深いコピーを作成して状態汚染を防ぐ
      updated[currentTab] = JSON.parse(JSON.stringify(newFilters));
      
      console.log('[DEBUG] filtersByTab更新後:', {
        currentTab,
        updatedFilters: JSON.stringify(updated[currentTab]),
        allFilters: JSON.stringify(updated.all),
        corporateFilters: JSON.stringify(updated.corporate)
      });
      
      return updated;
    });
  }, []);

  // ハンドラー関数群
  const handleFilter = useCallback((newFilter: FilterValue) => {
    if (newFilter.type === 'clear') {
      if (newFilter.field === 'reset') {
        updateTabFilters({});
        setFilters({});
        setCurrentPage(1);
        return;
      }
      
      if (newFilter.field && filters[newFilter.field]) {
        const updatedFilters = { ...filters };
        delete updatedFilters[newFilter.field];
        
        updateTabFilters(updatedFilters);
        setFilters(JSON.parse(JSON.stringify(updatedFilters)));
        return;
      }
      return;
    }
    
    let field = '';
    if (typeof newFilter.field === 'string' && newFilter.field) {
      const mappedField = Object.entries(COLUMN_MAP).find(([_, value]) => value === newFilter.field)?.[0];
      field = mappedField || newFilter.field;
    }
    
    if (newFilter.field === 'ハッシュタグ') {
      field = 'hashtags';
    }

    const filterQuery: FilterQuery = convertFilterValueToQuery({
      ...newFilter,
      field: field
    });
    
    let updatedFilters: Record<string, FilterQuery>;
    
    if (newFilter.type === 'sort') {
      updatedFilters = {
        ...filters,
        [`${field}_sort`]: filterQuery,
        ...(filters[field] && { [field]: filters[field] })
      };
    } else if (newFilter.type === 'multiselect') {
      updatedFilters = {
        ...filters,
        [field]: {
          ...filterQuery,
          comparison: 'contains'
        }
      };
    } else {
      updatedFilters = {
        ...filters,
        [field]: filterQuery
      };
    }
    
    updateTabFilters(updatedFilters);
    setFilters(JSON.parse(JSON.stringify(updatedFilters)));
  }, [filters, updateTabFilters]);
  
  const handleMultipleFilters = useCallback((incomingFilters: Record<string, FilterQuery>) => {
    console.log('[DEBUG] ========== handleMultipleFilters開始 ==========');
    console.log('[DEBUG] 受信したmultipleFilters:', incomingFilters);
    
    // ★ フィルター適用時点での正確なタブ状態を取得
    const currentTab = getCurrentTabKey();
    console.log('[DEBUG] フィルター適用時のタブ:', currentTab, {
      isPrOnly,
      isCorporateOnly, 
      isInfluencerOnly
    });
    
    // ★ リセット処理
    if (incomingFilters.reset && incomingFilters.reset.type === 'clear') {
      console.log('[DEBUG] multipleFilters: 全クリア');
      setFiltersByTab(prev => ({
        ...prev,
        [currentTab]: {}
      }));
      setFilters({});
      setCurrentPage(1);
      return;
    }

    // ★ ソートクリア処理
    if (incomingFilters['sort_clear'] || incomingFilters['sort_indicator']) {
      const newFilterSet: Record<string, FilterQuery> = {};
      const currentState = { ...incomingFilters };
      
      // ソート関連フィールドを削除
      Object.keys(currentState)
        .filter(key => key.endsWith('_sort'))
        .forEach(key => delete currentState[key]);
      
      delete currentState['sort_clear'];
      delete currentState['sort_indicator'];
      
      // 残りのフィルターを処理
      Object.entries(incomingFilters)
        .filter(([key]) => !key.startsWith('sort_') && key !== 'sort_clear' && key !== 'sort_indicator')
        .forEach(([key, value]) => {
          let field = key;
          if (typeof value.field === 'string' && value.field) {
            const mappedField = Object.entries(COLUMN_MAP).find(([_, v]) => v === value.field)?.[0];
            field = mappedField || value.field;
          }
          
          if (value.field === 'ハッシュタグ') {
            field = 'hashtags';
          }
          
          newFilterSet[field] = {
            field: field,
            type: value.type,
            value: value.value,
            active: true,
            ...(value.isHashtag && { isHashtag: true }),
            ...(value.comparison && { comparison: value.comparison })
          };
        });
      
      setFiltersByTab(prev => ({
        ...prev,
        [currentTab]: newFilterSet
      }));
      
      setFilters(newFilterSet);
      setCurrentPage(1);
      return;
    }
    
    // ★ 通常のフィルター処理
    const newFilters: Record<string, FilterQuery> = {};
    
    Object.entries(incomingFilters).forEach(([key, filterValue]) => {
      // スキップするフィールド
      if (key === 'reset' || key === 'sort_clear' || key === 'sort_indicator') {
        return;
      }
      
      let field = key;
      if (typeof filterValue.field === 'string' && filterValue.field) {
        const mappedField = Object.entries(COLUMN_MAP).find(([_, v]) => v === filterValue.field)?.[0];
        field = mappedField || filterValue.field;
      }
      
      if (filterValue.field === 'ハッシュタグ') {
        field = 'hashtags';
      }
      
      // フィルタークエリを構築
      if (field === 'content_type' && filterValue.type === 'multiselect') {
        newFilters['content_type'] = {
          field: 'content_type',
          type: 'multiselect',
          value: filterValue.value,
          comparison: 'contains',
          active: true,
          ...(filterValue.isHashtag && { isHashtag: true }),
          ...(filterValue.timestamp !== undefined && { timestamp: filterValue.timestamp }),
          ...(filterValue.isPrimarySort !== undefined && { isPrimarySort: filterValue.isPrimarySort }),
          ...(filterValue.sortField !== undefined && { sortField: filterValue.sortField })
        };
      } else if (field === 'category' && filterValue.type === 'multiselect') {
        newFilters['category'] = {
          field: 'category',
          type: 'multiselect',
          value: filterValue.value,
          comparison: 'contains',
          active: true,
        };
      } else if (filterValue.type === 'number') {
        newFilters[field] = {
          field: field,
          type: 'number',
          value: filterValue.value,
          comparison: filterValue.comparison || 'equal',
          active: true,
        };
      } else if (filterValue.type === 'sort') {
        newFilters[`${field}_sort`] = filterValue;
      } else if (filterValue.type !== 'indicator') {
        newFilters[field] = {
          field: field,
          type: filterValue.type,
          value: filterValue.value,
          active: true,
          ...(filterValue.isHashtag && { isHashtag: true }),
          ...(filterValue.timestamp !== undefined && { timestamp: filterValue.timestamp }),
          ...(filterValue.isPrimarySort !== undefined && { isPrimarySort: filterValue.isPrimarySort }),
          ...(filterValue.sortField !== undefined && { sortField: filterValue.sortField }),
          ...(filterValue.comparison !== undefined && { comparison: filterValue.comparison })
        };
      }
    });
    
    console.log('[DEBUG] 処理後のnewFilters:', newFilters);
    console.log('[DEBUG] 適用対象タブ:', currentTab);
    
    // ★ 修正: タブキーを明示的に渡す
    updateTabFilters(newFilters, currentTab);
    
    // ★ 修正: グローバルフィルターも深いコピーを使用
    setFilters(JSON.parse(JSON.stringify(newFilters)));
    setCurrentPage(1);
    console.log('[DEBUG] ========== handleMultipleFilters終了 ==========');
  }, [updateTabFilters, isPrOnly, isCorporateOnly, isInfluencerOnly]); // ★ 依存配列にタブ状態を追加

  const handleClearAllFilters = useCallback(() => {
    if (tableRef.current && tableRef.current.clearAllFilters) {
      tableRef.current.clearAllFilters();
    }
    
    setFiltersByTab({
      all: {},
      corporate: {},
      influencer: {},
      affiliate: {}
    });
    
    setPrefetchCompleted(false);
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setFilters({});
    setCurrentPage(1);
  }, []);

  const handleColumnSettingsChange = useCallback((columns: string[]) => {
    setVisibleColumns(columns);
  }, []);

  const handlePrOnlyChange = useCallback((checked: boolean) => {
    setIsPrOnly(checked);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setCurrentPage(1);
  }, []);

  const handleCorporateOnlyChange = useCallback((checked: boolean) => {
    setIsCorporateOnly(checked);
    setIsPrOnly(false);
    setIsInfluencerOnly(false);
    setCurrentPage(1);
  }, []);

  const handleInfluencerOnlyChange = useCallback((checked: boolean) => {
    setIsInfluencerOnly(checked);
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // 設定読み込み
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await displaySettingsApi.getSettings();
        
        if (response.success && response.settings && response.settings.columns && response.settings.columns.length > 0) {
          const visibleColumnNames = response.settings.columns
            .filter(col => col.is_visible)
            .map(col => col.column_name);
          
          if (visibleColumnNames.length === 0) {
            const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
            const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
            setVisibleColumns(defaultColumns);
          } else {
            setVisibleColumns(visibleColumnNames);
          }
        } else {
          const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
          const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
          setVisibleColumns(defaultColumns);
        }
        setIsSettingsLoaded(true);
      } catch (error) {
        console.error('設定読み込みエラー:', error);
        const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
        const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
        setVisibleColumns(defaultColumns);
        setIsSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // ★ prefetch機能
  useEffect(() => {
    if (prefetchCompleted || isLoading || data.length === 0) {
      return;
    }

    const currentTab = getCurrentTabKey();
    const currentFilterHash = generateFilterHash(filters);
    
    const prefetchOtherTabs = async () => {
      const tabsToFetch = [
        { key: 'all', fetcher: () => getDbData(1, {}, pageSize) },
        { key: 'affiliate', fetcher: () => getAffiliateData(1, {}, pageSize) },
        { key: 'corporate', fetcher: () => getCorporateData(1, {}, pageSize) },
        { key: 'influencer', fetcher: () => getInfluencerData(1, {}, pageSize) }
      ].filter(tab => tab.key !== currentTab);

      console.log(`[Prefetch] ${currentTab}(${currentFilterHash})表示完了、他のタブを事前取得開始`);

      for (const [index, tab] of tabsToFetch.entries()) {
        setTimeout(async () => {
          const defaultFilterHash = generateFilterHash({});
          
          if (isCacheValidWithFilters(tab.key, defaultFilterHash, {})) {
            console.log(`[Prefetch] ${tab.key}: デフォルト状態のキャッシュ有効のためスキップ`);
            return;
          }

          try {
            const response = await tab.fetcher();
            if (response?.success && Array.isArray(response.data)) {
              setDataByTab(prev => ({
                ...prev,
                [tab.key]: {
                  ...prev[tab.key],
                  [defaultFilterHash]: {
                    data: response.data,
                    currentPage: 1,
                    totalPages: response.totalPages || 1,
                    lastFetchTime: Date.now(),
                    filters: {}
                  }
                }
              }));
              console.log(`[Prefetch] ${tab.key}: 事前取得完了 (${response.data.length}件)`);
            }
          } catch (error) {
            console.warn(`[Prefetch] ${tab.key}: 取得失敗`, error);
          }
        }, index * 800);
      }
      
      setPrefetchCompleted(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(prefetchOtherTabs, { timeout: 3000 });
    } else {
      setTimeout(prefetchOtherTabs, 2000);
    }
  }, [isLoading, data.length, prefetchCompleted]);

  // 現在のタブフィルタ設定を取得
  const currentTabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
  const currentTabFilterFields = getTabFilterFields(currentTabType);

  if (!isSettingsLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main>
        <DataTable 
          ref={tableRef}
          data={data}
          defaultVisibleColumns={visibleColumns}
          onColumnSettingsChange={handleColumnSettingsChange}
          onFilterChange={(hasFilters, filter) => {
            if (filter) {
              if (filter.type === 'multiple' && filter.field === 'multipleFilters' && filter.filters) {
                handleMultipleFilters(filter.filters);
              } else {
                handleFilter(filter);
              }
            }
          }}
          onPageChange={(page) => setCurrentPage(page)}
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          isPrOnly={isPrOnly}
          onPrOnlyChange={handlePrOnlyChange}
          isCorporateOnly={isCorporateOnly}
          onCorporateOnlyChange={handleCorporateOnlyChange}
          isInfluencerOnly={isInfluencerOnly}
          onInfluencerOnlyChange={handleInfluencerOnlyChange}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          tabFilterFields={currentTabFilterFields}
        />
      </main>
    </div>
  )
}

export default Dashboard