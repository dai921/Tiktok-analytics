'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from '@/lib/auth-context'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL 

interface ApiError {
  detail: string;
  code?: string;
}

export default function Register() {
  const router = useRouter()
  const { login, user, isAdmin, isLoading } = useAuth()
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string
    const name = formData.get('name') as string

    // バリデーション
    if (!email || !email.includes('@')) {
      setError('有効なメールアドレスを入力してください')
      setFormLoading(false)
      return
    }

    if (!password || password.length < 8) {
      setError('パスワードは8文字以上である必要があります')
      setFormLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      setFormLoading(false)
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
        login(data.access_token, data.token_type, false)
        router.push('/dashboard')
      } else {
        // 登録は成功したがログインに失敗した場合
        router.push('/login')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '登録に失敗しました')
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-sky-50 p-4">
      <Card className="w-[500px] shadow-lg bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
        <div className="w-full flex justify-center py-6">
        <Logo className="w-full max-w-[280px]" variant="auth" />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-300">メールアドレス</Label>
              <Input
                id="email"
                name="email"
                placeholder="example@example.com"
                type="email"
                required
                className="h-12 bg-zinc-800 border-zinc-700 text-white"
                disabled={formLoading}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name" className="text-zinc-300">名前</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="表示名"
                className="h-12 bg-zinc-800 border-zinc-700 text-white"
                disabled={formLoading}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-zinc-300">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="h-12 bg-zinc-800 border-zinc-700 text-white"
                disabled={formLoading}
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-zinc-500 mt-1">
                ※ 8文字以上の半角英数字を入力してください
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-zinc-300">パスワード（確認）</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="h-12 bg-zinc-800 border-zinc-700 text-white"
                disabled={formLoading}
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-900/20 p-2 rounded">
                {error}
              </p>
            )}

            <div className="space-y-2 pt-4">
              <Button 
                type="submit"
                className="w-full h-12 text-lg bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white"
                disabled={formLoading}
              >
                {formLoading ? '登録中...' : '新規登録'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-12 text-lg text-white border-zinc-600 hover:bg-zinc-800"
                onClick={() => router.replace('/login')}
                disabled={formLoading}
              >
                ログインへ戻る
              </Button>
              
              <div className="text-center mt-4">
                <p className="text-sm text-zinc-400">
                  ユーザーのパスワードを変更したい場合は
                  <Button 
                    variant="link" 
                    className="text-[#FE2C55] p-0 h-auto font-normal ml-1"
                    onClick={() => router.push('/register/change-password')}
                    disabled={formLoading}
                  >
                    こちら
                  </Button>
                </p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}