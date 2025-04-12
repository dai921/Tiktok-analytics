'use client'

import { useEffect, useCallback } from 'react'

interface VideoEmbedPlayerProps {
  videoUrl: string
  onError: (error: string) => void
}

export function VideoEmbedPlayer({ videoUrl, onError }: VideoEmbedPlayerProps) {
  const extractTikTokId = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url)
      if (!urlObj.hostname.includes('tiktok.com')) {
        throw new Error('TikTokのURLではありません')
      }

      const matches = url.match(/(?:video|photo)\/(\d+)/)
      if (!matches) {
        throw new Error('コンテンツIDが見つかりません')
      }

      return matches[1]
    } catch (e) {
      console.error('URL解析エラー:', e)
      onError('コンテンツの読み込みに失敗しました')
      return ''
    }
  }, [onError])

  const generateEmbedCode = useCallback((url: string) => {
    const videoId = extractTikTokId(url)
    if (!videoId) return ''

    return `<blockquote class="tiktok-embed" cite="${url}" data-video-id="${videoId}">
      <section></section>
    </blockquote>`
  }, [extractTikTokId])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://www.tiktok.com/embed.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div 
      className="w-full h-full"
      dangerouslySetInnerHTML={{ 
        __html: generateEmbedCode(videoUrl)
      }} 
    />
  )
} 