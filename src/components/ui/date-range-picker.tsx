"use client"

import * as React from "react"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { CalendarIcon } from 'lucide-react'

interface DateRangePickerProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  onDateRangeChange: (dateRange: { start: Date; end: Date }) => void;
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !dateRange && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange?.start ? (
            dateRange.end ? (
              <>
                {format(dateRange.start, 'yyyy年MM月dd日', { locale: ja })} -{' '}
                {format(dateRange.end, 'yyyy年MM月dd日', { locale: ja })}
              </>
            ) : (
              format(dateRange.start, 'yyyy年MM月dd日', { locale: ja })
            )
          ) : (
            <span>日付を選択</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.start}
          selected={{
            from: dateRange.start,
            to: dateRange.end
          }}
          onSelect={(range) => {
            if (range?.from && range?.to) {
              onDateRangeChange({ start: range.from, end: range.to });
            }
          }}
          numberOfMonths={2}
          locale={ja}
        />
      </PopoverContent>
    </Popover>
  );
} 