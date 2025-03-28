'use client';

import React, { useEffect, useState, useRef, useMemo } from "react"
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { LineChart, TimelineDataPoint } from '@/components/ui/line-chart';
import { fetchTrendGenres, fetchTrendTimeline, fetchTrendDates } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TrendTabs } from '@/components/ui/trend-tabs';

export default function TrendsPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  })
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [availableGenres, setAvailableGenres] = useState<Option[]>([])
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['videos_100k_plus'])
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
          
          // デフォルトの日付範囲を設定（直近7回まで）
          const dates = datesResponse.data.map(dateStr => new Date(dateStr))
          dates.sort((a, b) => a.getTime() - b.getTime())
          
          if (dates.length >= 2) {
            // 直近の最大7件の日付に制限
            const recentDates = dates.length <= 7 ? dates : dates.slice(-7)
            
            setDateRange({
              from: recentDates[0],
              to: recentDates[recentDates.length - 1]
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
        const cacheKey = `${startDate}-${endDate}-${selectedGenres.sort().join(',')}-${selectedMetrics.sort().join(',')}`;
        
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
          genres: selectedGenres,
          // すべての指標を常に取得（表示はselectedMetricsで制御）
          metrics: ['view_increase', 'videos_100k_plus', 'total_posts']
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
  }, [dateRange, selectedGenres, selectedMetrics])

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
        const genreData = dateData[genre] || {};
        
        // 選択された指標についてのみデータポイントを作成
        selectedMetrics.forEach(metric => {
          // ジャンル名と指標名を組み合わせたキーを作成
          const dataKey = `${genre}_${metric}`;
          
          // データが存在する場合のみ設定（欠損値は undefined のままにする）
          if (genreData[metric] !== undefined) {
            dataPoint[dataKey] = genreData[metric];
          }
        });
      });
      
      return dataPoint;
    });
  };

  // グラフのシリーズ定義
  const chartSeries = useMemo(() => {
    const series: Array<{key: string, name: string, color?: string, metricType?: string}> = [];
    
    // 指標の表示名マッピング
    const metricLabels: Record<string, string> = {
      'view_increase': '再生増加数',
      'videos_100k_plus': '10万再生以上個数',
      'total_posts': '投稿数'
    };
    
    // 視覚的に区別しやすい30色のパレット（色相を散らした配置）
    const COLORS = [
      "#1f77b4", // 青
      "#d62728", // 赤
      "#2ca02c", // 緑
      "#9467bd", // 紫
      "#ff7f0e", // オレンジ
      "#8c564b", // 茶
      "#e377c2", // ピンク
      "#7f7f7f", // グレー
      "#bcbd22", // 黄緑
      "#17becf", // シアン
      "#ff4500", // オレンジレッド
      "#00aa00", // 深緑
      "#8a2be2", // ブルーバイオレット
      "#a0522d", // シエナ
      "#00ced1", // ターコイズ
      "#ff69b4", // ホットピンク
      "#4682b4", // スティールブルー
      "#dc3912", // 赤茶
      "#32cd32", // ライムグリーン
      "#9932cc", // ダークオーキッド
      "#ffd700", // ゴールド
      "#696969", // ディムグレー
      "#ff1493", // ディープピンク
      "#006400", // ダークグリーン
      "#00008b", // ダークブルー
      "#ff8c00", // ダークオレンジ
      "#ba55d3", // ミディアムオーキッド
      "#556b2f", // ダークオリーブグリーン
      "#daa520", // ゴールデンロッド
      "#20b2aa"  // ライトシーグリーン
    ];
    
    // ジャンルごとに色を割り当てる
    const genreColors: Record<string, string> = {};
    selectedGenres.forEach((genre, index) => {
      genreColors[genre] = COLORS[index % COLORS.length];
    });
    
    // 選択されたジャンルと指標の組み合わせでシリーズを作成
    selectedGenres.forEach(genre => {
      selectedMetrics.forEach(metric => {
        series.push({
          key: `${genre}_${metric}`,
          name: `${genre} (${metricLabels[metric]})`,
          color: genreColors[genre], // 同じジャンルには同じ色を割り当てる
          metricType: metric // 指標タイプを設定
        });
      });
    });
    
    return series;
  }, [selectedGenres, selectedMetrics]);

  // 選択した日付範囲とジャンルに基づいてグラフを表示するかの判定
  const shouldShowChart = !isLoading && dateRange.from && dateRange.to && selectedGenres.length > 0;

  const handleDateRangeChange = (newRange: DateRange) => {
    setDateRange(newRange)
  }

  const handleGenresChange = (newSelected: string[]) => {
    setSelectedGenres(newSelected)
  }

  const handleMetricsChange = (metric: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedMetrics(prev => [...prev, metric]);
    } else {
      // 少なくとも1つの指標は選択されている必要がある
      if (selectedMetrics.length > 1) {
        setSelectedMetrics(prev => prev.filter(m => m !== metric));
      }
    }
  };

  if (isLoading) {
    return <div className="p-6">データを読み込み中...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">トレンド分析</h1>
      
      <TrendTabs />
      
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
      
      <div className="flex gap-6 mb-6">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="metric-view-increase" 
            checked={selectedMetrics.includes('view_increase')}
            onCheckedChange={(checked) => 
              handleMetricsChange('view_increase', checked as boolean)
            }
          />
          <Label htmlFor="metric-view-increase">再生増加数</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="metric-100k-plus" 
            checked={selectedMetrics.includes('videos_100k_plus')}
            onCheckedChange={(checked) => 
              handleMetricsChange('videos_100k_plus', checked as boolean)
            }
          />
          <Label htmlFor="metric-100k-plus">10万再生以上個数</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="metric-total-posts" 
            checked={selectedMetrics.includes('total_posts')}
            onCheckedChange={(checked) => 
              handleMetricsChange('total_posts', checked as boolean)
            }
          />
          <Label htmlFor="metric-total-posts">投稿数</Label>
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
            <h2 className="text-xl font-medium mb-4">トレンド指標の推移</h2>
            <LineChart 
              data={timelineData}
              series={chartSeries}
              xAxisLabel="日付"
              yAxisLabel="値"
              height={400}
              showLegend={false}
              highlightSameGroup={true}
              useMultipleYAxis={true}
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
