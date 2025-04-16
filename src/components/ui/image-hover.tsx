'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Portal } from '@radix-ui/react-portal'
import { X } from 'lucide-react'
import { PlayCountHistoryGraph } from './play-count-history-graph'
import { VideoDetails } from './video-details'
import { VideoEmbedPlayer } from './video-embed-player'

interface ImageHoverProps {
  src: string
  alt: string
  videoUrl: string
  videoId?: string
  videoData?: any
}

export function ImageHover({ src, alt, videoUrl, videoId, videoData }: ImageHoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
              className="relative max-w-5xl w-full bg-white rounded-lg shadow-xl overflow-hidden max-h-[95vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row h-full">
                {/* 左側: 埋め込み動画 - 横幅をさらに狭く */}
                <div className="w-full md:w-1/2 h-[600px] md:h-[700px] relative bg-black flex items-center justify-center">
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
                    <VideoEmbedPlayer videoUrl={videoUrl} onError={setError} />
                  )}
                </div>
                
                {/* 右側: 動画情報 - 横幅をさらに広く */}
                <div className="w-full md:w-1/2 p-6 bg-gray-50 h-[600px] md:h-[700px] overflow-y-auto">
                  {/* 再生数推移グラフ */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4">再生数推移</h3>
                    <div className="-mx-6">
                      <PlayCountHistoryGraph videoUrl={videoUrl} />
                    </div>
                  </div>

                  {/* 動画情報 */}
                  <VideoDetails videoData={videoData} videoUrl={videoUrl} />
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
} 