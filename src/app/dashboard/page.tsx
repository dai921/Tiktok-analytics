'use client'

import React from 'react'
import { Logo } from '@/components/ui/logo'
import { mockData } from '@/lib/mock-data'
import { DataTable } from '@/components/dashboard/data-table'

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between">
          <Logo className="w-48" />
          <button className="inline-flex items-center px-2.5 py-1.5 text-xs border rounded hover:bg-gray-50 text-gray-600">
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        <DataTable initialData={mockData} />
      </main>
    </div>
  )
}

export default Dashboard