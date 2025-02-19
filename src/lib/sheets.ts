import type { VideoData, PaginatedResponse, FilterQuery, FilterType } from '@/types/dashboard'

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

// 逆マッピングを作成
const REVERSE_COLUMN_MAP = Object.entries(COLUMN_MAP).reduce((acc, [key, value]) => ({
  ...acc,
  [value]: key
}), {} as Record<string, string>)

// フィルタータイプの変換関数
const convertFilterType = (type: FilterType, field: string): string => {
  console.log('Converting filter type:', { type, field });
  
  // 日付フィールドの場合
  if (field === 'createdAt' || field === 'prevFetchDate' || field === 'currentFetchDate') {
    switch (type) {
      case 'after': return 'after'
      case 'before': return 'before'
      default: return 'equal'
    }
  }
  
  // 数値フィールドの場合
  const result = (() => {
    switch (type) {
      case 'greater': return 'greater'  // 直接使用
      case 'less': return 'less'        // 直接使用
      case 'sort': return 'sort'
      default: return 'equal'
    }
  })();
  
  console.log('Converted to:', result);
  return result;
}

export async function getSheetData(page: number = 1, filters?: Record<string, FilterQuery>): Promise<PaginatedResponse> {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_GAS_URL || '')
    
    console.log('=== Filter Debug ===')
    console.log('Raw filters:', filters)
    
    const params = {
      page,
      filters: filters ? Object.entries(filters).reduce((acc, [key, filter]) => {
        const convertedType = convertFilterType(filter.type, filter.field);
        console.log('Final conversion:', {  // デバッグ追加
          from: filter.type,
          to: convertedType,
          field: filter.field
        });
        
        return {
          ...acc,
          [filter.field]: {
            field: filter.field,
            type: convertedType,
            value: filter.value
          }
        };
      }, {}) : undefined
    }
    
    console.log('Converted params:', {
      page,
      filters: params.filters,
      mappedFields: filters ? Object.entries(filters).map(([key, filter]) => ({
        field: filter.field,
        type: filter.type,
        value: filter.value
      })) : []
    })

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(params),
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