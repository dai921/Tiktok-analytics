"use client"

import React, { useMemo } from "react"
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts"

export type TimelineDataPoint = {
  date: string
  [key: string]: number | string
}

type LineChartProps = {
  data: TimelineDataPoint[]
  series: {
    key: string
    name: string
    color?: string
  }[]
  xAxisLabel?: string
  yAxisLabel?: string
  height?: number | string
  className?: string
}

// 色のプリセット
const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088fe",
  "#00C49F", "#FFBB28", "#FF8042", "#a4de6c", "#d0ed57"
]

export function LineChart({
  data,
  series,
  xAxisLabel = "日付",
  yAxisLabel = "数値",
  height = 400,
  className,
}: LineChartProps) {
  
  // データの前処理（日付順にソート）
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateA - dateB
    })
  }, [data])
  
  // 日本語フォーマットの日付に変換
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  }
  
  // Y軸のフォーマット (大きな数値を省略形式で表示)
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value
  }
  
  // ツールチップのカスタムフォーマット
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border shadow-md rounded-md text-sm">
          <p className="font-medium mb-2">{formatDate(label)}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={`tooltip-${index}`} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium">{entry.name}: </span>
                <span>{Number(entry.value).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  // データが空の場合の表示
  if (data.length === 0 || series.length === 0) {
    return (
      <div className="flex items-center justify-center border rounded-md bg-muted/50" style={{ height }}>
        <p className="text-muted-foreground">表示できるデータがありません</p>
      </div>
    )
  }

  // 各ジャンルのシリーズ設定を作成
  const chartSeries = series
    .filter(s => {
      // データが1つでも存在するジャンルのみをフィルタリング
      return data.some(point => point[s.key] !== undefined && point[s.key] !== null);
    })
    .map(s => ({
      name: s.name,
      data: data.map(point => point[s.key] || null), // 存在しない値はnullで
    }))

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart
          data={sortedData}
          margin={{ top: 10, right: 30, left: 20, bottom: 30 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            label={{ value: xAxisLabel, position: 'insideBottomRight', offset: -10 }}
            padding={{ left: 20, right: 20 }}
          />
          <YAxis 
            tickFormatter={formatYAxis}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36} />
          
          {chartSeries.map((s, index) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              name={s.name}
              stroke={series[index].color || COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
} 