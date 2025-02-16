import type { VideoData, PaginatedResponse } from '@/types/dashboard'

export async function getSheetData(page: number = 1): Promise<PaginatedResponse> {
  try {
    const response = await fetch(`/api/sheets?page=${page}`, {
      method: 'GET',
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const { data, total, currentPage, totalPages, success } = await response.json()
    
    if (!success) {
      throw new Error('Failed to fetch data from GAS')
    }
    
    return {
      data: data.map((row: any) => ({
        ...row,
        views: Number(row.views),
        viewsPrev: Number(row.viewsPrev),
        viewsIncrease: Number(row.viewsIncrease),
        likes: Number(row.likes),
        comments: Number(row.comments),
        hashtags: Array.isArray(row.hashtags) ? row.hashtags : row.hashtags.split(',')
      })),
      total,
      currentPage,
      totalPages
    }
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    return {
      data: [],
      total: 0,
      currentPage: 1,
      totalPages: 1
    }
  }
} 