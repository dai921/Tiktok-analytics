'use client'

import { useState, useEffect } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

// 環境変数のAPIのベースURLを使用
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface PlayCountHistoryGraphProps {
  videoUrl: string
}

interface PlayCountData {
  collection_date: string
  play_count_increase: number
}

export function PlayCountHistoryGraph({ videoUrl }: PlayCountHistoryGraphProps) {
  const [data, setData] = useState<PlayCountData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const id = videoUrl.match(/\/video\/(\d+)/)?.[1] || videoUrl.split('/').pop()
        
        console.log('動画URL解析:', {
          originalUrl: videoUrl,
          extractedId: id,
          urlParts: videoUrl.split('/'),
          isNumeric: /^\d+$/.test(id || ''),
          length: id?.length
        })
        
        if (!id || !/^\d+$/.test(id)) {
          throw new Error('有効な動画IDが取得できません')
        }

        // APIのベースURLを使用して完全なURLを構築
        const apiUrl = `${API_BASE_URL}/api/video/play-count-history/${id}`
        console.log('API呼び出し開始:', {
          url: apiUrl,
          id: id,
          idType: typeof id,
          baseUrl: API_BASE_URL
        })
        const response = await fetch(apiUrl)
        console.log('APIレスポンスステータス:', response.status)
        console.log('APIレスポンスヘッダー:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('APIエラーレスポンス:', errorText)
          throw new Error(`データの取得に失敗しました (${response.status}: ${errorText})`)
        }

        const json = await response.json()
        console.log('APIレスポンスデータ:', json)
        
        if (!json.success) {
          throw new Error(json.error || 'データの取得に失敗しました')
        }
        
        setData(json.history)
        console.log('データ設定完了:', json.history)
      } catch (error: unknown) {
        console.error('詳細エラー情報:', {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          cause: error instanceof Error ? error.cause : undefined
        })
        setError(error instanceof Error ? error.message : '予期せぬエラーが発生しました')
      } finally {
        setIsLoading(false)
        console.log('データ取得処理完了')
      }
    }

    if (videoUrl) {
      console.log('データ取得開始:', { videoUrl })
      fetchData()
    }
  }, [videoUrl])

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[300px] flex items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-gray-500">
        データがありません
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'M/d', { locale: ja })
  }

  const formatValue = (value: number) => {
    return new Intl.NumberFormat('ja-JP').format(value)
  }

  // データを加工して新しいキーを追加
  const processedData = data.map(item => ({
    ...item,
    play_count_gradient: item.play_count_increase // グラデーション用の同じ値を別キーで保持
  }))

  return (
    <div className="h-[300px] w-full bg-white rounded-lg p-6">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={processedData}  // 加工したデータを使用
          margin={{
            top: 20,
            right: 30,
            left: 10,
            bottom: 30,
          }}
        >
          <defs>
            <linearGradient id="playCountGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ec4899" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#ec4899" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#fce7f3"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            dataKey="collection_date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
            stroke="#94a3b8"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#fce7f3' }}
            tickLine={{ stroke: '#fce7f3' }}
            label={{ 
              value: '日付',
              position: 'bottom',
              offset: 20,
              style: { fill: '#64748b', fontSize: 12 }
            }}
            dy={10}
          />
          <YAxis
            tickFormatter={formatValue}
            stroke="#94a3b8"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#fce7f3' }}
            tickLine={{ stroke: '#fce7f3' }}
            label={{ 
              value: '再生回数',
              angle: -90,
              position: 'left',
              offset: 0,
              style: { fill: '#64748b', fontSize: 12 }
            }}
            dx={-10}
          />
          <Area
            type="monotone"
            dataKey="play_count_gradient"
            fill="url(#playCountGradient)"
            stroke="none"
            fillOpacity={0.8}
            isAnimationActive={false}
            legendType="none"
            hide={false}
            tooltipType="none"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: 'none',
              borderRadius: '8px',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
              padding: '12px 16px',
            }}
            labelFormatter={(label) => `${formatDate(label)}`}
            formatter={(value: number, name: string) => {
              // play_count_gradientの場合は undefined を返す（nullではなく）
              if (name === "play_count_gradient") {
                return undefined
              }
              if (name === "play_count_increase") {
                return [`${formatValue(value)}回`, '再生数']
              }
            }}
            labelStyle={{ 
              color: '#64748b',
              fontSize: '12px',
              marginBottom: '4px'
            }}
            itemStyle={{
              color: '#ec4899',
              fontSize: '14px',
              fontWeight: 500,
            }}
          />
          <Line
            type="monotone"
            dataKey="play_count_increase"  // 元のキーはそのまま
            stroke="#ec4899"
            strokeWidth={2.5}
            dot={{
              r: 2.5,
              fill: '#ec4899',
              strokeWidth: 0,
            }}
            activeDot={{
              r: 5,
              fill: '#ec4899',
              strokeWidth: 0,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
} 