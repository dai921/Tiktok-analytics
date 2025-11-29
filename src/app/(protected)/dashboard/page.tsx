'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { DataTable } from '@/components/dashboard/data-table/Datatable'
import { getDbData, getAffiliateData, getCorporateData, getInfluencerData, COLUMN_MAP } from '@/lib/api'
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard'
import { toast } from "@/hooks/use-toast"
import { TAB_DEFAULT_COLUMNS, getCurrentTabType, getTabFilterFields } from '@/components/dashboard/data-table/tab-columns'
import { getDefaultPreset, contextKeyFromTab, getPreset } from '@/lib/filter_presets_api'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  NotificationItem,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api/notifications'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'


// headers: 未使用のため削除

type TabKey = 'all' | 'affiliate' | 'corporate' | 'influencer'

const formatJstDateTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const UrlPresetApplier: React.FC<{
  updateTabFilters: (filters: Record<string, FilterQuery>, targetTabKey?: string) => void
  setFilters: React.Dispatch<React.SetStateAction<Record<string, FilterQuery>>>
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>
  setIsPrOnly: React.Dispatch<React.SetStateAction<boolean>>
  setIsCorporateOnly: React.Dispatch<React.SetStateAction<boolean>>
  setIsInfluencerOnly: React.Dispatch<React.SetStateAction<boolean>>
  setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>
  updateTabVisibleColumns: (columns: string[], targetTabKey?: string) => void
}> = ({
  updateTabFilters,
  setFilters,
  setCurrentPage,
  setIsPrOnly,
  setIsCorporateOnly,
  setIsInfluencerOnly,
  setVisibleColumns,
  updateTabVisibleColumns
}) => {
  const searchParams = useSearchParams()
  const appliedPresetRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const presetId = searchParams.get('preset')
    if (!presetId || appliedPresetRef.current === presetId) return

    ;(async () => {
      try {
        const res = await getPreset(presetId)
        const p = res?.preset
        if (!p) return

        const incoming = p.payload?.currentFilters ?? {}
        const cols = (p as any)?.payload?.visibleColumns
        const tabFlags = p.payload?.tab || {}
        const targetTab = getCurrentTabType(!!tabFlags.isPrOnly, !!tabFlags.isCorporateOnly, !!tabFlags.isInfluencerOnly)

        setIsPrOnly(!!tabFlags.isPrOnly)
        setIsCorporateOnly(!!tabFlags.isCorporateOnly)
        setIsInfluencerOnly(!!tabFlags.isInfluencerOnly)

        updateTabFilters(incoming, targetTab)
        setFilters(JSON.parse(JSON.stringify(incoming)))
        if (Array.isArray(cols) && cols.length) {
          console.log('[DEBUG] url apply visibleColumns =', cols);
          setVisibleColumns(cols);
          updateTabVisibleColumns(cols, targetTab);
        }
        setCurrentPage(1)
        appliedPresetRef.current = presetId
      } catch (e) {
        console.warn('Failed to apply preset from URL:', e)
      }
    })()
  }, [searchParams, updateTabFilters, setFilters, setCurrentPage, setIsPrOnly, setIsCorporateOnly, setIsInfluencerOnly, updateTabVisibleColumns])

  return null
}

const Dashboard = () => {
  const CACHE_DURATION = 5 * 60 * 1000;
  const { isAdmin, isDeveloper } = useAuth()
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number | null>(null)
  const [isNotificationCountLoading, setIsNotificationCountLoading] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isNotificationListLoading, setIsNotificationListLoading] = useState(false)
  const [isMarkAllReadLoading, setIsMarkAllReadLoading] = useState(false)
  const [notificationPage, setNotificationPage] = useState(1)
  const [notificationTotal, setNotificationTotal] = useState(0)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false)
  const NOTIFICATION_PAGE_SIZE = 10

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
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const defaultPresetAttemptedRef = useRef<Record<'all' | 'affiliate' | 'corporate' | 'influencer', boolean>>({
    all: false,
    affiliate: false,
    corporate: false,
    influencer: false
  });


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

  // タブごとの表示カラム状態を追加
  const [visibleColumnsByTab, setVisibleColumnsByTab] = useState<Record<string, string[]>>({
    all: [],
    corporate: [],
    influencer: [],
    affiliate: []
  });

  const [searchKeywordsByTab, setSearchKeywordsByTab] = useState<Record<TabKey, string>>({
    all: '',
    corporate: '',
    influencer: '',
    affiliate: ''
  });

  const refreshNotificationCount = useCallback(async () => {
    if (!isAdmin) {
      setUnreadNotificationCount(null)
      return
    }

    setIsNotificationCountLoading(true)
    try {
      const res = await fetchUnreadNotificationCount()
      const next =
        res.success && typeof res.data === 'number'
          ? res.data
          : typeof res.unread_total === 'number'
          ? res.unread_total
          : null
      setUnreadNotificationCount(next)
    } catch (error) {
      console.warn('Failed to load unread notification count:', error)
      setUnreadNotificationCount(null)
    } finally {
      setIsNotificationCountLoading(false)
    }
  }, [isAdmin])

  const loadNotifications = useCallback(async (page: number = 1) => {
    if (!isAdmin) {
      setNotifications([])
      return
    }
    setIsNotificationListLoading(true)
    try {
      const res = await fetchNotifications({
        limit: NOTIFICATION_PAGE_SIZE,
        offset: (page - 1) * NOTIFICATION_PAGE_SIZE,
      })
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data)
        setNotificationTotal(
          typeof res.total === 'number'
            ? res.total
            : res.data.length,
        )
        if (typeof res.unread_total === 'number') {
          setUnreadNotificationCount(res.unread_total)
        }
      }
    } catch (error) {
      console.warn('Failed to load notifications:', error)
    } finally {
      setIsNotificationListLoading(false)
    }
  }, [NOTIFICATION_PAGE_SIZE, isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      setUnreadNotificationCount(null)
      setIsNotificationCountLoading(false)
      return
    }
    refreshNotificationCount()
  }, [isAdmin, refreshNotificationCount])

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

  // 現在のタブの表示カラムを取得する関数
  const getCurrentVisibleColumns = useCallback(() => {
    const tabKey = getCurrentTabKey();
    return visibleColumnsByTab[tabKey] || [];
  }, [visibleColumnsByTab, isPrOnly, isCorporateOnly, isInfluencerOnly]);

  // 表示カラムを更新する関数
  const updateTabVisibleColumns = useCallback((columns: string[], targetTabKey?: string) => {
    const tabKey = targetTabKey || getCurrentTabKey();
    setVisibleColumnsByTab(prev => ({
          ...prev,
      [tabKey]: [...columns]
    }));
  }, [isPrOnly, isCorporateOnly, isInfluencerOnly]);

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

  // ★ キャッシュキー生成時にpageSizeも含める
  const generateCacheKey = (filterHash: string, page: number, size: number) => {
    return `${filterHash}_page${page}_size${size}`;
  };

  const buildSearchFilters = useCallback((rawKeyword: string) => {
    const trimmed = rawKeyword.trim();
    if (!trimmed) return {};

    return {
      global_search: {
        field: 'global_search',
        type: 'text',
        comparison: 'contains',
        value: trimmed,
        active: true
      }
    };
  }, []);

  const getSearchFiltersForTab = useCallback(
    (tabKey: TabKey) => buildSearchFilters(searchKeywordsByTab[tabKey] ?? ''),
    [buildSearchFilters, searchKeywordsByTab]
  );

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

        // キャッシュ更新時にpageSizeも含める
        setDataByTab(prev => ({
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            [generateCacheKey(filterHash, newCurrentPage, pageSize)]: { // ★ pageSize込みのキー
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

  // タブ切り替え時のuseEffectを修正
  useEffect(() => {
    if (!isBootstrapped) return;

    const tabKey = getCurrentTabKey();
    const currentTabFilters = getCurrentFilters();
    const currentTabColumns = visibleColumnsByTab[tabKey];
    
    const currentTab = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
    const defaultColumns = TAB_DEFAULT_COLUMNS[currentTab];
    
    // 表示カラムがまだ設定されていない場合のみデフォルトを適用
    if (!currentTabColumns || currentTabColumns.length === 0) {
      updateTabVisibleColumns(defaultColumns, tabKey);
      setVisibleColumns(defaultColumns);
    } else {
      // 既存の設定を維持
      setVisibleColumns(currentTabColumns);
    }
    
    setFilters(currentTabFilters);
    setCurrentPage(1);
  }, [isCorporateOnly, isInfluencerOnly, isPrOnly, isBootstrapped, visibleColumnsByTab, updateTabVisibleColumns]);

  useEffect(() => {
    if (!isBootstrapped) return;

    const tabKey = getCurrentTabKey();
    const searchFilters = getSearchFiltersForTab(tabKey);
    const combinedFilters = { ...filters, ...searchFilters };
    const filterHash = generateFilterHash(combinedFilters);

    // プリセット適用直後は即時フェッチ（デバウンス回避）
    if (isPresetApplyingRef.current) {
      isPresetApplyingRef.current = false;
      fetchData(currentPage, combinedFilters);
      return;
    }

    console.log('[DEBUG] フィルタ変更検知:', {
      tabKey,
      filterHash,
      filters: combinedFilters,
      filtersCount: Object.keys(combinedFilters).length,
      currentPage,
      pageSize
    });

    const cacheKey = generateCacheKey(filterHash, currentPage, pageSize);
    if (dataByTab[tabKey]?.[cacheKey]) {
      const cache = dataByTab[tabKey][cacheKey];
      const now = Date.now();
      const isExpired = now - cache.lastFetchTime > CACHE_DURATION;
      
      if (!isExpired) {
        console.log('[DEBUG] pageSize固有キャッシュからデータを復元:', cache);
        setData(cache.data);
        setTotalPages(cache.totalPages);
        setIsLoading(false);
        return;
      }
    }

    console.log('[DEBUG] 新しいデータを取得');
    if (Object.keys(combinedFilters).length === 0) {
      fetchData(currentPage, {});
    } else {
      const timer = setTimeout(() => {
        fetchData(currentPage, combinedFilters);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filters, currentPage, pageSize, isBootstrapped, searchKeywordsByTab, isPrOnly, isCorporateOnly, isInfluencerOnly, dataByTab, fetchData, getSearchFiltersForTab]);

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

  const handleSearchKeywordChange = useCallback((nextValue: string) => {
    const tabKey = getCurrentTabKey();
    if (searchKeywordsByTab[tabKey] === nextValue) {
      return;
    }

    setSearchKeywordsByTab(prev => ({
      ...prev,
      [tabKey]: nextValue,
    }));
    setCurrentPage(1);
  }, [searchKeywordsByTab, isPrOnly, isCorporateOnly, isInfluencerOnly]);

  useEffect(() => {
    if (!isBootstrapped) return;

    const tabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
    const ctx = contextKeyFromTab(tabType as any);

    // 既にこのタブでデフォルト適用を試行済みならスキップ
    if (defaultPresetAttemptedRef.current[tabType]) return;

    const hasExisting = Object.keys(filtersByTab[tabType] || {}).length > 0;
    if (hasExisting) {
      defaultPresetAttemptedRef.current[tabType] = true;
      return;
    }

    (async () => {
      try {
        const res = await getDefaultPreset(ctx);
        const incoming = res?.preset?.payload?.currentFilters;
        const cols = res?.preset?.payload?.visibleColumns; // ★ 追加
        
        // 試行済みにマーク（空でも一度だけ）
        defaultPresetAttemptedRef.current[tabType] = true;
        
        if (res?.success && incoming && typeof incoming === 'object' && Object.keys(incoming).length > 0) {
          updateTabFilters(incoming, tabType);
          setFilters(JSON.parse(JSON.stringify(incoming)));
          setCurrentPage(1);
        }
        
        // ★ 表示カラムの適用を追加
        if (res?.success && Array.isArray(cols) && cols.length > 0) {
          console.log('[DEBUG] デフォルトプリセットのvisibleColumns適用:', cols);
          updateTabVisibleColumns(cols, tabType);
          setVisibleColumns(cols);
        }
      } catch (e) {
        console.warn('Failed to load default saved filter:', e);
        // 失敗時も試行済みにして再試行ループを防止
        defaultPresetAttemptedRef.current[tabType] = true;
      }
    })();
  }, [isPrOnly, isCorporateOnly, isInfluencerOnly, filtersByTab, updateTabFilters, updateTabVisibleColumns, isBootstrapped]);

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
    
    // ★ prefetch関連の状態更新を削除
    // setPrefetchCompleted(false);
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    setIsInfluencerOnly(false);
    setFilters({});
    setCurrentPage(1);
  }, []);

  // カラム変更ハンドラーを更新
  const handleColumnSettingsChange = useCallback((newVisibleColumns: string[]) => {
    setVisibleColumns(newVisibleColumns);
    updateTabVisibleColumns(newVisibleColumns);
  }, [updateTabVisibleColumns]);

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

  // 表示設定APIは未使用。可視カラムはブートストラップでタブに応じて設定します。

  // ★ prefetch機能のuseEffectを削除
  // useEffect(() => {
  //   if (prefetchCompleted || isLoading || data.length === 0) {
  //     return;
  //   }
  //   // ... prefetch処理 ...
  // }, [isLoading, data.length, prefetchCompleted]);

  // ★ 削除: 重複したフィルタ用データの取得
  // useEffect(() => {
  //   const fetchFilterData = async () => {
  //     try {
  //       setFilterData(prev => ({ ...prev, isLoadingFilterData: true }));
  //       
  //       // 並列でAPIコールを実行
  //       const [productsResponse, accountTypesResponse] = await Promise.all([
  //         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/products`),
  //         fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/account-types`)
  //       ]);
  //       // ... 残りの処理も削除
  //     } catch (error) {
  //       // ... エラー処理も削除
  //     }
  //   };
  //   fetchFilterData();
  // }, []);

  // ★ 追加: DataTableからフィルターオプションを受け取る
  const [filterOptions, setFilterOptions] = useState({
    categories: [] as string[],
    products: [] as string[],
    productCategories: {} as Record<string, string[]>,
    productCategoryMap: {} as Record<string, string>,
    accountTypes: [] as string[],
    secondAccountTypes: [] as string[],
    thirdAccountTypes: [] as string[],
    thirdAccountTypeMap: {} as Record<string, string>,
    isLoading: false
  });

  // ★ 修正: フィルターオプション更新のハンドラーの型を統一
  const handleFilterOptionsUpdate = useCallback((options: {
    categories: string[];
    products: string[];
    productCategories: Record<string, string[]>;
    productCategoryMap: Record<string, string>;
    accountTypes: string[];
    secondAccountTypes: string[];
    thirdAccountTypes: string[];
    thirdAccountTypeMap: Record<string, string>;
    isLoading: boolean;
  }) => {
    setFilterOptions(options);
  }, []);

  // 現在のタブフィルタ設定を取得
  const currentTabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
  const currentTabFilterFields = getTabFilterFields(currentTabType);

  // defaultPresetAppliedRef: 未使用のため削除

  // 初回ブートストラップ: タブのデフォルト列設定 → 保存したフィルタ（デフォルト）適用 → 完了フラグ
  useEffect(() => {
    if (isBootstrapped) return;

    const tabType = getCurrentTabType(isPrOnly, isCorporateOnly, isInfluencerOnly);
    setVisibleColumns(TAB_DEFAULT_COLUMNS[tabType]);
    defaultPresetAttemptedRef.current[tabType] = true;

    const ctx = contextKeyFromTab(tabType as any);
    (async () => {
      try {
        const res = await getDefaultPreset(ctx);
        const incoming = res?.preset?.payload?.currentFilters;
        const cols = res?.preset?.payload?.visibleColumns;
        if (res?.success && incoming && typeof incoming === 'object') {
          updateTabFilters(incoming, tabType);
          setFilters(JSON.parse(JSON.stringify(incoming)));
          if (Array.isArray(cols) && cols.length) {
            console.log('[DEBUG] bootstrap apply visibleColumns =', cols);
            updateTabVisibleColumns(cols, tabType);
            setVisibleColumns(cols);
          }
        }
      } catch (e) {
        console.warn('bootstrap: default saved filter not found or failed:', e);
      } finally {
        setCurrentPage(1);
        setIsBootstrapped(true);
      }
    })();
  }, [isBootstrapped, isPrOnly, isCorporateOnly, isInfluencerOnly, updateTabFilters, updateTabVisibleColumns]);

  // プリセット適用時の表示カラム処理を修正
  const presetApplyVisibleColumns = useCallback((cols: string[]) => {
    setVisibleColumns(cols);
    updateTabVisibleColumns(cols);
  }, [updateTabVisibleColumns]);

  // プリセット適用時はデバウンスを回避するためのフラグ
  const isPresetApplyingRef = React.useRef(false);

  const handleMarkAllRead = useCallback(async () => {
    if (isMarkAllReadLoading) return
    setIsMarkAllReadLoading(true)
    try {
      const res = await markAllNotificationsRead()
      if (res.success) {
        const nowIso = new Date().toISOString()
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            is_read: true,
            read_at: n.read_at ?? nowIso,
          })),
        )
        setUnreadNotificationCount(0)
      }
    } catch (error) {
      console.warn('Failed to mark all notifications read:', error)
    } finally {
      setIsMarkAllReadLoading(false)
    }
  }, [isMarkAllReadLoading])

  const handleSelectNotification = useCallback(
    async (item: NotificationItem) => {
      setSelectedNotification(item)
      setIsNotificationDialogOpen(true)

      if (item.is_read) return
      try {
        const res = await markNotificationRead(item.id, true)
        if (res.success && res.data) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, ...res.data } : n)),
          )
          setUnreadNotificationCount((prev) => {
            const next = (prev ?? 0) - 1
            return next < 0 ? 0 : next
          })
        }
      } catch (error) {
        console.warn('Failed to mark notification read:', error)
      }
    },
    [],
  )

  const currentTabKey = getCurrentTabKey();
  const currentSearchKeyword = searchKeywordsByTab[currentTabKey] ?? '';

  const adminNotificationButton = isAdmin ? (
    <Popover
      open={isNotificationOpen}
      onOpenChange={(open) => {
        setIsNotificationOpen(open)
        if (open) {
          setNotificationPage(1)
          loadNotifications(1)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-gray-300"
          aria-label="通知一覧"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.65rem] font-semibold text-white">
            {isNotificationCountLoading
              ? '...'
              : (unreadNotificationCount ?? 0) > 99
              ? '99+'
              : unreadNotificationCount ?? 0}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-semibold">通知</p>
            <p className="text-xs text-muted-foreground">未読: {unreadNotificationCount ?? 0}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={handleMarkAllRead}
            disabled={
              isNotificationListLoading ||
              isMarkAllReadLoading ||
              (unreadNotificationCount ?? 0) === 0
            }
          >
            すべて既読にする
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isNotificationListLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              通知はありません。
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className="cursor-pointer border-b px-3 py-3 last:border-b-0 hover:bg-muted/50"
                onClick={() => handleSelectNotification(item)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
                    {!item.is_read && (
                      <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        未読
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                    {item.body}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatJstDateTime(item.sent_at) || '送信日時不明'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
          <div className="space-x-2">
            <button
              type="button"
              className="rounded-md border px-2 py-1 transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                const next = Math.max(1, notificationPage - 1)
                setNotificationPage(next)
                loadNotifications(next)
              }}
              disabled={notificationPage <= 1 || isNotificationListLoading}
            >
              前へ
            </button>
            <button
              type="button"
              className="rounded-md border px-2 py-1 transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                const totalPages = Math.max(
                  1,
                  Math.ceil(notificationTotal / NOTIFICATION_PAGE_SIZE),
                )
                const next = Math.min(totalPages, notificationPage + 1)
                setNotificationPage(next)
                loadNotifications(next)
              }}
              disabled={
                isNotificationListLoading ||
                notificationPage >=
                  Math.max(1, Math.ceil(notificationTotal / NOTIFICATION_PAGE_SIZE))
              }
            >
              次へ
            </button>
          </div>
          <span className="text-muted-foreground">
            {notificationPage}/
            {Math.max(1, Math.ceil(notificationTotal / NOTIFICATION_PAGE_SIZE))}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  ) : null

  const handleCloseNotificationDialog = () => {
    setIsNotificationDialogOpen(false)
    setSelectedNotification(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main>
        {/* 表示設定メニューはテーブルヘッダー（タイトル横）に移動 */}

        <Suspense fallback={null}>
          <UrlPresetApplier
            updateTabFilters={updateTabFilters}
            setFilters={setFilters}
            setCurrentPage={setCurrentPage}
            setIsPrOnly={setIsPrOnly}
            setIsCorporateOnly={setIsCorporateOnly}
            setIsInfluencerOnly={setIsInfluencerOnly}
            setVisibleColumns={setVisibleColumns}
            updateTabVisibleColumns={updateTabVisibleColumns}
          />
        </Suspense>

        <DataTable 
          ref={tableRef}
          data={data}
          defaultVisibleColumns={visibleColumns}
          onColumnSettingsChange={handleColumnSettingsChange}
          // 表示設定メニュー用のコールバックを渡す
          presetApplyFilters={(f, targetTabKey) => {
            isPresetApplyingRef.current = true;
            updateTabFilters(f, targetTabKey)
            setFilters(JSON.parse(JSON.stringify(f)))
            setCurrentPage(1)
          }}
          presetClearFilters={() => {
            updateTabFilters({})
            setFilters({})
            setCurrentPage(1)
          }}
          presetGetFiltersByTab={() => ({
            all: JSON.parse(JSON.stringify(filtersByTab.all)),
            affiliate: JSON.parse(JSON.stringify(filtersByTab.affiliate)),
            corporate: JSON.parse(JSON.stringify(filtersByTab.corporate)),
            influencer: JSON.parse(JSON.stringify(filtersByTab.influencer)),
          })}
          presetGetVisibleColumns={() => visibleColumns}
          presetGetVisibleColumnsByTab={() => ({
            all: [...(visibleColumnsByTab.all ?? [])],
            affiliate: [...(visibleColumnsByTab.affiliate ?? [])],
            corporate: [...(visibleColumnsByTab.corporate ?? [])],
            influencer: [...(visibleColumnsByTab.influencer ?? [])],
          })}
          presetApplyVisibleColumns={presetApplyVisibleColumns}
          notificationButton={adminNotificationButton}
          showSearchInput
          searchKeyword={currentSearchKeyword}
          onSearchKeywordChange={handleSearchKeywordChange}
          onFilterChange={(hasFilters, filter) => {
            if (!filter) return;
            // 現在のタブキーを明示的に算出し、フィルタ更新先を固定化
            const targetTabKey = getCurrentTabKey();
          
            // multiple（複数フィルタ）は FilterValue -> FilterQuery に正規化してから渡す
            if (filter.type === 'multiple' && filter.field === 'multipleFilters' && (filter as any).filters) {
              const normalized: Record<string, FilterQuery> = Object.fromEntries(
                Object.entries((filter as any).filters as Record<string, FilterValue>).map(([k, v]) => [
                  k,
                  typeof v === 'object' && v !== null && 'value' in (v as any)
                    ? (v as any)
                    : {
                        field: k,
                        type: 'equal',
                        value: v,
                      },
                ])
              )
              
              // フィルタをタブに適用
              updateTabFilters(normalized, targetTabKey)
              setFilters(JSON.parse(JSON.stringify(normalized)))
            } else {
              // 通常のフィルタは1件だけ更新
              updateTabFilters({ [filter.field]: filter as FilterQuery }, targetTabKey)
              setFilters((prev) => ({ ...prev, [filter.field]: filter as FilterQuery }))
            }
            setCurrentPage(1)
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
          isAdmin={isAdmin}
          // ★ 追加: 現在のタブのフィルター状態を渡す
          currentTabFilters={getCurrentFilters()}
          // ★ 修正: 両方のpropsを渡す
          onFilterOptionsUpdate={handleFilterOptionsUpdate}
          filterOptions={filterOptions}
        />

        <Dialog
          open={isNotificationDialogOpen}
          onOpenChange={(open) => {
            setIsNotificationDialogOpen(open)
            if (!open) setSelectedNotification(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedNotification?.title ?? '通知'}</DialogTitle>
              <DialogDescription>
                {formatJstDateTime(selectedNotification?.sent_at) || '送信日時不明'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {selectedNotification?.body ?? ''}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNotificationDialogOpen(false)}>
                閉じる
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

export default Dashboard
