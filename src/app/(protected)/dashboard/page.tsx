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

  // 現在のタブフィルタ設定を取得
  const currentTabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
  const currentTabFilterFields = getTabFilterFields(currentTabType);

  // fetchData 関数をメモ化（依存配列を最小限に）
  const fetchData = useCallback(async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    console.log('fetchData呼び出し:', { page, isPrOnly, isCorporateOnly, isInfluencerOnly, filtersCount: Object.keys(currentFilters || {}).length });
    
    setIsLoading(true);
    try {
      // データソースに応じてAPIを切り替え
      let response;
      if (isPrOnly) {
        console.log('アフィリエイトデータAPIを呼び出し');
        response = await getAffiliateData(page, currentFilters, pageSize);
      } else if (isCorporateOnly) {
        console.log('運用代行用データAPIを呼び出し');
        response = await getCorporateData(page, currentFilters, pageSize);
      } else if (isInfluencerOnly) {
        console.log('インフルエンサーデータAPIを呼び出し');
        response = await getInfluencerData(page, currentFilters, pageSize);
      } else {
        console.log('通常データAPIを呼び出し');
        response = await getDbData(page, currentFilters, pageSize);
      }
      
      if (response && response.success) {
        if (Array.isArray(response.data)) {
          setData(response.data);
          setCurrentPage(response.currentPage || page);
          setTotalPages(response.totalPages || 1);
        } else {
          console.error('データの形式が不正です:', response.data);
          setData([]);
        }
      } else {
        console.error('APIエラー:', response?.error || '不明なエラー');
        setData([]);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, isPrOnly, isCorporateOnly, isInfluencerOnly]);

  // メインのデータ取得用useEffect - fetchDataを依存配列から除外
  useEffect(() => {
    console.log('メインuseEffect実行:', { isPrOnly, isCorporateOnly, isInfluencerOnly, currentPage, filtersCount: Object.keys(filters).length });
    
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
        setFilters({});
        setCurrentPage(1);
        return; // fetchDataの直接呼び出しを削除
      }
      
      if (newFilter.field && filters[newFilter.field]) {
        const updatedFilters = { ...filters };
        delete updatedFilters[newFilter.field];
        setFilters(updatedFilters);
        return; // fetchDataの直接呼び出しを削除
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

    const filterQuery: FilterQuery = {
      field: field,
      type: newFilter.type,
      value: newFilter.value,
      active: true,
      ...(newFilter.isHashtag && { isHashtag: true }),
      ...(newFilter.timestamp !== undefined && { timestamp: newFilter.timestamp }),
      ...(newFilter.isPrimarySort !== undefined && { isPrimarySort: newFilter.isPrimarySort }),
      ...(newFilter.sortField !== undefined && { sortField: newFilter.sortField }),
      ...(newFilter.comparison !== undefined && { comparison: newFilter.comparison })
    };
    
    if (newFilter.type === 'sort') {
      setFilters(prev => {
        const existingFilter = prev[field];
        return {
          ...prev,
          [`${field}_sort`]: filterQuery,
          ...(existingFilter && { [field]: existingFilter })
        };
      });
    } else if (newFilter.type === 'multiselect') {
      setFilters(prev => ({
        ...prev,
        [field]: {
          ...filterQuery,
          comparison: 'contains'
        }
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        [field]: filterQuery
      }));
    }
  }, [filters]); // fetchDataを依存配列から削除

  // handleClearAllFilters 関数をメモ化（fetchDataの直接呼び出しを削除）
  const handleClearAllFilters = useCallback(() => {
    if (tableRef.current && tableRef.current.clearAllFilters) {
      tableRef.current.clearAllFilters();
    }
    
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setFilters({});
    setCurrentPage(1);
    // fetchDataの直接呼び出しを削除 - useEffectが自動的に呼び出す
  }, []); // fetchDataを依存配列から削除

  // handleColumnSettingsChange関数を先に定義
  const handleColumnSettingsChange = useCallback((columns: string[]) => {
    setVisibleColumns(columns);
  }, []);

  // タブ切り替え時にカラム設定を更新する関数
  const updateColumnsForTab = useCallback((tabType: keyof typeof TAB_DEFAULT_COLUMNS) => {
    const defaultColumns = TAB_DEFAULT_COLUMNS[tabType];
    setVisibleColumns(defaultColumns);
    
    // カラム設定変更をDataTableに通知（必要に応じて）
    // handleColumnSettingsChange(defaultColumns); // この行は不要かもしれません
  }, [handleColumnSettingsChange]);

  // handlePrOnlyChange 関数を修正
  const handlePrOnlyChange = useCallback((checked: boolean) => {
    console.log('handlePrOnlyChange:', checked);
    setIsPrOnly(checked);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setCurrentPage(1);
    setFilters({});
    
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
    setFilters({});
    
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
    setFilters({});
    
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
      setFilters({});
      setCurrentPage(1);
      return; // fetchDataの直接呼び出しを削除
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
      
      setFilters(newFilterSet);
      setCurrentPage(1);
      // fetchDataの直接呼び出しを削除 - useEffectが自動的に呼び出す
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
    
    setFilters(newFilters);
    setCurrentPage(1);
    // fetchDataの直接呼び出しを削除 - useEffectが自動的に呼び出す
  }, []); // fetchDataを依存配列から削除

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