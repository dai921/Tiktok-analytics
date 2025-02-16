'use client'

import { useEffect, useState, useRef } from 'react'
import { getSheetData } from '@/lib/sheets'
import type { VideoData } from '@/types/dashboard'
import { DataTable } from '@/components/dashboard/data-table'
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"

const Dashboard = () => {
  const [hasFilters, setHasFilters] = useState(false)
  const [data, setData] = useState<VideoData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const tableRef = useRef<{ clearAllFilters: () => void } | null>(null)

  const fetchData = async (page: number) => {
    setIsLoading(true)
    try {
      const response = await getSheetData(page)
      setData(response.data)
      setTotalPages(response.totalPages)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData(currentPage)
  }, [currentPage])

  const handlePageChange = (newPage: number) => {
    window.scrollTo(0, 0)  // ページトップにスクロール
    setCurrentPage(newPage)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        hasFilters={hasFilters} 
        onClearFilters={() => tableRef.current?.clearAllFilters()} 
      />
      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        <DataTable 
          ref={tableRef}
          initialData={data} 
          onFilterChange={setHasFilters}
          isLoading={isLoading}
        />
        <div className="flex justify-center gap-4 mt-8">
          <Button 
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            variant="outline"
          >
            前へ
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium">{currentPage}</span>
            <span className="text-sm text-gray-500">/ {totalPages}</span>
          </div>
          <Button 
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            variant="outline"
          >
            次へ
          </Button>
        </div>
      </main>
    </div>
  )
}

export default Dashboard