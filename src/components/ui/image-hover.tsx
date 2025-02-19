'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Portal } from '@radix-ui/react-portal'
import { X } from 'lucide-react'

interface ImageHoverProps {
  src: string
  alt: string
}

export function ImageHover({ src, alt }: ImageHoverProps) {
  const [isOpen, setIsOpen] = useState(false)

  // ESCキーで閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleEsc)
    }

    return () => {
      window.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  // モーダルを閉じる
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(false)
  }, [])

  // サムネイルクリックでモーダルを開く
  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(true)
  }, [])

  return (
    <>
      <div
        onClick={handleOpen}
        className="cursor-zoom-in"
      >
        <div className="w-[160px] h-[90px] relative bg-gray-100 rounded">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="160px"
            className="object-cover rounded"
            unoptimized
          />
        </div>
      </div>

      {isOpen && (
        <Portal>
          <div 
            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
            onClick={handleClose} // 背景クリックで閉じる
          >
            <div 
              className="relative max-w-4xl w-full bg-white rounded-lg shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()} // モーダル内のクリックは伝播を止める
            >
              <button
                onClick={handleClose}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
              >
                <X size={20} />
              </button>
              <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                <Image
                  src={src}
                  alt={alt}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
} 