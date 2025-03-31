'use client'

import { useState, useEffect } from 'react'
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

export default function ChangePassword() {
  const router = useRouter()
  const { user, isAdmin, isLoading } = useAuth()
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 認証状態を確認
  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/login');
    }
  }, [isLoading, user, isAdmin, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormLoading(true)
    setError('')
    setSuccess('')

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const currentPassword = formData.get('currentPassword') as string
    const newPassword = formData.get('newPassword') as string
    const confirmPassword = formData.get('confirmPassword') as string

    // バリデーション
    if (!email || !email.includes('@')) {
      setError('有効なメールアドレスを入力してください')
      setFormLoading(false)
      return
    }

    if (!currentPassword) {
      setError('現在のパスワードを入力してください')
      setFormLoading(false)
      return
    }

    if (!newPassword || newPassword.length < 8) {
      setError('新しいパスワードは8文字以上である必要があります')
      setFormLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません')
      setFormLoading(false)
      return
    }

    try {
      // パスワード変更リクエスト（直接API呼び出し）
      const token = localStorage.getItem('token')
      
      const changePasswordResponse = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          email,
          current_password: currentPassword,
          new_password: newPassword
        }),
      })

      if (!changePasswordResponse.ok) {
        const errorData = await changePasswordResponse.json() as ApiError
        throw new Error(errorData.detail || 'パスワード変更に失敗しました')
      }

      // 成功処理
      setSuccess('パスワードが正常に変更されました')
      // フォームをリセット
      event.currentTarget.reset()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'パスワード変更に失敗しました')
    } finally {
      setFormLoading(false)
    }
  }

  // 読み込み中は何も表示しない
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-sky-50">
        <p>認証情報を確認中...</p>
      </div>
    );
  }

  // 未認証または管理者でない場合は何も表示しない
  if (!user || !isAdmin) {
    return null;
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
              <Label htmlFor="email" className="text-sky-900">対象ユーザーのメールアドレス</Label>
              <Input
                id="email"
                name="email"
                placeholder="example@example.com"
                type="email"
                required
                className="h-12"
                disabled={formLoading}
                autoComplete="email"
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="currentPassword" className="text-sky-900">現在のパスワード</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                className="h-12"
                disabled={formLoading}
                autoComplete="current-password"
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="newPassword" className="text-sky-900">新しいパスワード</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                className="h-12"
                disabled={formLoading}
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-500 mt-1">
                ※ 8文字以上の半角英数字を入力してください
              </p>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-sky-900">新しいパスワード（確認）</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="h-12"
                disabled={formLoading}
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}
            
            {success && (
              <p className="text-sm text-green-500 bg-green-50 p-2 rounded">
                {success}
              </p>
            )}

            <div className="space-y-2 pt-4">
              <Button 
                type="submit"
                className="w-full h-12 text-lg bg-sky-600 hover:bg-sky-700"
                disabled={formLoading}
              >
                {formLoading ? '変更中...' : 'パスワードを変更'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-12 text-lg text-sky-600 border-sky-600 hover:bg-sky-50"
                onClick={() => router.push('/dashboard')}
                disabled={formLoading}
              >
                ダッシュボードに戻る
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 