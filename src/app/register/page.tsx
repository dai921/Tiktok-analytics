'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from '@/lib/auth-context'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface ApiError {
  detail: string;
  code?: string;
}

export default function Register() {
  const router = useRouter()
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string
    const name = formData.get('name') as string

    // バリデーション
    if (!email || !email.includes('@')) {
      setError('有効なメールアドレスを入力してください')
      setIsLoading(false)
      return
    }

    if (!password || password.length < 8) {
      setError('パスワードは8文字以上である必要があります')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      setIsLoading(false)
      return
    }

    try {
      // アカウント登録
      const registerResponse = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          name: name || undefined
        }),
      })

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json() as ApiError
        if (errorData.code === 'email_exists') {
          throw new Error('このメールアドレスは既に登録されています')
        }
        throw new Error(errorData.detail || '登録に失敗しました')
      }

      // 自動ログイン
      const loginData = new URLSearchParams()
      loginData.append('username', email)
      loginData.append('password', password)

      const loginResponse = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginData.toString(),
      })

      if (loginResponse.ok) {
        const data = await loginResponse.json()
        login(data.access_token, data.token_type)
        router.push('/dashboard')
      } else {
        // 登録は成功したがログインに失敗した場合
        router.push('/login')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '登録に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-sky-50 p-4">
      <Card className="w-[500px] shadow-lg">
        <CardHeader className="pb-2">
          <div className="w-full flex justify-center py-4">
            <Logo className="w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sky-900">メールアドレス</Label>
              <Input
                id="email"
                name="email"
                placeholder="example@example.com"
                type="email"
                required
                className="h-12"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name" className="text-sky-900">名前（任意）</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="表示名"
                className="h-12"
                disabled={isLoading}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-sky-900">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="h-12"
                disabled={isLoading}
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-500 mt-1">
                ※ 8文字以上の半角英数字を入力してください
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-sky-900">パスワード（確認）</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="h-12"
                disabled={isLoading}
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <div className="space-y-2 pt-4">
              <Button 
                type="submit"
                className="w-full h-12 text-lg bg-sky-600 hover:bg-sky-700"
                disabled={isLoading}
              >
                {isLoading ? '登録中...' : '新規登録'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-12 text-lg text-sky-600 border-sky-600 hover:bg-sky-50"
                onClick={() => router.replace('/login')}
                disabled={isLoading}
              >
                ログインへ戻る
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}