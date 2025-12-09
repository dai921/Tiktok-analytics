'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'
import {
  approvePrProduct,
  deletePrProduct,
  fetchPendingPrProducts,
  updatePrProduct,
} from '@/lib/api/influencer-pr-products'
import type { InfluencerPrProduct } from '@/types/influencerPrProduct'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type LoadOptions = {
  withSpinner?: boolean
}

const deriveEmbedUrl = (url?: string | null) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const href = parsed.href
    if (parsed.hostname.includes('tiktok.com')) {
      const videoMatch = href.match(/\/video\/(\d+)/)
      if (videoMatch && videoMatch[1]) {
        return `https://www.tiktok.com/embed/v2/${videoMatch[1]}`
      }
    }
    return href
  } catch {
    return null
  }
}

const AdminPrProductsPage = () => {
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [products, setProducts] = useState<InfluencerPrProduct[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftBrand, setDraftBrand] = useState('')
  const [rowLoadingMap, setRowLoadingMap] = useState<Record<number, boolean>>({})

  const setRowLoading = useCallback((productId: number, value: boolean) => {
    setRowLoadingMap((prev) => {
      if (value) {
        return { ...prev, [productId]: true }
      }
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }, [])

  const loadProducts = useCallback(
    async ({ withSpinner = true }: LoadOptions = {}) => {
      if (!isAdmin) {
        setIsLoading(false)
        setProducts([])
        return
      }

      if (withSpinner) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const response = await fetchPendingPrProducts()
        if (response.success && Array.isArray(response.data)) {
          setProducts(response.data)
        } else {
          throw new Error(response.error || '未判定PR商材の取得に失敗しました。')
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '未判定PR商材の取得に失敗しました。'
        setError(message)
        toast({
          variant: 'destructive',
          title: '取得に失敗しました',
          description: message,
        })
      } finally {
        if (withSpinner) {
          setIsLoading(false)
        }
      }
    },
    [isAdmin, toast],
  )

  useEffect(() => {
    loadProducts({ withSpinner: true })
  }, [loadProducts])

  const handleRefresh = useCallback(async () => {
    if (!isAdmin) return
    setIsRefreshing(true)
    await loadProducts({ withSpinner: false })
    setIsRefreshing(false)
  }, [isAdmin, loadProducts])

  const handleEditToggle = (product: InfluencerPrProduct) => {
    if (editingId === product.product_id) {
      setEditingId(null)
      setDraftName('')
      setDraftCategory('')
      setDraftBrand('')
      return
    }

    setEditingId(product.product_id)
    setDraftName(product.product_name ?? '')
    setDraftCategory(product.product_category ?? '')
    setDraftBrand(product.product_brand ?? '')
  }

  const handleSaveEdits = async (product: InfluencerPrProduct) => {
    if (rowLoadingMap[product.product_id]) return
    if (editingId !== product.product_id) return

    const name = draftName.trim()
    const brand = draftBrand.trim()
    const category = draftCategory.trim()

    if (!name || !brand || !category) {
      toast({
        variant: 'destructive',
        title: '入力内容を確認してください',
        description: '商品名・ブランド・カテゴリーは必須です。',
      })
      return
    }

    setRowLoading(product.product_id, true)

    try {
      const response = await updatePrProduct(product.product_id, {
        product_name: name,
        product_brand: brand,
        product_category: category,
      })
      if (!response.success) {
        throw new Error(response.error || '編集の保存に失敗しました。')
      }

      setProducts((prev) =>
        prev.map((item) =>
          item.product_id === product.product_id
            ? {
                ...item,
                product_name: name,
                product_brand: brand,
                product_category: category,
              }
            : item,
        ),
      )
      toast({
        title: '編集内容を保存しました',
        description: '編集した内容をPR商品に反映しました。',
      })
      setEditingId(null)
      setDraftName('')
      setDraftBrand('')
      setDraftCategory('')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '編集の保存に失敗しました。'
      toast({
        variant: 'destructive',
        title: '編集に失敗しました',
        description: message,
      })
    } finally {
      setRowLoading(product.product_id, false)
    }
  }

const handleApprove = async (product: InfluencerPrProduct) => {
    if (rowLoadingMap[product.product_id]) return
    if (editingId === product.product_id) return

    setRowLoading(product.product_id, true)

    try {
      const response = await approvePrProduct(product.product_id)
      if (!response.success) {
        throw new Error(response.error || 'PR未判定の承認に失敗しました。')
      }

      setProducts((prev) =>
        prev.filter((item) => item.product_id !== product.product_id),
      )
      toast({
        title: '承認しました',
        description: 'PR商品を承認済みに更新しました。',
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'PR商品の承認に失敗しました。'
      toast({
        variant: 'destructive',
        title: '承認に失敗しました',
        description: message,
      })
    } finally {
      setRowLoading(product.product_id, false)
    }
  }

const handleDelete = async (product: InfluencerPrProduct) => {
    if (rowLoadingMap[product.product_id]) return
    if (!window.confirm('この商品を削除しますか？')) return

    setRowLoading(product.product_id, true)

    try {
      const response = await deletePrProduct(product.product_id)
      if (!response.success) {
        throw new Error(response.error || 'PR商品の削除に失敗しました。')
      }

      setProducts((prev) =>
        prev.filter((item) => item.product_id !== product.product_id),
      )
      toast({
        title: '削除しました',
        description: 'PR商品を削除しました。',
      })
      if (editingId === product.product_id) {
        setEditingId(null)
        setDraftName('')
        setDraftCategory('')
        setDraftBrand('')
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'PR商品の削除に失敗しました。'
      toast({
        variant: 'destructive',
        title: '削除に失敗しました',
        description: message,
      })
    } finally {
      setRowLoading(product.product_id, false)
    }
  }

const pendingCountLabel = useMemo(() => {
    if (isLoading) return ''
    return `現在${products.length}件の未判定PR商材があります。`
  }, [isLoading, products.length])

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">未判定PR商材の管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            OKボタンでPR判定を完了できます。編集ボタンで商品名とカテゴリを調整してから承認してください。
          </p>
          {!!pendingCountLabel && (
            <p className="mt-2 text-sm text-muted-foreground">
              {pendingCountLabel}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          再読み込み
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        {isLoading ? (
          <div className="flex h-60 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>読み込み中です...</span>
          </div>
        ) : error ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={handleRefresh}>
              再試行する
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">
              未判定のPR商材はありません。
            </p>
            <Button variant="outline" onClick={handleRefresh}>
              最新の状態を確認
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">商品名</TableHead>
                <TableHead className="w-[20%]">ブランド</TableHead>
                <TableHead className="w-[20%]">カテゴリー</TableHead>
                <TableHead className="w-[20%]">ソース</TableHead>
                <TableHead className="w-[16%] whitespace-nowrap text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const isEditing = editingId === product.product_id
                const isRowBusy = !!rowLoadingMap[product.product_id]
                const embedUrl = deriveEmbedUrl(product.source_url)
                const primaryDisabled =
                  isRowBusy || (isEditing && (!draftName.trim() || !draftCategory.trim()))

                return (
                  <TableRow key={product.product_id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          autoFocus
                          placeholder="商品名を入力"
                        />
                      ) : (
                        product.product_name || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={draftBrand}
                          onChange={(event) => setDraftBrand(event.target.value)}
                          placeholder="ブランド名を入力"
                        />
                      ) : (
                        product.product_brand || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={draftCategory}
                          onChange={(event) =>
                            setDraftCategory(event.target.value)
                          }
                          placeholder="カテゴリーを入力"
                        />
                      ) : (
                        product.product_category || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {product.source_url ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              ソースを表示
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>ソースの確認</DialogTitle>
                              <DialogDescription>
                                商品名: {product.product_name || '未設定'} / ブランド:{' '}
                                {product.product_brand || '未設定'} / カテゴリー:{' '}
                                {product.product_category || '未設定'}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4">
                              {embedUrl ? (
                                <div className="mx-auto w-full max-w-md overflow-hidden rounded-lg border bg-black/5">
                                  <div className="relative aspect-[9/16]">
                                    <iframe
                                      src={embedUrl}
                                      title={`preview-${product.product_id}`}
                                      className="h-full w-full"
                                      allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                                      allowFullScreen
                                      referrerPolicy="no-referrer-when-downgrade"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  プレビューを生成できませんでした。
                                </p>
                              )}
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">
                                  元URL
                                </p>
                                <Link
                                  href={product.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 break-all text-primary underline-offset-4 hover:underline"
                                >
                                  {product.source_url}
                                </Link>
                                {embedUrl && (
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">
                                      埋め込み用URL
                                    </p>
                                    <code className="block w-full overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                                      {embedUrl}
                                    </code>
                                  </div>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          ソースが登録されていません
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-nowrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            isEditing ? handleSaveEdits(product) : handleApprove(product)
                          }
                          disabled={primaryDisabled}
                        >
                          {isRowBusy ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {isEditing ? '編集完了' : 'OK'}
                        </Button>
                        <Button
                          size="sm"
                          variant={isEditing ? 'secondary' : 'outline'}
                          onClick={() => handleEditToggle(product)}
                          disabled={isRowBusy}
                        >
                          {isEditing ? 'キャンセル' : '編集'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(product)}
                          disabled={isRowBusy}
                        >
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

export default AdminPrProductsPage
