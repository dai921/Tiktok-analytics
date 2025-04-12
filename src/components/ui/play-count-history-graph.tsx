'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 5,
            left: 5,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="collection_date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatValue}
          />
          <Tooltip
            labelFormatter={formatDate}
            formatter={(value: number) => [formatValue(value), '再生増加数']}
          />
          <Line
            type="monotone"
            dataKey="play_count_increase"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
} 