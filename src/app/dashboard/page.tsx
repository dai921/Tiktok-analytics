'use client'

import React, { useState, useRef, useEffect } from 'react'
import { DataTable } from '@/components/dashboard/data-table'
import { Header } from "@/components/header"
import { getSheetData } from '@/lib/sheets'
import type { VideoData, FilterQuery } from '@/types/dashboard'

const Dashboard = () => {
  const [hasFilters, setHasFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<VideoData[]>([])
  const tableRef = useRef<{ clearAllFilters: () => void } | null>(null)

  const fetchData = async (page: number = 1, filters?: Record<string, FilterQuery>) => {
    setIsLoading(true)
    try {
      const response = await getSheetData(page, filters)
      if (response.success) {
        setData(response.data)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        hasFilters={hasFilters} 
        onClearFilters={() => {
          tableRef.current?.clearAllFilters()
          setHasFilters(false)
          fetchData()
        }} 
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
          isLoading={isLoading}
        />
      </main>
    </div>
  )
}

export default Dashboard