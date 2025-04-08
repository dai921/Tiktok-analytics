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
  { key: 'category', title: 'ジャンル' },
  { key: 'product', title: '商材' },
  { key: 'accountName', title: 'アカウント名' },
  { key: 'description', title: '説明' },
  { key: 'hashtags', title: 'ハッシュタグ' },
  { key: 'likes', title: 'いいね数', type: 'number' as const },
  { key: 'comments', title: 'コメント数', type: 'number' as const },
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
    if (newFilter.type === 'clear' || !newFilter.value) {
      console.log(`Dashboard - フィルター削除: ${newFilter.field}`);
      
      // フィールドが存在する場合のみ削除（エラー防止）
      if (newFilter.field && filters[newFilter.field]) {
        const updatedFilters = { ...filters };
        delete updatedFilters[newFilter.field];
        setFilters(updatedFilters);
        
        // 更新後のフィルターでデータを再取得
        console.log('Dashboard - 更新後のフィルター:', updatedFilters);
        fetchData(1, updatedFilters);
      } else {
        console.log(`Dashboard - 削除するフィールド ${newFilter.field} が見つからないか空です`);
        // 念のためすべてのフィルターで再取得
        fetchData(1, filters);
      }
      return;
    }
    
    // フィールド名を英語に逆変換
    let field = Object.entries(COLUMN_MAP).find(([_, value]) => value === newFilter.field)?.[0] || newFilter.field;
    
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
      ...(newFilter.sortField !== undefined && { sortField: newFilter.sortField })
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
    } else {
      // 通常のフィルター処理（既存のコード）
      setFilters(prev => ({
        ...prev,
        [field]: filterQuery
      }));
    }
  };

  const fetchData = async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    setIsLoading(true);
    try {
      const response = await getDbData(page, currentFilters, pageSize);
      console.log('APIレスポンス:', response);
      
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
  };

  useEffect(() => {
    console.log('Dashboard - フィルター変更を検知:', filters);
    const timer = setTimeout(() => {
      fetchData(currentPage, filters);
    }, 300); // デバウンス処理を追加

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

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-screen-2xl">
        <DataTable 
          ref={tableRef}
          initialData={data} 
          onFilterChange={(hasFilters, filter) => {
            if (filter) {
              handleFilter(filter)
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