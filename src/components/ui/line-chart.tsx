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
  highlightSameGroup?: boolean
}

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
]

export function LineChart({
  data,
  series,
  xAxisLabel = "日付",
  yAxisLabel = "数値",
  height = 400,
  className,
  showLegend = false,
  highlightSameGroup = false,
}: LineChartProps) {
  
  // アクティブなシリーズを追跡する状態を追加
  const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
  // アクティブなグループ（ジャンル）を追跡
  const [activeGroupPrefix, setActiveGroupPrefix] = useState<string | null>(null);
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
  
  // アクティブなシリーズキーからグループプレフィックスを抽出する関数
  const getGroupPrefixFromKey = (key: string) => {
    // キーは "ジャンル_指標" の形式なので、最初の_までを抽出
    return key.split('_')[0];
  };

  // シリーズがアクティブグループに属しているかをチェック
  const isInActiveGroup = (seriesKey: string) => {
    if (!activeGroupPrefix || !highlightSameGroup) return true;
    return seriesKey.startsWith(`${activeGroupPrefix}_`);
  };

  // シリーズグループの強調表示イベント
  const handleSeriesMouseOver = (seriesKey: string) => {
    setActiveSeriesKey(seriesKey);
    if (highlightSameGroup) {
      setActiveGroupPrefix(getGroupPrefixFromKey(seriesKey));
    }
    setShouldShowTooltip(true);
  };

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
    setActiveGroupPrefix(null);
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
              strokeWidth={activeSeriesKey ? 
                (isInActiveGroup(s.key) ? 3 : 1) : 2}
              opacity={activeSeriesKey ? 
                (isInActiveGroup(s.key) ? 1 : 0.3) : 1}
              dot={{ 
                r: 3,
                strokeWidth: activeSeriesKey && !isInActiveGroup(s.key) ? 0 : 1,
                fill: activeSeriesKey && !isInActiveGroup(s.key) ? 'transparent' : s.color || COLORS[index % COLORS.length] 
              }}
              activeDot={{ 
                r: 6,
                onMouseOver: () => {
                  handleSeriesMouseOver(s.key);
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