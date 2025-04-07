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

export default function AdminLogin() {
  const router = useRouter()
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    console.log('フォーム送信開始')
    setIsLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    console.log('入力値取得:', { email: email ? '入力あり' : '空', password: password ? '入力あり' : '空' })

    try {
      console.log('APIリクエスト開始', `${API_BASE_URL}/api/auth/token`)
      const loginData = new URLSearchParams()
      loginData.append('username', email)
      loginData.append('password', password)

      const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginData.toString(),
      })

      if (!response.ok) {
        throw new Error('ログインに失敗しました')
      }

      const data = await response.json()
      
      // 管理者権限のチェック
      if (!data.is_admin) {
        throw new Error('管理者権限がありません')
      }

      // 管理者としてログイン
      login(data.access_token, data.token_type, data.is_admin)
      router.push('/register')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-sky-50 p-4">
      <Card className="w-[400px] shadow-lg bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
        <div className="w-full flex justify-center py-6">
        <Logo className="w-full max-w-[280px]" variant="auth" />
          </div>
          <h2 className="text-2xl font-bold text-center text-zinc-300">管理者ログイン</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-300">メールアドレス</Label>
              <Input
                id="email"
                name="email"
                placeholder="admin@example.com"
                type="email"
                required
                className="h-12 bg-zinc-800 border-zinc-700 text-white"
                disabled={isLoading}
                autoComplete="email"
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
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-900/20 p-2 rounded">
                {error}
              </p>
            )}

            <div className="pt-2">
              <Button 
                type="submit"
                className="w-full h-12 text-lg bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white"
                disabled={isLoading}
              >
                {isLoading ? 'ログイン中...' : '管理者としてログイン'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
} 