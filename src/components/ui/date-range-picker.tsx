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
          <div className="p-3 space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="from-date">開始日</Label>
              <Calendar
                id="from-date"
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => {
                  const newRange = { ...dateRange, from: date }
                  // 開始日が終了日より後の場合、終了日を開始日に合わせる
                  if (date && dateRange.to && date > dateRange.to) {
                    newRange.to = date
                  }
                  onDateRangeChange(newRange)
                }}
                disabled={(date) => 
                  dateRange.to ? date > dateRange.to : false
                }
                locale={ja}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="to-date">終了日</Label>
              <Calendar
                id="to-date"
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => {
                  const newRange = { ...dateRange, to: date }
                  // 終了日が開始日より前の場合、開始日を終了日に合わせる
                  if (date && dateRange.from && date < dateRange.from) {
                    newRange.from = date
                  }
                  onDateRangeChange(newRange)
                }}
                disabled={(date) => 
                  dateRange.from ? date < dateRange.from : false
                }
                locale={ja}
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
} 