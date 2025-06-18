'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { DataTable } from '@/components/dashboard/data-table/Datatable'
import { getDbData, COLUMN_MAP } from '@/lib/api'
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard'
import { TableHeaderCellRef } from '@/components/dashboard/data-table/table-header-cell'
import { displaySettingsApi } from '@/lib/display_settings_api'
import { toast } from "@/hooks/use-toast"


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
  const [hasFilters, setHasFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<VideoData[]>([])
  const tableRef = useRef<{ clearAllFilters: () => void } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [filters, setFilters] = useState<Record<string, FilterQuery>>({})
  const headerRefs = useRef<(TableHeaderCellRef | null)[]>([])
  const [isPrOnly, setIsPrOnly] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)

  // 関数参照をモニタリングするためのrefを追加
  const handleFilterRef = useRef<Function | null>(null);
  const handleMultipleFiltersRef = useRef<Function | null>(null);
  const fetchDataRef = useRef<Function | null>(null);
  
  // コンポーネントのレンダリング回数を追跡するref
  const renderCountRef = useRef(0);

  const convertFilterValueToQuery = (filter: FilterValue): FilterQuery => {
    // ハッシュタグ用のフラグを引き継ぐ
    if (filter.isHashtag) {
      return {
        field: filter.field,
        type: filter.type,
        value: filter.value,
        isHashtag: true
      }
    }
    return {
      field: filter.field,
      type: filter.type,
      value: filter.value
    }
  }

  // handleFilter 関数をメモ化
  const handleFilter = useCallback((newFilter: FilterValue) => {
    console.log('Dashboard - フィルター受信:', newFilter);
    
    // クリア操作を明示的に検出
    if (newFilter.type === 'clear') {
      console.log(`Dashboard - フィルター削除: ${newFilter.field}`);
      
      // 特殊なリセット信号を検出
      if (newFilter.field === 'reset') {
        console.log('Dashboard - すべてのフィルターをクリア');
        // すべてのフィルターをクリア
        setFilters({});
        setCurrentPage(1);
        fetchData(1, {});
        return;
      }
      
      // 通常のフィルタークリア処理（既存の処理）
      if (newFilter.field && filters[newFilter.field]) {
        const updatedFilters = { ...filters };
        delete updatedFilters[newFilter.field];
        setFilters(updatedFilters);
        
        console.log('Dashboard - 更新後のフィルター:', updatedFilters);
        fetchData(1, updatedFilters);
      } else {
        console.log(`Dashboard - 削除するフィールド ${newFilter.field} が見つからないか空です`);
        fetchData(1, filters);
      }
      return;
    }
    
    // フィールド名を英語に逆変換（改善されたロジック）
    let field = '';
    
    // COLUMN_MAPを使った変換は、newFilter.fieldが日本語の場合のみ行う
    if (typeof newFilter.field === 'string' && newFilter.field) {
      const mappedField = Object.entries(COLUMN_MAP).find(([_, value]) => value === newFilter.field)?.[0];
      if (mappedField) {
        field = mappedField;
      } else {
        // マッピングが見つからない場合は、元のフィールド名を使用
        field = newFilter.field;
      }
    }
    
    // ハッシュタグの場合は特別に処理
    if (newFilter.field === 'ハッシュタグ') {
      field = 'hashtags';
    }
    
    console.log('Dashboard - フィールド変換:', {
      originalField: newFilter.field,
      convertedField: field,
      type: newFilter.type,
      value: newFilter.value,
      isHashtag: newFilter.isHashtag,
      timestamp: newFilter.timestamp,
      isPrimarySort: newFilter.isPrimarySort
    });

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
    
    console.log('Dashboard - 作成されたフィルタークエリ:', filterQuery);
    
    // 修正: ソート処理の場合は、既存のフィルター状態を維持しながらソート情報のみを更新
    if (newFilter.type === 'sort') {
      // 同じフィールドに対するフィルターがあれば、それを保持したままソート情報を追加
      setFilters(prev => {
        // 同じフィールドに対する既存のフィルター情報を取得
        const existingFilter = prev[field];
        
        // 同じフィールドに対するフィルターとソートの情報をマージ
        return {
          ...prev,
          // ソート用の新しいキーを作成（既存のフィルターとは別に管理）
          [`${field}_sort`]: filterQuery,
          // 既存のフィルターが存在する場合は維持
          ...(existingFilter && { [field]: existingFilter })
        };
      });
    } else if (newFilter.type === 'multiselect') {
      // マルチセレクトタイプの場合は特別な処理
      setFilters(prev => ({
        ...prev,
        [field]: {
          ...filterQuery,
          comparison: 'contains' // 必ず 'contains' 比較演算子を使用
        }
      }));
    } else {
      // 通常のフィルター処理
      setFilters(prev => ({
        ...prev,
        [field]: filterQuery
      }));
    }
  }, [filters]); // フィルター状態のみに依存

  // fetchData 関数をメモ化
  const fetchData = useCallback(async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    setIsLoading(true);
    try {
      console.log('フェッチデータ - 使用するフィルター:', currentFilters);
      
      // より詳細なフィルターログを追加
      if (currentFilters) {
        console.log('フェッチデータ - 詳細フィルター情報:');
        Object.entries(currentFilters).forEach(([key, filter]) => {
          console.log(`  フィルター[${key}]:`, {
            field: filter.field,
            type: filter.type,
            value: filter.value,
            comparison: filter.comparison,
            active: filter.active,  // active状態を明示的に出力
            isHashtag: filter.isHashtag
          });
        });
      }
      
      const response = await getDbData(page, currentFilters, pageSize);
      console.log('APIレスポンス:', response);
      
      // データの構造を詳細に確認
      if (response && response.success && Array.isArray(response.data) && response.data.length > 0) {
        console.log('データサンプル（最初の項目）:', {
          account_name: response.data[0].account_name,
          audioTitle: response.data[0].audioTitle,
          description: response.data[0].description,
          url: response.data[0].url,
          keys: Object.keys(response.data[0])
        });
      }
      
      if (response && response.success) {
        if (Array.isArray(response.data)) {
          setData(response.data);
          setCurrentPage(response.currentPage || page);
          setTotalPages(response.totalPages || 1);
          setTotalCount(response.totalCount || response.data.length);
        } else {
          console.error('データの形式が不正です:', response.data);
          setData([]);
          setTotalCount(0);
        }
      } else {
        console.error('APIエラー:', response?.error || '不明なエラー');
        setData([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      setData([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]); // ページサイズのみに依存

  useEffect(() => {
    console.log('Dashboard - フィルター変更を検知:', filters);
    
    // 空のフィルターオブジェクトをチェック
    if (Object.keys(filters).length === 0) {
      // フィルターが空の場合は即時データ取得
      fetchData(currentPage, {});
      return;
    }
    
    // フィルター内容をログに出力（デバッグ用）
    Object.entries(filters).forEach(([key, filter]) => {
      console.log(`フィルターチェック[${key}]:`, {
        field: filter.field,
        type: filter.type,
        value: filter.value,
        comparison: filter.comparison
      });
    });
    
    // 数値フィルター（特に再生数）が含まれているか確認
    const hasNumberFilter = Object.values(filters).some(
      filter => filter.type === 'number'
    );
    
    if (hasNumberFilter) {
      console.log('数値フィルターが検出されました');
    }
    
    // デバウンス処理を追加
    const timer = setTimeout(() => {
      fetchData(currentPage, filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters, currentPage, pageSize, fetchData]);

  // handleClearAllFilters 関数をメモ化
  const handleClearAllFilters = useCallback(() => {
    console.log('すべてのフィルターをクリア');
    
    // 重要: 状態更新の順序を整理して無限ループを防ぐ
    // 1. API呼び出しを最初に行わないようにする
    // 2. 一度の更新で複数の状態を変更する
    
    // DataTableのフィルターをクリア
    if (tableRef.current && tableRef.current.clearAllFilters) {
      console.log('DataTableのclearAllFiltersを呼び出し');
      tableRef.current.clearAllFilters();
    }
    
    // PRフィルターの状態もリセット
    setIsPrOnly(false);
    
    // すべてのフィルターをクリア
    setFilters({});
    setCurrentPage(1); // ページもリセット
    
    // 最後にデータを再取得
    fetchData(1, {});
  }, [fetchData]); // fetchDataのみに依存

  // handlePrOnlyChange 関数をメモ化
  const handlePrOnlyChange = useCallback((checked: boolean) => {
    console.log('PR動画のみ表示:', checked);
    setIsPrOnly(checked);
    
    if (checked) {
      // PRフィルターを追加（完全一致検索に変更）
      const prFilter: FilterQuery = {
        field: 'hashtags',
        type: 'exact_hashtags', // containsから変更
        value: 'pr',
        isHashtag: true
      };
      
      setFilters(prev => ({
        ...prev,
        hashtags_pr: prFilter
      }));
    } else {
      // PRフィルターを削除
      const updatedFilters = { ...filters };
      delete updatedFilters.hashtags_pr;
      
      // hashtags関連のPRフィルターも削除する
      Object.keys(updatedFilters).forEach(key => {
        const filter = updatedFilters[key];
        if ((key === 'hashtags' || key.includes('hashtag')) && 
            filter && filter.type === 'exact_hashtags' && 
            filter.value === 'pr') {
          delete updatedFilters[key];
        }
      });
      
      setFilters(updatedFilters);
    }
    
    // ページをリセット
    setCurrentPage(1);
  }, [filters]); // filters のみに依存

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // handleMultipleFilters 関数をメモ化
  const handleMultipleFilters = useCallback((filters: Record<string, FilterQuery>) => {
    console.log('Dashboard - 複数フィルター処理:', filters);
    
    // すべてのフィルターをクリアするリセット信号をチェック
    if (filters.reset && filters.reset.type === 'clear') {
      console.log('Dashboard - すべてのフィルターをクリア（複数フィルター処理）');
      setFilters({});
      setCurrentPage(1);
      fetchData(1, {});
      return;
    }

    // ソート解除の特殊シグナルをチェック
    if (filters['sort_clear'] || filters['sort_indicator']) {
      console.log('Dashboard - ソート解除シグナルを検出');
      
      // sort_clearとsort_indicatorを除外した新しいフィルター群を構築する
      // filters引数から渡された最新のフィルター情報を使用
      const newFilterSet: Record<string, FilterQuery> = {};
      
      // 1. まず現在のfilters状態（既存）を起点とする
      const currentState = { ...filters };
      
      // 2. 既存のfilter状態からソート関連のキーを削除
      Object.keys(currentState)
        .filter(key => key.endsWith('_sort'))
        .forEach(key => delete currentState[key]);
      
      // sort_clearとsort_indicatorも削除
      delete currentState['sort_clear'];
      delete currentState['sort_indicator'];
      
      // 3. filtersに含まれる通常のフィルターを追加（更新）
      // - ソート関連以外の新しいフィルターがあれば追加・更新
      Object.entries(filters)
        .filter(([key]) => !key.startsWith('sort_') && key !== 'sort_clear' && key !== 'sort_indicator')
        .forEach(([key, value]) => {
          // COLUMN_MAPを使った変換は、value.fieldが日本語の場合のみ行う
          let field = key;
          if (typeof value.field === 'string' && value.field) {
            const mappedField = Object.entries(COLUMN_MAP).find(([_, v]) => v === value.field)?.[0];
            if (mappedField) {
              field = mappedField;
            } else {
              field = value.field;
            }
          }
          
          // ハッシュタグの場合は特別に処理
          if (value.field === 'ハッシュタグ') {
            field = 'hashtags';
          }
          
          // 新しいフィルターセットに追加（更新）
          newFilterSet[field] = {
            field: field,
            type: value.type,
            value: value.value,
            active: true,
            ...(value.isHashtag && { isHashtag: true }),
            ...(value.comparison && { comparison: value.comparison })
          };
        });
      
      // デバッグログを出力
      console.log('Dashboard - ソート解除後の新しいフィルターセット:', newFilterSet);
      
      // フィルター状態を更新
      setFilters(newFilterSet);
      setCurrentPage(1);
      
      // 新しいフィルター状態でデータ取得
      fetchData(1, newFilterSet);
      return;
    }
    
    // 新しいフィルター状態を構築
    const newFilters: Record<string, FilterQuery> = {};
    let hasSortFilters = false;
    
    // 各フィルターを処理
    Object.entries(filters).forEach(([key, filterValue]) => {
      // ソートフィルターの確認
      if (filterValue.type === 'sort') {
        hasSortFilters = true;
      }
      
      // フィールド名を英語に逆変換 (改善されたロジック)
      let field = key;
      
      // COLUMN_MAPを使った変換は、filterValue.fieldが日本語の場合のみ行う
      if (typeof filterValue.field === 'string' && filterValue.field) {
        const mappedField = Object.entries(COLUMN_MAP).find(([_, value]) => value === filterValue.field)?.[0];
        if (mappedField) {
          field = mappedField;
        } else {
          // マッピングが見つからない場合は、元のフィールド名を使用
          field = filterValue.field;
        }
      }
      
      // ハッシュタグの場合は特別に処理
      if (filterValue.field === 'ハッシュタグ') {
        field = 'hashtags';
      }
      
      console.log('Dashboard - フィールド変換（複数）:', {
        key,
        originalField: filterValue.field,
        convertedField: field,
        type: filterValue.type,
        value: filterValue.value
      });
      
      // フィルタークエリの構築
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
      
      // コンテンツタイプの場合は特別処理 (multiselectの場合)
      if (field === 'content_type' && filterValue.type === 'multiselect') {
        console.log('Dashboard - content_typeフィルター処理:', {
          value: filterValue.value,
          type: filterValue.type,
          comparison: filterValue.comparison || 'contains' // デフォルト値を表示
        });
        
        // フィルター値をより完全な形に整形
        newFilters['content_type'] = {
          field: 'content_type', // 直接英語の名前を使用
          type: 'multiselect',
          value: filterValue.value,
          comparison: 'contains', // 明示的に比較演算子を指定
          active: true, // activeプロパティを追加
          ...(filterValue.isHashtag && { isHashtag: true }),
          ...(filterValue.timestamp !== undefined && { timestamp: filterValue.timestamp }),
          ...(filterValue.isPrimarySort !== undefined && { isPrimarySort: filterValue.isPrimarySort }),
          ...(filterValue.sortField !== undefined && { sortField: filterValue.sortField })
        };
      }
      // カテゴリフィルターも同様に特別処理
      else if (field === 'category' && filterValue.type === 'multiselect') {
        console.log('Dashboard - categoryフィルター処理:', {
          value: filterValue.value,
          type: filterValue.type
        });
        
        newFilters['category'] = {
          field: 'category',
          type: 'multiselect',
          value: filterValue.value,
          comparison: 'contains', // 明示的に比較演算子を指定
          active: true, // activeプロパティを追加
        };
      }
      // 数値フィルターの特別処理
      else if (filterValue.type === 'number') {
        console.log('Dashboard - 数値フィルター処理:', {
          field,
          value: filterValue.value,
          comparison: filterValue.comparison || 'equal' // デフォルト値を表示
        });
        
        newFilters[field] = {
          field: field,
          type: 'number',
          value: filterValue.value,
          comparison: filterValue.comparison || 'equal', // 比較演算子を明示
          active: true, // activeプロパティを追加
        };
      }
      // ソート処理の場合は特別なキーを使用
      else if (filterValue.type === 'sort') {
        newFilters[`${field}_sort`] = filterQuery;
      } else if (filterValue.type !== 'indicator') { // indicator以外のタイプを処理
        newFilters[field] = filterQuery;
      }
    });
    
    console.log('Dashboard - 構築された複数フィルター:', newFilters);
    
    // フィルターのactive状態を詳細にログ出力
    Object.entries(newFilters).forEach(([key, filter]) => {
      console.log(`Dashboard - 最終フィルター[${key}]の詳細:`, {
        field: filter.field,
        type: filter.type,
        value: filter.value,
        comparison: filter.comparison,
        active: filter.active
      });
    });
    
    // フィルター状態を更新
    setFilters(newFilters);
    setCurrentPage(1);
    
    // 新しいフィルター状態でデータを取得
    fetchData(1, newFilters);
  }, [fetchData]); // fetchDataのみに依存

  // 初期読み込み時に設定を取得
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await displaySettingsApi.getSettings();
        console.log('表示設定のレスポンス:', response);
        
        if (response.success && response.settings && response.settings.columns && response.settings.columns.length > 0) {
          const visibleColumnNames = response.settings.columns
            .filter(col => col.is_visible)
            .map(col => col.column_name);
          
          console.log('読み込まれた表示カラム:', visibleColumnNames);
          
          // カラムが空の場合はデフォルト値を使用
          if (visibleColumnNames.length === 0) {
            console.log('表示カラムが空のため、デフォルト値を使用します');
            // constants.tsからインポートする
            const { DEFAULT_VISIBLE_COLUMNS } = require('@/components/dashboard/data-table/constants');
            setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
          } else {
            setVisibleColumns(visibleColumnNames);
          }
        } else {
          console.log('表示設定が取得できないため、デフォルト値を使用します');
          // constants.tsからインポートする
          const { DEFAULT_VISIBLE_COLUMNS } = require('@/components/dashboard/data-table/constants');
          setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
        }
        setIsSettingsLoaded(true);
      } catch (error) {
        console.error('設定読み込みエラー:', error);
        toast({
          title: "エラー",
          description: "表示設定の読み込みに失敗しました",
          variant: "destructive",
        });
        
        console.log('エラーのため、デフォルト値を使用します');
        // constants.tsからインポートする
        const { DEFAULT_VISIBLE_COLUMNS } = require('@/components/dashboard/data-table/constants');
        setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
        setIsSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // handleColumnSettingsChange 関数をメモ化
  const handleColumnSettingsChange = useCallback((columns: string[]) => {
    setVisibleColumns(columns);
  }, []);
  
  // レンダリング回数をカウントするuseEffect
  useEffect(() => {
    renderCountRef.current += 1;
    console.log(`[DEBUG-RENDER] Dashboard コンポーネントの再レンダリング回数: ${renderCountRef.current}`, {
      timestamp: new Date().toISOString()
    });
  });
  
  // 関数の参照が変更されているかをチェックするuseEffect - 関数定義後に配置
  useEffect(() => {
    if (handleFilterRef.current && handleFilterRef.current !== handleFilter) {
      console.log('[DEBUG-REF] handleFilter 関数の参照が変更されました');
    }
    handleFilterRef.current = handleFilter;

    if (handleMultipleFiltersRef.current && handleMultipleFiltersRef.current !== handleMultipleFilters) {
      console.log('[DEBUG-REF] handleMultipleFilters 関数の参照が変更されました');
    }
    handleMultipleFiltersRef.current = handleMultipleFilters;

    if (fetchDataRef.current && fetchDataRef.current !== fetchData) {
      console.log('[DEBUG-REF] fetchData 関数の参照が変更されました');
    }
    fetchDataRef.current = fetchData;
  }, [handleFilter, handleMultipleFilters, fetchData]);

  // DataTableコンポーネントは設定のロードが完了してから表示
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
              // 複数フィルターの場合の処理を追加
              if (filter.type === 'multiple' && filter.field === 'multipleFilters' && filter.filters) {
                console.log('Dashboard - 複数フィルター受信:', filter.filters);
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
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
        />
      </main>
    </div>
  )
}

export default Dashboard