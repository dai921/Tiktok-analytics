"use client"

import * as React from "react"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  className?: string
  value?: DateRange | undefined
  onChange?: (date: DateRange | undefined) => void
  startLabel?: string
  endLabel?: string
}

export function DateRangePicker({
  className,
  value,
  onChange,
  startLabel = "開始日",
  endLabel = "終了日"
}: DateRangePickerProps) {
  // 日付範囲用の内部状態
  const [startDate, setStartDate] = React.useState<string>(
    value?.from ? format(value.from, "yyyy-MM-dd") : ""
  )
  const [endDate, setEndDate] = React.useState<string>(
    value?.to ? format(value.to, "yyyy-MM-dd") : ""
  )

  // 入力変更ハンドラー
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setStartDate(newValue)
    
    if (newValue) {
      const newStart = new Date(newValue)
      const newRange = {
        from: newStart,
        to: endDate ? new Date(endDate) : undefined
      }
      onChange?.(newRange)
    } else {
      // 開始日が空の場合、終了日だけを設定
      onChange?.(endDate ? { from: undefined, to: new Date(endDate) } : undefined)
    }
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setEndDate(newValue)
    
    if (newValue) {
      const newEnd = new Date(newValue)
      const newRange = {
        from: startDate ? new Date(startDate) : undefined,
        to: newEnd
      }
      onChange?.(newRange)
    } else {
      // 終了日が空の場合、開始日だけを設定
      onChange?.(startDate ? { from: new Date(startDate), to: undefined } : undefined)
    }
  }

  // 値が外部から更新された場合、内部状態を同期
  React.useEffect(() => {
    if (value?.from) {
      setStartDate(format(value.from, "yyyy-MM-dd"))
    }
    if (value?.to) {
      setEndDate(format(value.to, "yyyy-MM-dd"))
    }
  }, [value])

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center gap-2">
        <div className="relative w-full">
          <label className="text-xs text-gray-500 mb-1 block">{startLabel}</label>
          <input
            type="date"
            value={startDate}
            onChange={handleStartDateChange}
            onClick={(e) => {
              // カレンダーを強制的に表示
              const input = e.target as HTMLInputElement;
              input.showPicker();
            }}
            className="w-full px-2 py-1 border rounded text-xs cursor-pointer"
            style={{ colorScheme: 'auto' }}
          />
        </div>
        <div className="relative w-full">
          <label className="text-xs text-gray-500 mb-1 block">{endLabel}</label>
          <input
            type="date"
            value={endDate}
            onChange={handleEndDateChange}
            onClick={(e) => {
              // カレンダーを強制的に表示
              const input = e.target as HTMLInputElement;
              input.showPicker();
            }}
            className="w-full px-2 py-1 border rounded text-xs cursor-pointer"
            style={{ colorScheme: 'auto' }}
          />
        </div>
      </div>
    </div>
  )
} 