import type { VideoData, PaginatedResponse, FilterQuery } from '@/types/dashboard'

// カラム名のマッピング（GASと同じ定義）
export const COLUMN_MAP: Record<string, string> = {
  'views': '再生数',
  'likes': 'いいね数',
  'comments': 'コメント数',
  'accountName': 'アカウント名',
  'category': 'カテゴリ',
  'hashtags': 'ハッシュタグ',
  'description': '説明',
  'audioTitle': '音声タイトル',
  'url': 'URL',
  'videoId': '動画ID',
  'thumbnail': 'カバー画像',
  'authorName': '作成者表示名',
  'shares': '共有数',
  'saves': '保存数',
  'createdAt': '作成日時',
  'duration': '動画時間(秒)',
  'isViral': '10万再生以上',
  'prevViews': '前回再生数',
  'viewsIncrease': '再生数伸び',
  'prevLikes': '前回いいね数',
  'likesIncrease': 'いいね数伸び',
  'product': '商材',
  'audioId': '音声ID',
  'artist': 'アーティスト'
}

export async function getSheetData(page: number = 1, filters?: Record<string, FilterQuery>): Promise<PaginatedResponse> {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_GAS_URL || '')
    
    // GETパラメータではなく、POSTボディとしてパラメータを送信
    const params = {
      page,
      filters: filters ? Object.entries(filters).reduce((acc, [key, filter]) => ({
        ...acc,
        [COLUMN_MAP[key]]: {
          ...filter,
          field: COLUMN_MAP[key]
        }
      }), {}) : undefined
    }

    console.log('Requesting with params:', params)

    const response = await fetch(url.toString(), {
      method: 'POST',  // GETからPOSTに変更
      headers: {
        'Content-Type': 'text/plain',  // application/jsonではなくtext/plainを使用
      },
      body: JSON.stringify(params),  // パラメータをボディに含める
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const text = await response.text()
    console.log('Raw response:', text)
    
    try {
      const result = JSON.parse(text)
      if (!result.success) {
        throw new Error('Failed to fetch data from GAS')
      }
      return result
    } catch (error) {
      console.error('Failed to parse response:', error)
      throw error
    }
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    return {
      data: [],
      total: 0,
      currentPage: 1,
      totalPages: 1,
      success: false
    }
  }
} 