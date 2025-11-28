export type NotificationItem = {
  id: number
  title: string
  body: string
  sent_at: string | null
  delivered_at: string | null
  is_read: number | boolean
  read_at: string | null
}

type ApiResponse<T> = {
  success: boolean
  data?: T
  total?: number
  unread_total?: number
  error?: string
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL

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
    throw new Error('認証情報がありません。ログインし直してください。')
  }

  return {
    Authorization: `${tokenType} ${token}`,
    'Content-Type': 'application/json',
  }
}

const handleApiError = (error: unknown): ApiResponse<never> => {
  console.error('notifications API error:', error)
  return {
    success: false,
    error: error instanceof Error ? error.message : 'エラーが発生しました',
  }
}

export async function fetchNotifications(options?: {
  onlyUnread?: boolean
  limit?: number
  offset?: number
}): Promise<ApiResponse<NotificationItem[]>> {
  try {
    const headers = buildAuthHeaders()
    const params = new URLSearchParams()
    if (options?.onlyUnread) params.append('only_unread', 'true')
    if (options?.limit) params.append('limit', String(options.limit))
    if (options?.offset) params.append('offset', String(options.offset))

    const response = await fetch(
      `${apiUrl}/api/notifications?${params.toString()}`,
      {
        method: 'GET',
        headers,
      },
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      throw new Error(
        data?.detail || data?.message || '通知の取得に失敗しました。'
      )
    }

    return {
      success: true,
      data: (data?.data ?? []) as NotificationItem[],
      total: typeof data?.total === 'number' ? data.total : undefined,
      unread_total:
        typeof data?.unread_total === 'number' ? data.unread_total : undefined,
    }
  } catch (error) {
    return handleApiError(error)
  }
}

export async function fetchUnreadNotificationCount(): Promise<
  ApiResponse<number>
> {
  try {
    const result = await fetchNotifications({ onlyUnread: true, limit: 1, offset: 0 })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    const unreadTotal =
      typeof result.unread_total === 'number'
        ? result.unread_total
        : Array.isArray(result.data)
        ? result.data.length
        : 0
    return { success: true, data: unreadTotal, unread_total: unreadTotal }
  } catch (error) {
    return handleApiError(error)
  }
}

export async function markNotificationRead(
  notificationId: number,
  read: boolean = true,
): Promise<ApiResponse<NotificationItem>> {
  try {
    const headers = buildAuthHeaders()
    const response = await fetch(
      `${apiUrl}/api/notifications/${notificationId}/read`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ read }),
      },
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      throw new Error(
        data?.detail || data?.message || '既読状態の更新に失敗しました。'
      )
    }

    return {
      success: true,
      data: data?.data as NotificationItem,
    }
  } catch (error) {
    return handleApiError(error)
  }
}

export async function markAllNotificationsRead(): Promise<
  ApiResponse<{ updated: number }>
> {
  try {
    const headers = buildAuthHeaders()
    const response = await fetch(`${apiUrl}/api/notifications/read-all`, {
      method: 'POST',
      headers,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.success) {
      throw new Error(
        data?.detail || data?.message || '���ׂĂ̓ʒm�𖳌��Ɏ��s���܂����B'
      )
    }

    return {
      success: true,
      data: { updated: typeof data?.updated === 'number' ? data.updated : 0 },
    }
  } catch (error) {
    return handleApiError(error)
  }
}
