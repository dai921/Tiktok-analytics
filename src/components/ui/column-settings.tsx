'use client'

import { useState, useRef, useEffect } from 'react'
import { Column } from '@/types/dashboard'

interface ColumnSettingsProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement>
  columns: Column[]
  visibleColumns: string[]
  onColumnVisibilityChange: (columnKey: string, isVisible: boolean) => void
}

// ヘッダーコンテンツの型を定義
interface HeaderProps {
  props: {
    title: string;
  };
}

// 表示設定から除外するカラムのリスト
const EXCLUDED_COLUMNS = ['description'] // キャプションのaccessorKeyを指定

export const ColumnSettings = ({
  isOpen,
  onClose,
  anchorRef,
  columns,
  visibleColumns,
  onColumnVisibilityChange,
}: ColumnSettingsProps) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  // ポップアップの位置を計算（一度だけ）
  useEffect(() => {
    if (isOpen && anchorRef.current && popupRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect()
      const popupRect = popupRef.current.getBoundingClientRect()
      
      // 固定位置を計算（スクロール位置を含む）
      const top = anchorRect.bottom + window.scrollY + 8
      const left = anchorRect.left + window.scrollX

      // 画面右端をはみ出す場合は左寄せ
      const adjustedLeft = Math.min(
        left,
        window.innerWidth - popupRect.width - 16
      )

      setPosition({ 
        top: top,
        left: adjustedLeft
      })
    }
  }, [isOpen]) // isOpenのみを依存配列に含める

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // 表示設定から除外されたカラムをフィルタリング
  const settableColumns = columns.filter(
    column => !EXCLUDED_COLUMNS.includes(column.accessorKey)
  )

  if (!isOpen) return null

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[300px]"
      style={{ 
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxHeight: '80vh', // ビューポートの80%を最大高さに設定
        overflowY: 'auto'  // 内容が多い場合はスクロール可能に
      }}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">表示カラム設定</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {settableColumns.map((column) => {
          const headerContent = column.header({ column }) as HeaderProps
          const title = headerContent?.props?.title || column.accessorKey

          return (
            <label
              key={column.accessorKey}
              className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.accessorKey)}
                onChange={(e) => onColumnVisibilityChange(column.accessorKey, e.target.checked)}
                className="rounded border-gray-300 text-[#FE2C55] focus:ring-[#FE2C55]"
              />
              <span className="text-sm text-gray-700">{title}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
} 