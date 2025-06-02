"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export type Option = {
  label: string
  value: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  onApply?: () => void
  placeholder?: string
  emptyMessage?: string
  className?: string
  maxDisplay?: number
}

export function MultiSelect({
  options,
  selected,
  onChange,
  onApply,
  placeholder = "項目を選択",
  emptyMessage = "選択できる項目がありません",
  className,
  maxDisplay = 3,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(item => item !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleRemove = (value: string) => {
    onChange(selected.filter(item => item !== value))
  }

  const handleApply = () => {
    if (onApply) {
      onApply();
      setOpen(false);
    }
  }

  // 選択された項目のラベルを取得
  const getSelectedLabels = () => {
    return selected.map(value => {
      const option = options.find(opt => opt.value === value)
      return option?.label || value
    })
  }

  // 表示用のラベル
  const selectedLabels = getSelectedLabels()
  const displayCount = Math.min(maxDisplay, selectedLabels.length)
  const remainingCount = selectedLabels.length - displayCount

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex flex-wrap gap-1 items-center">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <>
                {selectedLabels.slice(0, displayCount).map((label) => (
                  <Badge key={label} variant="secondary" className="mr-1">
                    {label}
                  </Badge>
                ))}
                {remainingCount > 0 && (
                  <Badge variant="secondary">+{remainingCount}</Badge>
                )}
              </>
            )}
          </div>
          <X
            className={cn(
              "h-4 w-4 shrink-0 opacity-50",
              selectedLabels.length === 0 && "hidden"
            )}
            onClick={(e) => {
              e.stopPropagation()
              onChange([])
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={`${placeholder}を検索...`} />
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option.value)
              return (
                <CommandItem
                  key={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    checked={isSelected}
                    className="mr-2"
                    onCheckedChange={() => handleSelect(option.value)}
                  />
                  {option.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </Command>
        <div className="flex items-center justify-between p-2 border-t">
          <div className="text-sm text-muted-foreground min-w-[100px]">
            {selected.length} / {options.length} 選択中
          </div>
          <div className="flex gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onChange(options.map(option => option.value))
              }}
              disabled={selected.length === options.length}
            >
              すべて選択
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onChange([])
              }}
              disabled={selected.length === 0}
            >
              すべて解除
            </Button>
            {onApply && (
              <Button
                size="sm"
                onClick={handleApply}
                className="bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white"
              >
                適用
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
} 