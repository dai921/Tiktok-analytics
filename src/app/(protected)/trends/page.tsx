'use client';

import React, { useEffect, useState } from "react"
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { LineChart } from '@/components/ui/line-chart';
import { fetchTrendGenres, fetchTrendTimeline, fetchTrendDates } from '@/lib/api';

export default function TrendsPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  })
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [availableGenres, setAvailableGenres] = useState<Option[]>([])
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [timelineData, setTimelineData] = useState<any>(null)

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true)
        
        console.log('初期データ読み込み開始');
        
        // 利用可能な日付とジャンルを取得
        const [datesResponse, genresResponse] = await Promise.all([
          fetchTrendDates(),
          fetchTrendGenres()
        ])
        
        console.log('ジャンルデータレスポンス:', genresResponse);
        
        if (datesResponse.success && datesResponse.data.length > 0) {
          setAvailableDates(datesResponse.data)
          
          // デフォルトの日付範囲を設定（全期間）
          const dates = datesResponse.data.map(dateStr => new Date(dateStr))
          dates.sort((a, b) => a.getTime() - b.getTime())
          
          if (dates.length >= 2) {
            setDateRange({
              from: dates[0],
              to: dates[dates.length - 1]
            })
          }
        }
        
        if (genresResponse.success) {
          console.log('利用可能なジャンル:', genresResponse.data);
          
          // ジャンルをOption形式に変換
          const genreOptions = genresResponse.data.map(genre => ({
            value: genre,
            label: genre
          }))
          
          console.log('変換後のジャンルオプション:', genreOptions);
          setAvailableGenres(genreOptions)
          
          // デフォルトですべてのジャンルを選択
          if (genreOptions.length > 0) {
            const initialSelected = genreOptions.map(option => option.value)
            setSelectedGenres(initialSelected)
            console.log('初期選択ジャンル:', initialSelected);
          }
        } else {
          console.error('ジャンルデータの取得に失敗:', genresResponse.error);
        }
      } catch (error) {
        console.error("初期データの読み込みに失敗しました", error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadInitialData()
  }, [])

  useEffect(() => {
    // 日付範囲とジャンルが選択されたらデータを取得
    const fetchTimelineData = async () => {
      if (!dateRange.from || !dateRange.to || selectedGenres.length === 0) {
        return
      }

      try {
        const fromDate = dateRange.from.toISOString().split('T')[0]
        const toDate = dateRange.to.toISOString().split('T')[0]
        
        const response = await fetchTrendTimeline({
          start_date: fromDate,
          end_date: toDate,
          genres: selectedGenres
        })
        
        if (response.success) {
          setTimelineData(response.data)
        }
      } catch (error) {
        console.error("トレンドデータの取得に失敗しました", error)
      }
    }
    
    fetchTimelineData()
  }, [dateRange, selectedGenres])

  const handleDateRangeChange = (newRange: DateRange) => {
    setDateRange(newRange)
  }

  const handleGenresChange = (newSelected: string[]) => {
    setSelectedGenres(newSelected)
  }

  if (isLoading) {
    return <div className="p-6">データを読み込み中...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">トレンド分析</h1>
      
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div>
          <label className="text-sm font-medium mb-2 block">期間選択</label>
          <DateRangePicker 
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">ジャンル選択</label>
          <MultiSelect 
            options={availableGenres}
            selected={selectedGenres}
            onChange={handleGenresChange}
            placeholder="ジャンルを選択"
            emptyMessage="ジャンルが見つかりません"
          />
        </div>
      </div>
      
      {/* ここにLineChartを追加する予定 */}
      {timelineData ? (
        <Card className="p-4">
          <p className="text-center">グラフ表示エリア</p>
          <p className="text-xs text-muted-foreground text-center">
            (LineChartコンポーネントはまだ実装されていません)
          </p>
        </Card>
      ) : (
        <Card className="p-4 text-center">
          <p>データが選択されていません</p>
          <p className="text-xs text-muted-foreground">
            期間とジャンルを選択してください
          </p>
        </Card>
      )}
    </div>
  )
}
