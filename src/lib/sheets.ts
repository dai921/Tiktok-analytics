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
    
    // フィルターパラメータの変換を修正
    const params = {
      page,
      filters: filters ? Object.entries(filters).reduce((acc, [key, filter]) => {
        const japaneseField = COLUMN_MAP[key]
        if (!japaneseField) {
          console.error(`No mapping found for field: ${key}`)
          return acc
        }
        return {
          ...acc,
          [japaneseField]: {
            field: japaneseField,  // 日本語のフィールド名
            type: filter.type,
            value: filter.value
          }
        }
      }, {}) : undefined
    }

    // より詳細なデバッグログ
    console.log('=== Detailed Request Debug ===');
    console.log('Original filters:', {
      filters,
      type: filters ? Object.values(filters)[0]?.type : 'none',
      value: filters ? Object.values(filters)[0]?.value : 'none',
      field: filters ? Object.keys(filters)[0] : 'none'
    });
    console.log('Converted params:', {
      raw: params,
      filterKeys: params.filters ? Object.keys(params.filters) : [],
      filterValues: params.filters ? Object.values(params.filters) : [],
      firstFilter: params.filters ? Object.values(params.filters)[0] : null
    });
    console.log('URL:', url.toString());

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
    console.log('=== Response Debug ===');
    console.log('Raw response:', text);
    
    try {
      const result = JSON.parse(text)
      console.log('Parsed response:', result);
      return result
    } catch (error) {
      console.error('Parse error:', error);
      throw error
    }
  } catch (error) {
    console.error('Network error:', error);
    return {
      data: [],
      total: 0,
      currentPage: 1,
      totalPages: 1,
      success: false
    }
  }
} 