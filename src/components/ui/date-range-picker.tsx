"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"

// CalendarIconコンポーネント
const CalendarIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

interface DateRangePickerProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  onDateRangeChange: (dateRange: { start: Date; end: Date }) => void;
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  // 日付を文字列形式に変換
  const startDateStr = dateRange?.start ? format(dateRange.start, 'yyyy-MM-dd') : '';
  const endDateStr = dateRange?.end ? format(dateRange.end, 'yyyy-MM-dd') : '';
  
  // 開始日の変更ハンドラ
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartStr = e.target.value;
    if (!newStartStr) return;
    
    const newStart = parse(newStartStr, 'yyyy-MM-dd', new Date());
    onDateRangeChange({
      start: newStart,
      end: dateRange.end
    });
  };
  
  // 終了日の変更ハンドラ
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndStr = e.target.value;
    if (!newEndStr) return;
    
    const newEnd = parse(newEndStr, 'yyyy-MM-dd', new Date());
    onDateRangeChange({
      start: dateRange.start,
      end: newEnd
    });
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">開始日</label>
        <input
          type="date"
          className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-[140px] py-1.5 text-sm border-gray-300 border rounded-md shadow-sm"
          value={startDateStr}
          onChange={handleStartDateChange}
        />
      </div>
      
      <span className="text-gray-500 mt-5">〜</span>
      
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">終了日</label>
        <input
          type="date"
          className="focus:ring-[#FE2C55] focus:border-[#FE2C55] block w-[140px] py-1.5 text-sm border-gray-300 border rounded-md shadow-sm"
          value={endDateStr}
          onChange={handleEndDateChange}
        />
      </div>
    </div>
  );
} 