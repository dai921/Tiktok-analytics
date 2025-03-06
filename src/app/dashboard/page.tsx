'use client'

import React, { useState, useRef, useEffect } from 'react'
import { DataTable } from '@/components/dashboard/data-table'
import { Header } from "@/components/header"
import { getSheetData, COLUMN_MAP } from '@/lib/api'
import type { VideoData, FilterQuery, FilterValue } from '@/types/dashboard'
import { TableHeaderCellRef } from '@/components/dashboard/table-header-cell'

const headers = [
  { key: 'createdAt', title: '作成日時', type: 'date' as const },
  { key: 'views', title: '再生数', type: 'number' as const },
  // { key: 'viewsIncrease', title: '再生増加数', type: 'number' as const },  // 一時的に非表示
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
  const [filters, setFilters] = useState<Record<string, FilterQuery>>({})
  const headerRefs = useRef<(TableHeaderCellRef | null)[]>([])

  const convertFilterValueToQuery = (filter: FilterValue): FilterQuery => {
    return {
      field: filter.field,
      type: filter.type,
      value: filter.value
    }
  }

  const handleFilter = (newFilter: FilterValue) => {
    console.log('Dashboard - Filter received:', {
      newFilter,
      currentFilters: filters,
      isClearing: newFilter.clear
    });

    if (newFilter.clear) {
      console.log('Dashboard - Clearing filter for field:', newFilter.field);
      setFilters(prev => {
        const updated = { ...prev };
        delete updated[newFilter.field];
        console.log('Updated filters after clear:', updated);
        
        // フィルターが全てクリアされた場合は、データを再取得
        if (Object.keys(updated).length === 0) {
          fetchData(1, {});
        }
        
        return updated;
      });
    } else {
      // フィールド名を英語に逆変換
      const field = Object.entries(COLUMN_MAP).find(([_, value]) => value === newFilter.field)?.[0] || newFilter.field;
      
      console.log('Dashboard - フィールド変換:', {
        originalField: newFilter.field,
        convertedField: field,
        type: newFilter.type,
        value: newFilter.value
      });

      const filterQuery: FilterQuery = {
        field: field,
        type: newFilter.type,
        value: newFilter.value
      };
      
      console.log('Dashboard - 作成されたフィルタークエリ:', filterQuery);
      
      setFilters(prev => ({
        ...prev,
        [field]: filterQuery
      }));
    }
  };

  const fetchData = async (page: number = 1, currentFilters?: Record<string, FilterQuery>) => {
    setIsLoading(true);
    try {
      const response = await getSheetData(page, currentFilters);
      console.log('APIレスポンス:', response);  // デバッグログを追加
      
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
  }, [filters, currentPage]);

  const handleClearAllFilters = () => {
    headerRefs.current.forEach(ref => {
      ref?.clearFilter()
    })
    setFilters({})
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        hasFilters={Object.keys(filters).length > 0}
        onClearFilters={handleClearAllFilters} 
      />
      <main className="max-w-screen-2xl mx-auto px-4 py-4">
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
        />
      </main>
    </div>
  )
}

export default Dashboard