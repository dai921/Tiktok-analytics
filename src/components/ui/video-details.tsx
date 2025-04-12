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
    <>
      <h2 className="text-xl font-bold mb-6 text-gray-800">動画詳細</h2>
      
      <div className="space-y-4">
        <div>
          <div className="text-gray-500 text-xs mb-1">アカウント:</div>
          <div className="font-bold text-gray-900">{videoData?.accountName || '不明'}</div>
          {videoData?.display_name && (
            <div className="text-xs text-gray-500">{videoData.display_name}</div>
          )}
        </div>
        
        {videoData?.description && (
          <div>
            <div className="text-gray-500 text-xs mb-1">キャプション:</div>
            <div className="text-gray-900 text-sm whitespace-pre-wrap break-words">
              {videoData.description}
            </div>
          </div>
        )}
        
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
    </>
  )
} 