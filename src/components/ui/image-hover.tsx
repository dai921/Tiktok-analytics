'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Portal } from '@radix-ui/react-portal'
import { X } from 'lucide-react'

interface ImageHoverProps {
  src: string
  alt: string
  videoUrl: string
  videoData?: any // VideoDataの型は実際のデータに合わせて調整
}

export function ImageHover({ src, alt, videoUrl, videoData }: ImageHoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extractTikTokId = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url)
      if (!urlObj.hostname.includes('tiktok.com')) {
        throw new Error('TikTokのURLではありません')
      }

      // /video/ または /photo/ のパターンに対応
      const matches = url.match(/(?:video|photo)\/(\d+)/)
      if (!matches) {
        throw new Error('コンテンツIDが見つかりません')
      }

      return matches[1]
    } catch (e) {
      console.error('URL解析エラー:', e)
      setError('コンテンツの読み込みに失敗しました')
      return ''
    }
  }, [])

  const generateEmbedCode = useCallback((url: string) => {
    const videoId = extractTikTokId(url)
    if (!videoId) return ''

    return `<blockquote class="tiktok-embed" cite="${url}" data-video-id="${videoId}">
      <section></section>
    </blockquote>`
  }, [extractTikTokId])

  // TikTokの埋め込みスクリプトを読み込む
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

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(false)
  }, [])

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(true)
  }, [])

  // 数値をフォーマットする関数
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ja-JP').format(num);
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
            sizes="120px"
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
              className="relative max-w-5xl w-full bg-white rounded-lg shadow-xl overflow-hidden max-h-[95vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row h-full">
                {/* 左側: 埋め込み動画 - 高さをさらに増やす */}
                <div className="w-full md:w-2/3 h-[700px] md:h-[800px] relative bg-black flex items-center justify-center">
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
                    <div 
                      className="w-full h-full"
                      dangerouslySetInnerHTML={{ 
                        __html: generateEmbedCode(videoUrl)
                      }} 
                    />
                  )}
                </div>
                
                {/* 右側: 動画情報 - 動画エリアと同じ高さに合わせる */}
                <div className="w-full md:w-1/3 p-6 bg-gray-50 h-[700px] md:h-[800px] overflow-y-auto">
                  <h2 className="text-xl font-bold mb-6 text-gray-800">動画詳細</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="text-gray-500 text-xs mb-1">アカウント:</div>
                      <div className="font-bold text-gray-900">{videoData?.accountName || '不明'}</div>
                      {videoData?.display_name && (
                        <div className="text-xs text-gray-500">{videoData.display_name}</div>
                      )}
                    </div>
                    
                    <div>
                      <div className="text-gray-500 text-xs mb-1">投稿日:</div>
                      <div className="text-gray-900">{videoData?.createdAt || '不明'}</div>
                    </div>
                    
                    <div>
                      <div className="text-gray-500 text-xs mb-1">動画ジャンル:</div>
                      <div className="bg-red-100 text-red-600 inline-block px-2 py-1 rounded text-sm">
                        {videoData?.category || 'なし'}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-gray-500 text-xs mb-1">URL:</div>
                      <a 
                        href={videoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all text-sm"
                      >
                        {videoUrl}
                      </a>
                    </div>
                    
                    <div className="pt-2 grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-gray-500 text-xs">現在の再生数</div>
                        <div className="font-bold text-xl text-gray-900">
                          {videoData?.views ? formatNumber(videoData.views) : '0'}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-gray-500 text-xs">増加率 (2日間)</div>
                        <div className={`font-bold text-xl ${videoData?.viewsIncrease > 0 ? 'text-green-500' : 'text-gray-400'}`}>
                          {videoData?.viewsIncrease ? `+${videoData.viewsIncrease}%` : '0%'}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-gray-500 text-xs">いいね数</div>
                        <div className="font-bold text-xl text-red-500">
                          {videoData?.likes ? formatNumber(videoData.likes) : '0'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex space-x-2">
                      <button className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition text-sm flex-1">
                        動画をウォッチリストに追加
                      </button>
                      <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition text-sm flex-1">
                        アカウントをウォッチ
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