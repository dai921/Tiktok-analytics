'use client'

import { useState, useRef, useLayoutEffect } from 'react'
import { Column } from '@/types/dashboard'

interface ColumnSettingsProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement>
  columns: Column[]
  visibleColumns: string[]
  onColumnVisibilityChange: (columnKey: string, isVisible: boolean, newColumns?: string[]) => void
}

// ヘッダーコンテンツの型を定義
interface HeaderProps {
  props: {
    title: string;
  };
}

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

  const calcPos = (anchor: HTMLElement | null) => {
    if (!anchor) return { top: 0, left: 0 }
    const rect = anchor.getBoundingClientRect()
    const popupWidth = 400 // ポップアップの幅(px)と合わせる
    const yoffset = 10
    return {
      top:  rect.bottom + window.scrollY + yoffset,
      left: rect.right + window.scrollX - popupWidth
    }
  }

  /* ② useLayoutEffect ―― "開いた瞬間だけ" 計算 */
  useLayoutEffect(() => {
    if (!isOpen) return
    // 1回だけ座標を決定
    setPosition(calcPos(anchorRef.current))
  }, [isOpen, anchorRef])   

  if (!isOpen) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[300px]"
      style={{ 
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxHeight: '80vh',
        overflowY: 'auto'
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
        {columns.map((column) => {
          const headerContent = column.header({ column }) as HeaderProps;
          const title = headerContent?.props?.title || column.accessorKey;

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
          );
        })}
      </div>
    </div>
  );
}; 