'use client'

import { ChangeEvent, useEffect, useState } from 'react'

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

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)}KB`
  }
  return `${size}B`
}

export default function AdminNotificationSettingsPage() {
  const { isAdmin, isLoading } = useAuth()
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    }
  }, [imagePreviewUrl])

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
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImagePreviewUrl(null)
    setImageFile(null)
  }

  const handleSelectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!file.type?.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: '画像ファイルを選択してください',
        description: 'JPG/PNG/GIFなどの画像ファイルのみ添付できます。',
      })
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast({
        variant: 'destructive',
        title: 'ファイルサイズが大きすぎます',
        description: '10MB以下の画像を1枚だけアップロードできます。',
      })
      return
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }

    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImagePreviewUrl(null)
    setImageFile(null)
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
    const trimmedBody = body.trim()

    setIsSending(true)
    try {
      const token = localStorage.getItem('auth_token')
      const tokenType = localStorage.getItem('auth_token_type') || 'Bearer'

      if (!token) {
        throw new Error('認証情報がありません。ログインしてください。')
      }

      const formData = new FormData()
      formData.append('body', trimmedBody)
      if (imageFile) {
        formData.append('image', imageFile)
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/notifications`,
        {
          method: 'POST',
          headers: {
            Authorization: `${tokenType} ${token}`,
          },
          body: formData,
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.success) {
        const detail =
          data?.detail ||
          data?.message ||
          '通知の送信に失敗しました。時間をおいて再度お試しください。'
        throw new Error(String(detail))
      }

      toast({
        title: '通知を送信しました',
        description:
          data?.uploaded_image && imageFile
            ? `${data?.delivery_count ?? 0}件に画像付きで送信しました。`
            : `${data?.delivery_count ?? 0}件に送信しました。`,
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
            : 'エラーが発生しました。時間をおいて再度お試しください。',
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


            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">画像を1枚添付（任意）</label>
                <span className="text-xs text-muted-foreground">10MBまで</span>
              </div>
              <div className="rounded-md border border-dashed bg-muted/50 p-3">
                {imageFile ? (
                  <div className="flex items-center gap-3">
                    {imagePreviewUrl ? (
                      <div className="h-16 w-16 overflow-hidden rounded-md border bg-white">
                        <img
                          src={imagePreviewUrl}
                          alt="画像プレビュー"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{imageFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(imageFile.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                      disabled={isSending}
                    >
                      削除
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      1枚のみアップロードできます。JPG/PNG/GIFなどの画像に対応しています。
                    </p>
                    <label
                      className={`inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium text-primary transition ${isSending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted'}`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleSelectImage}
                        disabled={isSending}
                      />
                      画像を選択
                    </label>
                  </div>
                )}
              </div>
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
            <div className="space-y-1 rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">添付画像</p>
              {imageFile ? (
                <div className="flex items-center gap-3">
                  {imagePreviewUrl ? (
                    <div className="h-14 w-14 overflow-hidden rounded-md border bg-white">
                      <img
                        src={imagePreviewUrl}
                        alt="確認用の画像プレビュー"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{imageFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(imageFile.size)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">画像は添付されません</p>
              )}
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
