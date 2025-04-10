'use client'

import { useState, useRef, useEffect } from 'react'
import { Column } from '@/types/dashboard'
import { Button } from "@/components/ui/button"
import { SaveIcon, RotateCcw } from "lucide-react"
import { displaySettingsApi } from '@/lib/display_settings_api'
import { toast } from "@/hooks/use-toast"

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

// デフォルト設定のカラム
const defaultColumns = [
  'thumbnail_url',    // サムネイル
  'category',         // 動画ジャンル
  'product',         // 商品名
  'createdAt',       // 投稿日
  'views',           // 再生数
  'viewsIncrease',   // 再生増加数
  'ten_days_increase', // 10日間再生増加数
  'likes',           // いいね数
  'comments',        // コメント数
  'account_name',    // アカウント名
  'hashtags',        // ハッシュタグ
  'audioTitle',      // BGM
]

export const ColumnSettings = ({
  isOpen,
  onClose,
  anchorRef,
  columns,
  visibleColumns,
  onColumnVisibilityChange,
}: ColumnSettingsProps) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isSaving, setIsSaving] = useState(false)
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
  }, [isOpen])

  // デフォルト設定を適用する処理
  const handleApplyDefault = () => {
    // デフォルト設定のカラムを一括で更新
    defaultColumns.forEach(columnKey => {
      const isCurrentlyVisible = visibleColumns.includes(columnKey);
      const shouldBeVisible = defaultColumns.includes(columnKey);
      
      // 現在の状態と異なる場合のみ更新
      if (isCurrentlyVisible !== shouldBeVisible) {
        onColumnVisibilityChange(columnKey, shouldBeVisible);
      }
    });

    // デフォルトに含まれていないカラムを非表示に
    columns
      .map(col => col.accessorKey)
      .filter(key => !defaultColumns.includes(key))
      .forEach(key => {
        if (visibleColumns.includes(key)) {
          onColumnVisibilityChange(key, false);
        }
      });
  };

  // 設定保存処理
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      const settings = {
        is_default: false,
        columns: columns.map((column, index) => ({
          column_name: column.accessorKey,
          is_visible: visibleColumns.includes(column.accessorKey),
          display_order: index
        }))
      };

      const response = await displaySettingsApi.saveSettings(settings);

      if (response.success) {
        toast({
          title: "設定を保存しました",
          description: "表示設定が正常に保存されました。",
        });
        onClose();
      } else {
        throw new Error(response.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('設定保存エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "設定の保存に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

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

      <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
        <Button
          onClick={handleApplyDefault}
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          デフォルト設定に戻す
        </Button>
        
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2"
        >
          <SaveIcon className="h-4 w-4" />
          {isSaving ? "保存中..." : "設定を保存"}
        </Button>
      </div>
    </div>
  );
}; 