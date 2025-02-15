'use client'

import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { usePathname } from "next/navigation"

interface HeaderProps {
  hasFilters?: boolean
  onClearFilters?: () => void
}

export function Header({ hasFilters, onClearFilters }: HeaderProps) {
  const pathname = usePathname()
  const showFilterClear = pathname === '/dashboard' && hasFilters

  return (
    <header className="border-b bg-white">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <Logo className="w-48" />
        </div>
        <div className="flex items-center gap-4">
          {showFilterClear && (
            <button
              onClick={onClearFilters}
              className="inline-flex items-center px-2.5 py-1.5 text-xs border border-red-200 rounded hover:bg-red-50 text-red-500"
            >
              フィルターを全てクリア
            </button>
          )}
          <button className="text-sm text-gray-500 hover:text-gray-700">
            ログアウト
          </button>
        </div>
      </div>
    </header>
  )
} 