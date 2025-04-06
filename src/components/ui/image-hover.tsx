'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Portal } from '@radix-ui/react-portal'
import { X } from 'lucide-react'

interface ImageHoverProps {
  src: string
  alt: string
  videoUrl: string
}

export function ImageHover({ src, alt, videoUrl }: ImageHoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extractTikTokId = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url)
      if (!urlObj.hostname.includes('tiktok.com')) {
        throw new Error('TikTokのURLではありません')
      }

      const matches = url.match(/video\/(\d+)/)
      if (!matches) {
        throw new Error('動画IDが見つかりません')
      }

      return matches[1]
    } catch (e) {
      console.error('URL解析エラー:', e)
      setError('動画の読み込みに失敗しました')
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
            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
            onClick={handleClose}
          >
            <div 
              className="relative max-w-xl w-full bg-white rounded-lg shadow-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleClose}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
              >
                <X size={20} />
              </button>

              {/* TikTok動画の埋め込み */}
              {error ? (
                <div className="text-red-500 text-center p-4">
                  {error}
                </div>
              ) : (
                <div 
                  className="w-full"
                  dangerouslySetInnerHTML={{ 
                    __html: generateEmbedCode(videoUrl)
                  }} 
                />
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  )
} 