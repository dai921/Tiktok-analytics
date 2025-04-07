'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './auth-context'

interface UserInfo {
  name?: string
  email: string
}

export function useUserInfo() {
  const { user, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // AuthProviderのローディング完了を待つ
    if (!authLoading) {
      setIsLoading(false)
    }
  }, [authLoading])

  // ユーザー情報をAuthContextから直接取得
  const userInfo: UserInfo | null = user ? {
    name: user.name,
    email: user.email
  } : null

  return { userInfo, isLoading, error }
} 