"use client"

import * as React from "react"
import { format, isValid } from "date-fns"
import { ja } from "date-fns/locale"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
)

interface DateRangePickerProps {
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  onApply?: (range: { start: Date; end: Date }) => void;
  singleCalendar?: boolean;
}

export function DateRangePicker({ 
  dateRange, 
  onDateRangeChange,
  onApply,
  singleCalendar = false
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localRange, setLocalRange] = useState<{ start: Date; end: Date }>(dateRange);

  // ポップアップが開くたびにdateRangeから値を更新
  React.useEffect(() => {
    if (isOpen) {
      setLocalRange(dateRange);
    }
  }, [isOpen, dateRange]);

  // 日付をYYYY-MM-DD形式に変換する関数
  const formatDateForInput = (date: Date) => {
    console.log('formatDateForInput ->', date);   // ★追加
    if (!date || !isValid(date)) return ""; 
    return date.toISOString().split('T')[0];
  };

  // 開始日付の変更ハンドラー
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const newStart = new Date(e.target.value);
      const newRange = {
        start: newStart,
        end: localRange.end < newStart ? newStart : localRange.end,
      };
      setLocalRange(newRange);
      onDateRangeChange(newRange);
    }
  };

  // 終了日付の変更ハンドラー
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const newEnd = new Date(e.target.value);
      const newRange = {
        start: localRange.start > newEnd ? newEnd : localRange.start,
        end: newEnd,
      };
      setLocalRange(newRange);
      onDateRangeChange(newRange);
    }
  };

  const handleApply = () => {
    if (onApply) {
      onApply(localRange);
    }
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal">
          <span>
            {isValid(dateRange.start) ? format(dateRange.start, "yyyy年MM月dd日") : "―"} 〜
            {isValid(dateRange.end)   ? format(dateRange.end,   "yyyy年MM月dd日") : "―"}
          </span>
          <CalendarIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon />
              </div>
              <input
                type="date"
                className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full pl-10 sm:text-sm border-gray-300 border rounded-md shadow-sm"
                value={formatDateForInput(localRange.start)}
                onChange={handleStartDateChange}
                max={formatDateForInput(localRange.end)}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon />
              </div>
              <input
                type="date"
                className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-full pl-10 sm:text-sm border-gray-300 border rounded-md shadow-sm"
                value={formatDateForInput(localRange.end)}
                onChange={handleEndDateChange}
                min={formatDateForInput(localRange.start)}
              />
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
            キャンセル
          </Button>
          <Button variant="default" size="sm" onClick={handleApply}>
            適用
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
} 