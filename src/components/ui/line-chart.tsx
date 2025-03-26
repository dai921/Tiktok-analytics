"use client"

import React, { useMemo, useState, useRef, useEffect } from "react"
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps
} from "recharts"
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

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
  showLegend?: boolean
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
  showLegend = true,
}: LineChartProps) {
  
  // アクティブなシリーズを追跡する状態を追加
  const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
  // ツールチップを表示すべきかのフラグ
  const [shouldShowTooltip, setShouldShowTooltip] = useState<boolean>(false);
  // X軸ラベル上にマウスがあるかのフラグ
  const [isOverXAxisLabel, setIsOverXAxisLabel] = useState<boolean>(false);
  // グラフ全体の参照
  const chartRef = useRef<HTMLDivElement>(null);
  
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
  
  // X軸の日付ラベル要素を監視して、マウスイベントを設定
  useEffect(() => {
    if (chartRef.current) {
      // SVG内のtext要素（日付ラベル）を取得
      const textElements = chartRef.current.querySelectorAll('.recharts-cartesian-axis-tick-value text');
      
      // 各テキスト要素にイベントリスナーを追加
      textElements.forEach(element => {
        element.addEventListener('mouseenter', () => {
          setIsOverXAxisLabel(true);
          setShouldShowTooltip(true);
        });
        
        element.addEventListener('mouseleave', () => {
          setIsOverXAxisLabel(false);
          if (!activeSeriesKey) {
            setShouldShowTooltip(false);
          }
        });
      });
      
      // クリーンアップ関数
      return () => {
        textElements.forEach(element => {
          element.removeEventListener('mouseenter', () => {});
          element.removeEventListener('mouseleave', () => {});
        });
      };
    }
  }, [activeSeriesKey, data]); // データが変わったときに再設定
  
  // ツールチップのカスタムフォーマット
  const CustomTooltip = ({ 
    active, 
    payload, 
    label,
    coordinate
  }: TooltipProps<ValueType, NameType> & { 
    coordinate?: { x: number, y: number }
  }) => {
    // ツールチップを表示する条件
    if (active && payload && payload.length && shouldShowTooltip) {
      // 表示するデータの決定
      let displayPayload = [...payload];
      
      if (!isOverXAxisLabel && activeSeriesKey) {
        displayPayload = payload.filter((entry) => 
          entry.dataKey === activeSeriesKey
        );
      }
      
      // 全データ表示時は値の大きい順にソート
      if (isOverXAxisLabel) {
        displayPayload.sort((a, b) => {
          const valueA = a.value as number;
          const valueB = b.value as number;
          return valueB - valueA;
        });
      }

      // ツールチップの位置調整
      let tooltipStyle: React.CSSProperties = {};
      if (coordinate) {
        const chartWidth = chartRef.current?.getBoundingClientRect().width || 600;
        const isNearRightEdge = coordinate.x > chartWidth * 0.7;
        
        if (isNearRightEdge) {
          tooltipStyle.right = 0;
        } else {
          tooltipStyle.left = 0;
        }
      }
      
      return (
        <div 
          className="bg-white p-4 border shadow-md rounded-md text-sm absolute"
          style={{
            ...tooltipStyle,
            transform: `translate(${coordinate?.x}px, ${(coordinate?.y || 0) - 30}px)`, // ツールチップをより上に配置
            pointerEvents: 'none',
            minWidth: '300px', // 幅をさらに広げる
            maxWidth: '450px'
          }}
        >
          <p className="font-medium mb-2">{formatDate(label as string)}</p>
          <div className="space-y-1">
            {displayPayload.map((entry, index) => (
              <div key={`tooltip-${index}`} className="flex items-center">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0 mr-2" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium flex-shrink-0 w-32 text-xs">{entry.name}:</span>
                <span className="flex-grow text-right">{Number(entry.value).toLocaleString()}</span>
              </div>
            ))}
          </div>
          {isOverXAxisLabel && (
            <div className="text-xs mt-2 text-gray-500">
              （日付ラベル上：全データ表示中）
            </div>
          )}
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

  // マウスがグラフエリアを離れたときのハンドラー
  const handleMouseLeave = () => {
    setActiveSeriesKey(null);
    setShouldShowTooltip(false);
    setIsOverXAxisLabel(false);
  };

  return (
    <div 
      className={`${className} relative`} 
      ref={chartRef}
      onMouseLeave={handleMouseLeave}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart
          data={sortedData}
          margin={{ top: 10, right: 40, left: 20, bottom: 35 }}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            label={{ 
              value: xAxisLabel, 
              position: 'insideBottomRight',
              offset: -15,
              dy: 15,
              style: { textAnchor: 'end' }
            }}
            padding={{ left: 20, right: 20 }}
            tick={{ dy: 5 }}
            interval={'preserveStartEnd'}
          />
          <YAxis 
            tickFormatter={formatYAxis}
            label={{ 
              value: yAxisLabel, 
              angle: -90, 
              position: 'insideLeft',
              offset: -15
            }} 
          />
          <Tooltip 
            content={<CustomTooltip />} 
            position={{ x: 0, y: 0 }}
            cursor={{ stroke: '#ccc', strokeWidth: 1 }}
          />
          {showLegend && <Legend verticalAlign="top" height={36} />}
          
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color || COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ 
                r: 6,
                onMouseOver: () => {
                  setActiveSeriesKey(s.key);
                  setShouldShowTooltip(true);
                },
                onMouseOut: () => {
                  if (!isOverXAxisLabel) {
                    setShouldShowTooltip(false);
                  }
                }
              }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
} 