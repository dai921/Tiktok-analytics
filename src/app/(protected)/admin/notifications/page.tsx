'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'

const textareaStyles =
  'min-h-[240px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export default function AdminNotificationSettingsPage() {
  const { isAdmin, isLoading } = useAuth()
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold">アクセスできません</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          このページは管理者のみ利用できます。
        </p>
      </div>
    )
  }

  const resetDraft = () => {
    setBody('')
  }

  const handleOpenConfirm = () => {
    if (!body.trim()) {
      toast({
        variant: 'destructive',
        title: '本文が未入力です',
        description: '本文を入力してください。',
      })
      return
    }

    setIsConfirmOpen(true)
  }

  const handleSend = async () => {
    setIsSending(true)
    try {
      const token = localStorage.getItem('auth_token')
      const tokenType = localStorage.getItem('auth_token_type') || 'Bearer'

      if (!token) {
        throw new Error('認証情報がありません。ログインしてください。')
      }

      const payload = {
        body: body.trim(),
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `${tokenType} ${token}`,
          },
          body: JSON.stringify(payload),
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.success) {
        const detail =
          data?.detail ||
          data?.message ||
          '通知の送信に失敗しました。もう一度お試しください。'
        throw new Error(detail)
      }

      toast({
        title: '通知を送信しました',
        description: `${data?.delivery_count ?? 0}件に送信しました。`,
      })
      resetDraft()
      setIsConfirmOpen(false)
    } catch (error) {
      console.error(error)
      toast({
        variant: 'destructive',
        title: '送信に失敗しました',
        description:
          error instanceof Error
            ? error.message
            : 'エラーが発生しました。再度お試しください。',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">通知設定（管理者向け）</h1>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>通知作成</CardTitle>
            <CardDescription>
              本文を入力して送信します。全ユーザーに即時配信されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <textarea
                id="body"
                className={textareaStyles}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="送信する本文を入力してください"
                disabled={isSending}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={resetDraft}
                disabled={isSending}
              >
                リセット
              </Button>
              <Button onClick={handleOpenConfirm} disabled={isSending}>
                送信内容を確認
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>送信内容の最終確認</DialogTitle>
            <DialogDescription>
              よろしければ「この内容で送信」を押してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1 rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">本文</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {body}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isSending}
            >
              キャンセル
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? '送信中...' : 'この内容で送信'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
