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
  const CACHE_DURATION = 5 * 60 * 1000; // 先頭に配置
  
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

  // タブごとの独立したフィルター状態（型をFilterQueryに統一）
  const [filtersByTab, setFiltersByTab] = useState<Record<string, Record<string, FilterQuery>>>({
    all: {},
    corporate: {},
    influencer: {},
    affiliate: {}
  });

  // ★ タブごとのデータキャッシュを拡張（フィルタ状態ごとに保存）
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

  // ★ フィルタハッシュ生成関数を修正（日本語対応）
  const generateFilterHash = useCallback((filters: Record<string, FilterQuery>) => {
    // 空フィルタの場合は 'default'
    if (Object.keys(filters).length === 0) {
      return 'default';
    }
    
    // フィルタ内容をソートしてJSON化
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {} as Record<string, FilterQuery>);
    
    const jsonString = JSON.stringify(sortedFilters);
    
    // シンプルなハッシュ関数（日本語対応）
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    
    // 正の数にして16進数文字列に変換
    return 'f' + Math.abs(hash).toString(16);
  }, []);

  // ★ getCurrentCache関数をシンプルに修正
  const getCurrentCache = () => {
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(filters);
    return dataByTab[tabKey]?.[filterHash] || { 
      data: [], 
      currentPage: 1, 
      totalPages: 1, 
      lastFetchTime: 0, 
      filters: {} 
    };
  };

  // ★ フィルタ状態を含むキャッシュ有効性チェック（CACHE_DURATIONを使用）
  const isCacheValidWithFilters = useCallback((
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
  }, [dataByTab, CACHE_DURATION]);

  // 現在のタブに応じたフィルターを取得
  const getCurrentFilters = () => {
    if (isCorporateOnly) {
      return filtersByTab.corporate;
    } else if (isInfluencerOnly) {
      return filtersByTab.influencer;
    } else if (isPrOnly) {
      return filtersByTab.affiliate;
    } else {
      return filtersByTab.all;
    }
  };

  // 現在のタブキーを取得
  const getCurrentTabKey = () => {
    if (isCorporateOnly) return 'corporate';
    if (isInfluencerOnly) return 'influencer';
    if (isPrOnly) return 'affiliate';
    return 'all';
  };

  // FilterValueをFilterQueryに変換する関数
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

  // タブ切り替え時にフィルターを復元
  useEffect(() => {
    const currentTabFilters = getCurrentFilters();
    const currentCache = getCurrentCache();
    
    console.log('[DEBUG] タブ切り替え - キャッシュチェック:', {
      currentTab: getCurrentTabKey(),
      filtersCount: Object.keys(currentTabFilters).length,
      cacheValid: isCacheValidWithFilters(getCurrentTabKey(), generateFilterHash(currentTabFilters), currentTabFilters),
      cachedDataCount: currentCache.data.length
    });

    // フィルター状態を復元
    setFilters(currentTabFilters);

    // キャッシュが有効な場合はデータも復元
    if (isCacheValidWithFilters(getCurrentTabKey(), generateFilterHash(currentTabFilters), currentTabFilters)) {
      console.log('[DEBUG] キャッシュからデータを復元');
      setData(currentCache.data);
      setCurrentPage(currentCache.currentPage);
      setTotalPages(currentCache.totalPages);
      setIsLoading(false);
      return; // APIコールをスキップ
    }

    console.log('[DEBUG] キャッシュが無効、APIコールが必要');
  }, [isCorporateOnly, isInfluencerOnly, isPrOnly, getCurrentTabKey, generateFilterHash, filters, isCacheValidWithFilters, getCurrentCache]);

  // ★ タブ切り替え時にフィルター状態も含めてキャッシュチェック（こちらのみ残す）
  useEffect(() => {
    const currentTabFilters = getCurrentFilters();
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(currentTabFilters);
    
    console.log('[DEBUG] タブ切り替え - キャッシュチェック:', {
      currentTab: tabKey,
      filterHash,
      filtersCount: Object.keys(currentTabFilters).length,
      cacheExists: !!dataByTab[tabKey]?.[filterHash]
    });

    // フィルター状態を復元
    setFilters(currentTabFilters);

    // ★ フィルタ状態を含むキャッシュが有効な場合はデータも復元
    if (isCacheValidWithFilters(tabKey, filterHash, currentTabFilters)) {
      const cache = dataByTab[tabKey][filterHash];
      console.log('[DEBUG] フィルタ付きキャッシュからデータを復元');
      setData(cache.data);
      setCurrentPage(cache.currentPage);
      setTotalPages(cache.totalPages);
      setIsLoading(false);
      return; // APIコールをスキップ
    }

    console.log('[DEBUG] フィルタ付きキャッシュが無効、APIコールが必要');
  }, [isCorporateOnly, isInfluencerOnly, isPrOnly]); // 依存配列を簡素化

  // 現在のタブフィルタ設定を取得
  const currentTabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
  const currentTabFilterFields = getTabFilterFields(currentTabType);

  // fetchData関数を修正してキャッシュを更新
  const fetchData = useCallback(async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(currentFilters || {});
    
    console.log('fetchData呼び出し:', { 
      page, 
      tabKey,
      filtersCount: Object.keys(currentFilters || {}).length 
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
      
      if (response && response.success && Array.isArray(response.data)) {
        const newData = response.data;
        const newCurrentPage = response.currentPage || page;
        const newTotalPages = response.totalPages || 1;

        // UIの状態を更新
        setData(newData);
        setCurrentPage(newCurrentPage);
        setTotalPages(newTotalPages);

        // ★ フィルタ状態ごとにキャッシュを更新
        setDataByTab(prev => ({
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            [filterHash]: {
              data: newData,
              currentPage: newCurrentPage,
              totalPages: newTotalPages,
              lastFetchTime: Date.now(),
              filters: { ...currentFilters || {} }
            }
          }
        }));

        console.log('[DEBUG] データとキャッシュを更新:', {
          tabKey,
          filterHash,
          dataCount: newData.length,
          page: newCurrentPage
        });
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, isPrOnly, isCorporateOnly, isInfluencerOnly, generateFilterHash, getCurrentTabKey]);

  // ★ メインのuseEffectを簡素化
  useEffect(() => {
    const tabKey = getCurrentTabKey();
    const filterHash = generateFilterHash(filters);

    // キャッシュが有効な場合はAPIコールをスキップ
    if (isCacheValidWithFilters(tabKey, filterHash, filters)) {
      console.log('[DEBUG] キャッシュ有効、APIコールをスキップ');
      return;
    }

    console.log('[DEBUG] APIコール実行:', { 
      tabKey, 
      filterHash,
      filtersCount: Object.keys(filters).length
    });
    
    if (Object.keys(filters).length === 0) {
      fetchData(currentPage, {});
      return;
    }
    
    const timer = setTimeout(() => {
      fetchData(currentPage, filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters, currentPage, pageSize, isPrOnly, isCorporateOnly, isInfluencerOnly]);

  // handleFilter 関数をメモ化（fetchDataを直接呼び出しを削除）
  const handleFilter = useCallback((newFilter: FilterValue) => {
    // クリア操作を明示的に検出
    if (newFilter.type === 'clear') {
      if (newFilter.field === 'reset') {
        // タブごとのフィルターもクリア
        const currentTab = getCurrentTabKey();
        setFiltersByTab(prev => ({
          ...prev,
          [currentTab]: {}
        }));
        setFilters({});
        setCurrentPage(1);
        return;
      }
      
      if (newFilter.field && filters[newFilter.field]) {
        const updatedFilters = { ...filters };
        delete updatedFilters[newFilter.field];
        
        // タブごとのフィルターも更新
        const currentTab = getCurrentTabKey();
        setFiltersByTab(prev => ({
          ...prev,
          [currentTab]: updatedFilters
        }));
        
        setFilters(updatedFilters);
        return;
      }
      return;
    }
    
    // フィールド名を英語に逆変換
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
    
    // タブごとのフィルターも更新
    const currentTab = getCurrentTabKey();
    setFiltersByTab(prev => ({
      ...prev,
      [currentTab]: updatedFilters
    }));
    
    setFilters(updatedFilters);
  }, [filters]);

  // handleClearAllFilters 関数をメモ化（fetchDataの直接呼び出しを削除）
  const handleClearAllFilters = useCallback(() => {
    if (tableRef.current && tableRef.current.clearAllFilters) {
      tableRef.current.clearAllFilters();
    }
    
    // 全タブのフィルターをクリア
    setFiltersByTab({
      all: {},
      corporate: {},
      influencer: {},
      affiliate: {}
    });
    
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setFilters({});
    setCurrentPage(1);
  }, []);

  // handleColumnSettingsChange関数を先に定義
  const handleColumnSettingsChange = useCallback((columns: string[]) => {
    setVisibleColumns(columns);
  }, []);

  // タブ切り替え時にカラム設定を更新する関数
  const updateColumnsForTab = useCallback((tabType: keyof typeof TAB_DEFAULT_COLUMNS) => {
    const defaultColumns = TAB_DEFAULT_COLUMNS[tabType];
    setVisibleColumns(defaultColumns);
  }, []);

  // handlePrOnlyChange 関数を修正
  const handlePrOnlyChange = useCallback((checked: boolean) => {
    console.log('handlePrOnlyChange:', checked);
    setIsPrOnly(checked);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setCurrentPage(1);
    
    // タブ切り替え時にカラムを更新
    if (checked) {
      updateColumnsForTab('affiliate');
    } else {
      updateColumnsForTab('all');
    }
  }, [updateColumnsForTab]);

  // handleCorporateOnlyChange 関数を修正
  const handleCorporateOnlyChange = useCallback((checked: boolean) => {
    console.log('handleCorporateOnlyChange:', checked);
    setIsCorporateOnly(checked);
    setIsPrOnly(false);
    setIsInfluencerOnly(false);
    setCurrentPage(1);
    
    // タブ切り替え時にカラムを更新
    if (checked) {
      updateColumnsForTab('corporate');
    } else {
      updateColumnsForTab('all');
    }
  }, [updateColumnsForTab]);

  // handleInfluencerOnlyChange 関数を修正
  const handleInfluencerOnlyChange = useCallback((checked: boolean) => {
    console.log('handleInfluencerOnlyChange:', checked);
    setIsInfluencerOnly(checked);
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setCurrentPage(1);
    
    // タブ切り替え時にカラムを更新
    if (checked) {
      updateColumnsForTab('influencer');
    } else {
      updateColumnsForTab('all');
    }
  }, [updateColumnsForTab]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // handleMultipleFilters 関数をメモ化（fetchDataの直接呼び出しを削除）
  const handleMultipleFilters = useCallback((filters: Record<string, FilterQuery>) => {
    if (filters.reset && filters.reset.type === 'clear') {
      // タブごとのフィルターもクリア
      const currentTab = getCurrentTabKey();
      setFiltersByTab(prev => ({
        ...prev,
        [currentTab]: {}
      }));
      setFilters({});
      setCurrentPage(1);
      return;
    }

    if (filters['sort_clear'] || filters['sort_indicator']) {
      const newFilterSet: Record<string, FilterQuery> = {};
      const currentState = { ...filters };
      
      Object.keys(currentState)
        .filter(key => key.endsWith('_sort'))
        .forEach(key => delete currentState[key]);
      
      delete currentState['sort_clear'];
      delete currentState['sort_indicator'];
      
      Object.entries(filters)
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
      
      // タブごとのフィルターも更新
      const currentTab = getCurrentTabKey();
      setFiltersByTab(prev => ({
        ...prev,
        [currentTab]: newFilterSet
      }));
      
      setFilters(newFilterSet);
      setCurrentPage(1);
      return;
    }
    
    const newFilters: Record<string, FilterQuery> = {};
    
    Object.entries(filters).forEach(([key, filterValue]) => {
      let field = key;
      
      if (typeof filterValue.field === 'string' && filterValue.field) {
        const mappedField = Object.entries(COLUMN_MAP).find(([_, value]) => value === filterValue.field)?.[0];
        field = mappedField || filterValue.field;
      }
      
      if (filterValue.field === 'ハッシュタグ') {
        field = 'hashtags';
      }
      
      const filterQuery: FilterQuery = {
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
        newFilters[`${field}_sort`] = filterQuery;
      } else if (filterValue.type !== 'indicator') {
        newFilters[field] = filterQuery;
      }
    });
    
    // タブごとのフィルターも更新
    const currentTab = getCurrentTabKey();
    setFiltersByTab(prev => ({
      ...prev,
      [currentTab]: newFilters
    }));
    
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  // 初期読み込み時に設定を取得する部分を修正
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await displaySettingsApi.getSettings();
        
        if (response.success && response.settings && response.settings.columns && response.settings.columns.length > 0) {
          const visibleColumnNames = response.settings.columns
            .filter(col => col.is_visible)
            .map(col => col.column_name);
          
          if (visibleColumnNames.length === 0) {
            // 現在のタブに応じてデフォルトカラムを設定
            const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
            const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
            setVisibleColumns(defaultColumns);
          } else {
            setVisibleColumns(visibleColumnNames);
          }
        } else {
          // 設定がない場合は現在のタブに応じてデフォルトカラムを設定
          const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
          const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
          setVisibleColumns(defaultColumns);
        }
        setIsSettingsLoaded(true);
      } catch (error) {
        console.error('設定読み込みエラー:', error);
        toast({
          title: "エラー",
          description: "表示設定の読み込みに失敗しました",
          variant: "destructive",
        });
        
        // エラー時も現在のタブに応じてデフォルトカラムを設定
        const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
        const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
        setVisibleColumns(defaultColumns);
        setIsSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []); // 初期読み込みのみ実行

  // 既存のuseEffect群の後に追加
  
  // ★ バックグラウンドprefetch機能を更新（フィルタ状態も考慮）
  useEffect(() => {
    if (!isLoading && data.length > 0) {
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
            
            // ★ フィルタ状態も含めてキャッシュチェック
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
      };

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(prefetchOtherTabs, { timeout: 3000 });
      } else {
        setTimeout(prefetchOtherTabs, 2000);
      }
    }
  }, [isLoading, data.length, pageSize, getCurrentTabKey, generateFilterHash, isCacheValidWithFilters]);

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