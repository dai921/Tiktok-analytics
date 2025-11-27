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
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold">アクセス権限がありません</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          このページは管理者のみが利用できます。
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
        description: '送信前に本文を入力してください。',
      })
      return
    }

    setIsConfirmOpen(true)
  }

  const handleSend = async () => {
    setIsSending(true)
    try {
      // TODO: 配信APIと接続する場合はここでリクエストを実装する
      await new Promise((resolve) => setTimeout(resolve, 900))
      toast({
        title: '通知を送信しました',
        description: '設定されたチャネルへ配信しました。',
      })
      resetDraft()
      setIsConfirmOpen(false)
    } catch (error) {
      console.error(error)
      toast({
        variant: 'destructive',
        title: '送信に失敗しました',
        description: '時間をおいて再度お試しください。',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">通知設定（管理者専用）</h1>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>文章作成</CardTitle>
            <CardDescription>
              本文を入力し、「最終確認へ」から内容をチェックして送信します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <textarea
                id="body"
                className={textareaStyles}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                送信前に全文を最終確認できます。
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={resetDraft}
                disabled={isSending}
              >
                下書きをクリア
              </Button>
              <Button onClick={handleOpenConfirm} disabled={isSending}>
                最終確認へ
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>送信前の最終確認</DialogTitle>
            <DialogDescription>
              内容を確認して問題なければ「この内容で送信」を押してください。
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
              修正する
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? '送信しています…' : 'この内容で送信'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
