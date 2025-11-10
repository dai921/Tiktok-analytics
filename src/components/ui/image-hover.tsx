'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Portal } from '@radix-ui/react-portal'
import { X, Bookmark, UserPlus, Check, AlertCircle, Copy } from 'lucide-react'
import { PlayCountHistoryGraph } from './play-count-history-graph'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'
import { 
  addVideoToWatchlist, 
  addAccountToBookmarks,
  removeVideoFromWatchlist,
  removeAccountFromBookmarks,
  checkVideoInWatchlist,
  checkAccountInBookmarks
} from '@/lib/api/watchlist'
import { fetchTranscription, type TranscriptionResponse } from '@/lib/api/transcription'

interface ImageHoverProps {
  src: string
  alt: string
  videoUrl: string
  videoId?: string
  videoData: {
    views: number
    viewsIncrease: number
    ten_days_increase?: number
    createdAt: string
    accountName?: string
  }
  onSaveVideo?: () => void
  onSaveAccount?: () => void
}

export function ImageHover({ 
  src, 
  alt, 
  videoUrl, 
  videoId, 
  videoData,
  onSaveVideo,
  onSaveAccount 
}: ImageHoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVideoInWatchlist, setIsVideoInWatchlist] = useState(false)
  const [isAccountInBookmarks, setIsAccountInBookmarks] = useState(false)
  const [isLoading, setIsLoading] = useState({
    videoSave: false,
    accountSave: false,
    transcription: false
  })
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResponse | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  
  const { toast } = useToast()
  const { user } = useAuth()
  
  const accountName = videoData.accountName || ''

  // 動画が開かれたときにウォッチリスト状態を確認
  useEffect(() => {
    if (isOpen && user) {
      // 動画のウォッチリスト状態を確認
      checkVideoInWatchlist(videoUrl).then(result => {
        if (result.success) {
          setIsVideoInWatchlist(result.exists)
        }
      })
      
      // アカウントのブックマーク状態を確認
      if (accountName) {
        checkAccountInBookmarks(accountName).then(result => {
          if (result.success) {
            setIsAccountInBookmarks(result.exists)
          }
        })
      }
    }
  }, [isOpen, videoUrl, accountName, user])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(false)
  }, [])

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      const script = document.createElement('script')
      script.src = 'https://www.tiktok.com/embed.js'
      script.async = true
      document.body.appendChild(script)

      return () => {
        document.body.removeChild(script)
      }
    }
  }, [isOpen])

  // 動画をウォッチリストに追加/削除
  const handleSaveVideo = async () => {
    if (!user) {
      toast({
        title: "ログインが必要です",
        description: "この機能を使用するにはログインしてください",
        variant: "destructive"
      })
      return
    }

    // 削除時は確認ポップアップを表示（ウォッチリストページと同等の文言）
    if (isVideoInWatchlist) {
      const confirmed = window.confirm('この動画をウォッチリストから削除しますか？')
      if (!confirmed) return
    }

    setIsLoading(prev => ({ ...prev, videoSave: true }))
    try {
      if (isVideoInWatchlist) {
        // 削除処理
        const result = await removeVideoFromWatchlist(videoUrl)
        if (result.success) {
          setIsVideoInWatchlist(false)
          toast({
            title: "削除完了",
            description: "動画をウォッチリストから削除しました",
          })
        }
      } else {
        // 追加処理
        const result = await addVideoToWatchlist(videoUrl)
        if (result.success) {
          setIsVideoInWatchlist(true)
          toast({
            title: "追加完了",
            description: "動画をウォッチリストに追加しました",
          })
        }
      }
      if (onSaveVideo) onSaveVideo()
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "処理中にエラーが発生しました",
        variant: "destructive"
      })
    } finally {
      setIsLoading(prev => ({ ...prev, videoSave: false }))
    }
  }

  // アカウントをブックマークに追加/削除
  const handleSaveAccount = async () => {
    if (!user) {
      toast({
        title: "ログインが必要です",
        description: "この機能を使用するにはログインしてください",
        variant: "destructive"
      })
      return
    }
    
    if (!accountName) {
      toast({
        title: "エラー",
        description: "アカウント情報が見つかりません",
        variant: "destructive"
      })
      return
    }

    setIsLoading(prev => ({ ...prev, accountSave: true }))
    try {
      if (isAccountInBookmarks) {
        // 削除処理
        const result = await removeAccountFromBookmarks(accountName)
        if (result.success) {
          setIsAccountInBookmarks(false)
          toast({
            title: "削除完了",
            description: "アカウントをウォッチリストから削除しました",
          })
        }
      } else {
        // 追加処理
        const result = await addAccountToBookmarks(accountName)
        if (result.success) {
          setIsAccountInBookmarks(true)
          toast({
            title: "追加完了",
            description: "アカウントをウォッチリストに追加しました",
          })
        }
      }
      if (onSaveAccount) onSaveAccount()
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "処理中にエラーが発生しました",
        variant: "destructive"
      })
    } finally {
      setIsLoading(prev => ({ ...prev, accountSave: false }))
    }
  }

  // 文字起こし実行
  const handleTranscription = async () => {
    if (!user) {
      return
    }

    // URLにphotoが含まれている場合はカルーセルとして扱う
    if (videoUrl.includes('/photo/')) {
      setTranscriptionResult({
        success: false,
        error: 'カルーセル（画像スライドショー）投稿は文字起こしできません'
      })
      return
    }

    setIsLoading(prev => ({ ...prev, transcription: true }))
    try {
      const result = await fetchTranscription(videoUrl)
      
      if (result.success && result.transcription) {
        setTranscriptionResult(result)
      } else if (result.error) {
        setTranscriptionResult({
          success: false,
          error: result.error
        })
      }
    } catch (error) {
      // エラーは無視してローディングを終了するだけ
    } finally {
      setIsLoading(prev => ({ ...prev, transcription: false }))
    }
  }

  // 文字起こしコピー
  const handleCopy = async () => {
    if (transcriptionResult?.transcription) {
      try {
        await navigator.clipboard.writeText(transcriptionResult.transcription)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      } catch (err) {
        // 必要ならトースト等でエラー通知
      }
    }
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ja-JP').format(num)
  }

  const formatGrowth = (growth?: number): string => {
    if (growth === undefined) return "0";
    
    return growth > 0 
      ? `+${formatNumber(growth)}` 
      : formatNumber(growth);
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:video|photo)\/(\d+)/)
    return match ? match[1] : ''
  }

  return (
    <>
      <div
        onClick={handleOpen}
        className="cursor-pointer"
      >
        <div className="w-[120px] h-[120px] relative bg-gray-100 rounded flex items-center justify-center overflow-hidden">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="160px"
            className="object-cover"
            unoptimized
          />
        </div>
      </div>

      {isOpen && (
        <Portal>
          <div 
            className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4"
            onClick={handleClose}
          >
            <div 
              className="relative max-w-6xl w-full bg-white rounded-lg shadow-xl overflow-hidden max-h-[95vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row h-full">
                {/* 左側: 埋め込み動画 - 高さを調整 */}
                <div className="w-full md:w-1/2 h-[700px] md:h-[800px] relative bg-black flex items-center justify-center">
                  <button
                    onClick={handleClose}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
                  >
                    <X size={20} />
                  </button>

                  {error ? (
                    <div className="text-white text-center p-4">
                      {error}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <blockquote
                        className="tiktok-embed"
                        cite={videoUrl}
                        data-video-id={extractVideoId(videoUrl)}
                        style={{ maxWidth: '100%' }}
                      >
                        <section></section>
                      </blockquote>
                    </div>
                  )}
                </div>
                
                {/* 右側: 動画情報 */}
                <div className="w-full md:w-1/2 p-6 bg-gray-50 h-[700px] md:h-[800px] overflow-y-auto flex flex-col">
                  <div className="space-y-6 flex-1">
                    {/* 再生数推移グラフ */}
                    <div className="order-3 mt-12">
                      <h3 className="text-lg font-semibold mb-4">再生数推移</h3>
                      <div className="-mx-6">
                        <PlayCountHistoryGraph videoUrl={videoUrl} />
                      </div>
                    </div>

                    {/* 再生数情報 - 1列に変更 */}
                    <div className="grid grid-cols-3 gap-0 order-1 mt-8">
                      <div>
                        <h4 className="text-sm text-gray-600 mb-1">総再生数</h4>
                        <p className="text-2xl font-bold leading-none">{formatNumber(videoData.views)}</p>
                      </div>
                      <div>
                        <h4 className="text-sm text-gray-600 mb-1">2日間増加数</h4>
                        <p className="text-2xl font-bold leading-none text-blue-600">{formatGrowth(videoData.viewsIncrease)}</p>
                      </div>
                      <div>
                        <h4 className="text-sm text-gray-600 mb-1">10日間増加数</h4>
                        <p className="text-2xl font-bold leading-none text-green-600">{formatGrowth(videoData.ten_days_increase)}</p>
                      </div>
                    </div>

                    {/* 投稿日 */}
                    <div className="order-2">
                      <h4 className="text-sm text-gray-600 mb-1">投稿日</h4>
                      <p className="text-xl font-medium leading-none">{formatDate(videoData.createdAt)}</p>
                    </div>

                    {/* 動画URL */}
                    <div className="order-2.5">
                      <h4 className="text-sm text-gray-600 mb-1">動画URL</h4>
                      <a 
                        href={videoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
                      >
                        {videoUrl}
                      </a>
                    </div>

                    {/* 文字起こしボタンと結果 */}
                    <div className="order-2.6">
                      <h4 className="text-sm text-gray-600 mb-1">文字起こし</h4>
                      
                      {/* 文字起こし結果表示 */}
                      {transcriptionResult ? (
                        <div className="bg-white p-4 rounded-lg border">
                          {transcriptionResult.success && transcriptionResult.transcription ? (
                            <>
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-semibold text-gray-800">文字起こし結果</span>
                                <button
                                  onClick={handleCopy}
                                  className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-4 h-4 text-green-600" />
                                      <span>コピー完了</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      <span>コピー</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="bg-gray-50 p-3 rounded border">
                                <pre className="whitespace-pre-wrap text-sm text-gray-800">
                                  {transcriptionResult.transcription}
                                </pre>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-red-600">
                              {transcriptionResult.error || '文字起こしに失敗しました'}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 文字起こし実行ボタン */
                        <button
                          onClick={handleTranscription}
                          disabled={isLoading.transcription}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                          {isLoading.transcription ? (
                            <>
                              <span className="animate-spin">⏳</span>
                              <span>文字起こし中...</span>
                            </>
                          ) : (
                            <span>文字起こし実行</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ウォッチリストに保存 */}
                  <div className="mb-12">
                    <h3 className="text-base font-semibold">ウォッチリストに追加</h3>
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={handleSaveVideo}
                        disabled={isLoading.videoSave}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors ${
                          isVideoInWatchlist 
                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                            : 'bg-[#FE2C55] hover:bg-[#E62548] text-white'
                        }`}
                      >
                        {isLoading.videoSave ? (
                          <span className="animate-spin">⏳</span>
                        ) : isVideoInWatchlist ? (
                          <>
                            <Check size={20} />
                            <span>保存済み</span>
                          </>
                        ) : (
                          <>
                            <Bookmark size={20} />
                            <span>動画を保存</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSaveAccount}
                        disabled={isLoading.accountSave || !accountName}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors ${
                          !accountName
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : isAccountInBookmarks
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-black hover:bg-gray-800 text-white'
                        }`}
                      >
                        {isLoading.accountSave ? (
                          <span className="animate-spin">⏳</span>
                        ) : !accountName ? (
                          <>
                            <AlertCircle size={20} />
                            <span>アカウント情報なし</span>
                          </>
                        ) : isAccountInBookmarks ? (
                          <>
                            <Check size={20} />
                            <span>保存済み</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={20} />
                            <span>アカウントを保存</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
} 