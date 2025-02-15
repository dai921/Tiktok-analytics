'use client'

import React, { useState, useRef } from 'react'
import { mockData } from '@/lib/mock-data'
import { DataTable } from '@/components/dashboard/data-table'
import { Header } from "@/components/header"

const Dashboard = () => {
  const [hasFilters, setHasFilters] = useState(false)
  const tableRef = useRef<{ clearAllFilters: () => void } | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        hasFilters={hasFilters} 
        onClearFilters={() => {
          tableRef.current?.clearAllFilters()
        }} 
      />
      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        <DataTable 
          ref={tableRef}
          initialData={mockData} 
          onFilterChange={setHasFilters}
        />
      </main>
    </div>
  )
}

export default Dashboard