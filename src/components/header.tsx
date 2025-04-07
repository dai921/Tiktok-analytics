'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from '@/lib/auth-context'
import { useUserInfo } from '@/lib/use-user-info'
import { UserIcon } from 'lucide-react'
import { useFilter } from '@/lib/filter-context'

interface HeaderProps {
  showFilterClear?: boolean
}

export function Header({ showFilterClear = false }: HeaderProps) {
  const { hasFilters, onClearFilters } = useFilter()
  const { userInfo, isLoading } = useUserInfo()
  const showClearButton = showFilterClear && hasFilters && onClearFilters

  return (
    <header className="border-b bg-black text-white">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-4">
          {showClearButton && (
            <button
              onClick={onClearFilters}
              className="ml-6 inline-flex items-center px-3 py-2 text-sm border border-red-400 rounded hover:bg-red-900 text-red-300"
            >
              フィルターを全てクリア
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <UserIcon size={20} className="text-gray-300" />
          <span className="text-base font-medium">
            {isLoading ? '読み込み中...' : userInfo?.name || 'ゲスト'}
          </span>
        </div>
      </div>
    </header>
  )
} 