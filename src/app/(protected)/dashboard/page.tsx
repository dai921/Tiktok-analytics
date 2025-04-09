'use client'

import React, { useState, useRef, useEffect } from 'react'
import { DataTable } from '@/components/dashboard/data-table'
import { getDbData, COLUMN_MAP } from '@/lib/api'
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard'
import { TableHeaderCellRef } from '@/components/dashboard/table-header-cell'


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
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<Record<string, FilterQuery>>({})
  const headerRefs = useRef<(TableHeaderCellRef | null)[]>([])
  const [isPrOnly, setIsPrOnly] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

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

  const handleFilter = (newFilter: FilterValue) => {
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
  };

  const fetchData = async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    setIsLoading(true);
    try {
      console.log('フェッチデータ - 使用するフィルター:', currentFilters);
      
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
  };

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
  }, [filters, currentPage, pageSize]);

  const handleClearAllFilters = () => {
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
  };

  const handlePrOnlyChange = (checked: boolean) => {
    console.log('PR動画のみ表示:', checked);
    setIsPrOnly(checked);
    
    if (checked) {
      // PRフィルターを追加
      const prFilter: FilterQuery = {
        field: 'hashtags',
        type: 'contains',
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
      setFilters(updatedFilters);
    }
    
    // ページをリセット
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // 複数フィルターを処理する関数を追加
  const handleMultipleFilters = (filters: Record<string, FilterValue>) => {
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
    
    // フィルター状態を更新
    setFilters(newFilters);
    setCurrentPage(1);
    
    // 新しいフィルター状態でデータを取得
    fetchData(1, newFilters);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-screen-2xl">
        <DataTable 
          ref={tableRef}
          data={data}
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