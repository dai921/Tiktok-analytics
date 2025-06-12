'use client'

import { useState } from 'react'
import { fetchTranscription, type TranscriptionResponse } from '@/lib/api/transcription'

const TranscriptionPage = () => {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TranscriptionResponse | null>(null)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!url.trim()) {
      setError('URLを入力してください')
      return
    }

    setIsLoading(true)
    setError('')
    setResult(null)
    setDebugInfo('')

    console.log('=== 文字起こし処理開始 ===')
    console.log('URL:', url)
    console.log('API_URL:', process.env.NEXT_PUBLIC_API_URL)
    
    const startTime = Date.now()
    
    try {
      console.log('fetchTranscription呼び出し開始')
      
      const data = await fetchTranscription(url)
      
      const endTime = Date.now()
      const duration = endTime - startTime
      console.log(`fetchTranscription完了: ${duration}ms`)
      console.log('レスポンスデータ:', data)
      
      setDebugInfo(`APIレスポンス取得完了 (${duration}ms)`)
      setResult(data)

      if (!data.success && data.error) {
        console.log('APIエラー:', data.error)
        setError(`APIエラー: ${data.error}`)
      }
    } catch (err) {
      const endTime = Date.now()
      const duration = endTime - startTime
      console.error('=== fetchTranscription例外 ===')
      console.error('エラー:', err)
      console.error('処理時間:', duration + 'ms')
      console.error('エラー型:', typeof err)
      console.error('エラーメッセージ:', err instanceof Error ? err.message : String(err))
      
      setDebugInfo(`例外発生 (${duration}ms): ${err instanceof Error ? err.message : String(err)}`)
      setError(`例外エラー: ${err instanceof Error ? err.message : '不明なエラーが発生しました'}`)
    } finally {
      console.log('=== 文字起こし処理終了 ===')
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setUrl('')
    setResult(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            TikTok動画文字起こし
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="url-input" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                TikTok動画URL
              </label>
              <input
                id="url-input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@username/video/1234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isLoading || !url.trim()}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '処理中...' : '文字起こし実行'}
              </button>
              
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="px-6 py-2 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                リセット
              </button>
            </div>
          </form>

          {isLoading && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                <p className="text-blue-800">
                  文字起こしを実行中です...
                </p>
              </div>
              {debugInfo && (
                <p className="text-blue-600 text-sm mt-2">
                  {debugInfo}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">
                <span className="font-medium">エラー:</span> {error}
              </p>
              {debugInfo && (
                <p className="text-red-600 text-sm mt-2">
                  デバッグ情報: {debugInfo}
                </p>
              )}
            </div>
          )}

          {result && result.success && result.transcription && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                文字起こし結果
              </h2>
              
              {/* 文字起こし文章 */}
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                  {result.transcription}
                </pre>
              </div>

              {/* TikTok埋め込み動画 */}
              {url && (
                <div className="mb-4">
                  <h3 className="text-md font-medium text-gray-700 mb-2">動画</h3>
                  <div className="flex justify-center bg-gray-100 border border-gray-200 rounded-md p-4">
                    <blockquote 
                      className="tiktok-embed" 
                      cite={url} 
                      data-video-id={result.video_id} 
                      style={{ maxWidth: '605px', minWidth: '325px' }}
                    >
                      <section>
                        <a 
                          target="_blank" 
                          title="TikTok" 
                          href={url}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          TikTokで動画を見る
                        </a>
                      </section>
                    </blockquote>
                    <script async src="https://www.tiktok.com/embed.js"></script>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">
              ご利用について
            </h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• TikTok動画のURLを貼り付けてください</li>
              <li>• カルーセル（画像スライドショー）形式は対応していません</li>
              <li>• 処理には時間がかかる場合があります</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TranscriptionPage
