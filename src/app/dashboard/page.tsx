'use client'

import React, { useState, useRef, useEffect } from 'react'
import { DataTable } from '@/components/dashboard/data-table'
import { Header } from "@/components/header"
import { getSheetData } from '@/lib/sheets'
import type { VideoData, FilterQuery } from '@/types/dashboard'
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
  const [filters, setFilters] = useState<Record<string, FilterQuery> | undefined>(undefined)
  const headerRefs = useRef<(TableHeaderCellRef | null)[]>([])

  const fetchData = async (page: number = 1, filters?: Record<string, FilterQuery>) => {
    setIsLoading(true)
    try {
      const response = await getSheetData(page, filters)
      if (response.success) {
        setData(response.data)
        setCurrentPage(page)
        setTotalPages(response.totalPages)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleClearAllFilters = () => {
    headerRefs.current.forEach(ref => {
      ref?.clearFilter()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        hasFilters={hasFilters} 
        onClearFilters={handleClearAllFilters} 
      />
      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        <DataTable 
          ref={tableRef}
          initialData={data} 
          onFilterChange={(hasFilters, filter) => {
            setHasFilters(hasFilters)
            if (filter) {
              fetchData(1, { [filter.field]: filter })
            } else {
              fetchData()
            }
          }}
          onPageChange={(page) => fetchData(page, filters || undefined)}
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
        />
      </main>
    </div>
  )
}

export default Dashboard