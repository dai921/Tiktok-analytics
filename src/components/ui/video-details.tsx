'use client'

interface VideoDetailsProps {
  videoData: any
  videoUrl: string
}

export function VideoDetails({ videoData, videoUrl }: VideoDetailsProps) {
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ja-JP').format(num)
  }

  return (
    <div className="divide-y divide-gray-100">
      <div className="py-2">
        <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">アカウント名</div>
        <div className="text-sm font-bold text-gray-900">{videoData?.account_name}</div>
        <div className="text-xs text-gray-500">{videoData?.display_name}</div>
      </div>

      <div className="py-2">
        <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">動画情報</div>
        <div className="mt-1 text-sm text-gray-600">
          {videoData?.description || '説明文がありません'}
        </div>
      </div>

      <div className="py-2">
        <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">投稿日</div>
        <div className="mt-1 text-sm text-gray-600">
          {videoData?.createdAt || '-'}
        </div>
      </div>

      <div className="py-2 space-y-2">
        <button className="w-full bg-pink-500 text-white py-2 px-4 rounded hover:bg-pink-600 transition-colors text-sm">
          動画をウォッチリストに追加
        </button>
        <button className="w-full bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 transition-colors text-sm">
          アカウントをウォッチリストに追加
        </button>
      </div>
    </div>
  )
} 