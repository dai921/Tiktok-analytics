'use client';

import React, { useEffect, useState, useRef } from "react"
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { LineChart, TimelineDataPoint } from '@/components/ui/line-chart';
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
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false)
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  // キャッシュを保持する
  const dataCache = useRef<Record<string, any>>({});

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
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
          setError('ジャンルデータの取得に失敗しました');
        }
      } catch (error) {
        console.error("初期データの読み込みに失敗しました", error)
        setError('データの読み込みに失敗しました');
      } finally {
        setIsLoading(false)
      }
    }
    
    loadInitialData()
  }, [])

  useEffect(() => {
    // 日付範囲とジャンルが選択されていれば、タイムラインデータを取得
    const fetchTimelineData = async () => {
      if (!dateRange.from || !dateRange.to || selectedGenres.length === 0) {
        setTimelineData([])
        return
      }

      try {
        setIsLoadingChart(true)
        setError(null)
        
        // キャッシュキーを作成
        const startDate = dateRange.from.toISOString().split('T')[0];
        const endDate = dateRange.to.toISOString().split('T')[0];
        const cacheKey = `${startDate}-${endDate}-${selectedGenres.sort().join(',')}`;
        
        // キャッシュにデータがあればそれを使用
        if (dataCache.current[cacheKey]) {
          console.log('キャッシュからデータを取得');
          setTimelineData(dataCache.current[cacheKey]);
          setIsLoadingChart(false);
          return;
        }
        
        const params = {
          start_date: startDate,
          end_date: endDate,
          genres: selectedGenres
        };
        
        const response = await fetchTrendTimeline(params);
        
        if (response.success) {
          const formattedData = formatTimelineData(response.data);
          // キャッシュに保存
          dataCache.current[cacheKey] = formattedData;
          setTimelineData(formattedData);
        } else {
          console.error('タイムラインデータの取得に失敗:', response.error);
          setError('データの取得に失敗しました');
          setTimelineData([])
        }
      } catch (error) {
        console.error('タイムラインデータの取得中にエラーが発生しました:', error);
        setError('データの取得中にエラーが発生しました');
        setTimelineData([])
      } finally {
        setIsLoadingChart(false)
      }
    }
    
    fetchTimelineData()
  }, [dateRange, selectedGenres])

  // APIレスポンスからグラフ用のデータ形式に変換する関数
  const formatTimelineData = (apiData: any): TimelineDataPoint[] => {
    if (!apiData) return [];
    
    // 日付の配列を作成
    const dates = Object.keys(apiData).sort();
    
    // 各日付のデータを変換
    return dates.map(date => {
      // 基本データポイントを作成（日付）
      const dataPoint: TimelineDataPoint = { date };
      const dateData = apiData[date] || {};
      
      // 選択されたすべてのジャンルについてデータポイントを作成
      selectedGenres.forEach(genre => {
        // 対象のジャンルデータが存在する場合のみ設定（0は設定しない）
        if (dateData[genre]?.view_increase) {
          dataPoint[genre] = dateData[genre].view_increase;
        }
        // 0値の場合は、そのジャンルのプロパティを設定しない
      });
      
      return dataPoint;
    });
  };

  // グラフのシリーズ定義
  const chartSeries = selectedGenres.map(genre => ({
    key: genre,
    name: genre
  }));

  // 選択した日付範囲とジャンルに基づいてグラフを表示するかの判定
  const shouldShowChart = !isLoading && dateRange.from && dateRange.to && selectedGenres.length > 0;

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
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
          <p>{error}</p>
        </div>
      )}
      
      <Card className="p-4">
        {isLoadingChart ? (
          <div className="flex items-center justify-center h-[400px]">
            <p>グラフデータを読み込み中...</p>
          </div>
        ) : shouldShowChart && timelineData.length > 0 ? (
          <>
            <h2 className="text-xl font-medium mb-4">視聴回数増加数の推移</h2>
            <LineChart 
              data={timelineData}
              series={chartSeries}
              xAxisLabel="日付"
              yAxisLabel="視聴回数増加数"
              height={400}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-[400px]">
            <p className="text-muted-foreground">
              {selectedGenres.length === 0 
                ? 'ジャンルを選択してください'
                : !dateRange.from || !dateRange.to
                ? '期間を選択してください'
                : 'データがありません'}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
