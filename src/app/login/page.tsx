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

export default function LoginPage() {
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

    try {
      const loginData = new URLSearchParams()
      loginData.append('username', email)
      loginData.append('password', password)

      const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginData.toString(),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'ログインに失敗しました')
      }

      const data = await response.json()
      login(data.access_token, data.token_type)
      router.push('/dashboard')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ログインに失敗しました')
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
              <Label htmlFor="password" className="text-sky-900">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="h-12"
                disabled={isLoading}
                autoComplete="current-password"
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
                {isLoading ? 'ログイン中...' : 'ログイン'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}