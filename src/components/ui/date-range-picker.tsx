"use client"

import * as React from "react"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export type DateRange = {
  from: Date | undefined
  to: Date | undefined
}

type DateRangePickerProps = {
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
}: DateRangePickerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

  // 日付表示フォーマット
  const formatDate = (date: Date | undefined) => {
    if (!date) return ""
    return format(date, "yyyy年MM月dd日", { locale: ja })
  }

  // 表示するラベル
  const getDisplayText = () => {
    if (dateRange.from && dateRange.to) {
      return `${formatDate(dateRange.from)} 〜 ${formatDate(dateRange.to)}`
    }
    if (dateRange.from) {
      return `${formatDate(dateRange.from)} から`
    }
    if (dateRange.to) {
      return `${formatDate(dateRange.to)} まで`
    }
    return "日付範囲を選択"
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date-range"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !dateRange.from && !dateRange.to && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {getDisplayText()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-1">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange.from}
              selected={dateRange}
              onSelect={(newRange) => {
                onDateRangeChange(newRange)
              }}
              numberOfMonths={2}
              classNames={{
                day_range_end: "day-range-end",
                day_range_start: "day-range-start",
                day_range_middle: "day-range-middle",
                day: "h-7 w-7 text-xs p-0 focus-within:w-7 focus-within:h-7",
                day_today: "day-today",
                cell: "h-8 w-8 p-0 relative",
                head_cell: "text-xs font-normal",
                months: "space-y-2",
                month: "space-y-2",
                caption: "text-sm flex justify-center pt-1 relative items-center",
                nav_button: "h-5 w-5",
                table: "w-full border-collapse space-y-1",
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button 
              size="sm" 
              onClick={() => setIsPopoverOpen(false)}
            >
              完了
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
} 