export type SessionUsage = {
  session_id: string
  user_id: string
  user_number?: number | null
  user_name?: string | null
  email?: string | null
  last_used_at?: string | null
  last_used_at_jst?: string | null
  created_at?: string | null
  created_at_jst?: string | null
  expires_at?: string | null
  expires_at_jst?: string | null
  session_token_preview?: string | null
}

export type SessionSummary = {
  user_id: string
  user_number?: number | null
  user_name?: string | null
  email?: string | null
  session_count: number
  last_used_at?: string | null
  last_used_at_jst?: string | null
}

export type TranscriptionUsageEntry = {
  user_number?: number | null
  user_name?: string | null
  transcription_count: number
}

export type MissingUsageEntry = {
  user_number?: number | null
  user_name?: string | null
  missing_count: number
}

export type MissingVideoEntry = {
  user_number?: number | null
  user_name?: string | null
  video_id?: string | null
  account_name?: string | null
  file_path?: string | null
  video_url?: string | null
}

type ApiResponse<T> = {
  success: boolean
  data?: T
  count?: number
  error?: string
}

type SessionUsagePayload = {
  sessions: SessionUsage[]
  summary: SessionSummary[]
  order?: string
  summary_sort?: string
}

type TranscriptionUsagePayload = {
  usage_by_user: TranscriptionUsageEntry[]
  missing_by_user: MissingUsageEntry[]
  missing_videos: MissingVideoEntry[]
}

// 他のAPIと同様にバックエンドに直接送信
const apiBase = process.env.NEXT_PUBLIC_API_URL || ''

const getAuthToken = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

const getAuthType = () => {
  if (typeof window === 'undefined') return 'Bearer'
  return localStorage.getItem('auth_token_type') || 'Bearer'
}

const buildAuthHeaders = () => {
  const token = getAuthToken()
  const tokenType = getAuthType()
  if (!token) {
    throw new Error('認証情報が見つかりません。再度ログインしてください。')
  }

  return {
    Authorization: `${tokenType} ${token}`,
    'Content-Type': 'application/json',
  }
}

const handleApiError = (error: unknown): ApiResponse<never> => {
  console.error('admin usage API error:', error)
  return {
    success: false,
    error: error instanceof Error ? error.message : 'エラーが発生しました',
  }
}

export async function fetchSessionUsage(params?: {
  order?: 'asc' | 'desc'
  summarySort?: 'last_used_at' | 'session_count'
}): Promise<ApiResponse<SessionUsagePayload>> {
  try {
    const headers = buildAuthHeaders()
    const qs = new URLSearchParams()
    if (params?.order) qs.append('order', params.order)
    if (params?.summarySort) qs.append('summary_sort', params.summarySort)

    const response = await fetch(
      `${apiBase}/api/admin/usage/sessions?${qs.toString()}`,
      {
        method: 'GET',
        headers,
      },
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      throw new Error(
        data?.detail || data?.message || 'セッションデータの取得に失敗しました。',
      )
    }

    return {
      success: true,
      data: {
        sessions: Array.isArray(data?.data?.sessions)
          ? data.data.sessions
          : [],
        summary: Array.isArray(data?.data?.summary)
          ? data.data.summary
          : [],
        order: data?.order,
        summary_sort: data?.summary_sort,
      },
      count: typeof data?.count === 'number' ? data.count : undefined,
    }
  } catch (error) {
    return handleApiError(error)
  }
}

export async function fetchTranscriptionUsage(params?: {
  missingLimit?: number
}): Promise<ApiResponse<TranscriptionUsagePayload>> {
  try {
    const headers = buildAuthHeaders()
    const qs = new URLSearchParams()
    if (params?.missingLimit) {
      qs.append('missing_limit', String(params.missingLimit))
    }

    const response = await fetch(
      `${apiBase}/api/admin/usage/transcription?${qs.toString()}`,
      {
        method: 'GET',
        headers,
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      throw new Error(
        data?.detail || data?.message || '文字起こし利用状況の取得に失敗しました。',
      )
    }

    return {
      success: true,
      data: {
        usage_by_user: Array.isArray(data?.data?.usage_by_user)
          ? data.data.usage_by_user
          : [],
        missing_by_user: Array.isArray(data?.data?.missing_by_user)
          ? data.data.missing_by_user
          : [],
        missing_videos: Array.isArray(data?.data?.missing_videos)
          ? data.data.missing_videos
          : [],
      },
    }
  } catch (error) {
    return handleApiError(error)
  }
}
