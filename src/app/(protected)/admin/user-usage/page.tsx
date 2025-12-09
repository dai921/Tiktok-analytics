'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Mic,
  RefreshCcw,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  MissingByAccountEntry,
  MissingUsageEntry,
  SessionSummary,
  SessionUsage,
  TranscriptionUsageEntry,
  fetchSessionUsage,
  fetchTranscriptionUsage,
} from '@/lib/api/admin-usage'

const PAGE_SIZE = 30

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  try {
    const date = new Date(value)
    return date.toLocaleString('ja-JP')
  } catch {
    return value
  }
}

export default function AdminUserUsagePage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sessionOrder, setSessionOrder] = useState<'asc' | 'desc'>('desc')
  const [summarySort, setSummarySort] = useState<'last_used_at' | 'session_count'>(
    'last_used_at',
  )
  const [transcriptionOrder, setTranscriptionOrder] = useState<'asc' | 'desc'>(
    'desc',
  )
  const [missingOrder, setMissingOrder] = useState<'asc' | 'desc'>('desc')
  const [missingByAccountOrder, setMissingByAccountOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())

  // ページネーション用のstate
  const [summaryDisplayCount, setSummaryDisplayCount] = useState(PAGE_SIZE)
  const [sessionsDisplayCount, setSessionsDisplayCount] = useState(PAGE_SIZE)
  const [accountsDisplayCount, setAccountsDisplayCount] = useState(PAGE_SIZE)

  const [sessions, setSessions] = useState<SessionUsage[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary[]>([])
  const [usageByUser, setUsageByUser] = useState<TranscriptionUsageEntry[]>([])
  const [missingByUser, setMissingByUser] = useState<MissingUsageEntry[]>([])
  const [missingByAccount, setMissingByAccount] = useState<MissingByAccountEntry[]>([])

  const loadData = useCallback(
    async (withSpinner: boolean = false) => {
      if (!isAdmin) return
      if (withSpinner) {
        setIsLoading(true)
      }

      try {
        const [sessionRes, transcriptionRes] = await Promise.all([
          fetchSessionUsage({
            order: sessionOrder,
            summarySort,
            summaryLimit: 100,
            sessionLimit: 300,
          }),
          fetchTranscriptionUsage({ missingLimit: 300 }),
        ])

        if (!sessionRes.success || !sessionRes.data) {
          throw new Error(sessionRes.error || 'セッションデータの取得に失敗しました。')
        }

        if (!transcriptionRes.success || !transcriptionRes.data) {
          throw new Error(
            transcriptionRes.error || '文字起こし利用状況の取得に失敗しました。',
          )
        }

        setSessions(sessionRes.data.sessions || [])
        setSessionSummary(sessionRes.data.summary || [])
        setUsageByUser(transcriptionRes.data.usage_by_user || [])
        setMissingByUser(transcriptionRes.data.missing_by_user || [])
        setMissingByAccount(transcriptionRes.data.missing_by_account || [])

        // データ更新時にページネーションをリセット
        setSummaryDisplayCount(PAGE_SIZE)
        setSessionsDisplayCount(PAGE_SIZE)
        setAccountsDisplayCount(PAGE_SIZE)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'データ取得に失敗しました',
          description:
            error instanceof Error
              ? error.message
              : 'データ取得に失敗しました',
        })
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [isAdmin, sessionOrder, summarySort, toast],
  )

  useEffect(() => {
    loadData(true)
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
  }

  const toggleAccountExpand = (accountName: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(accountName)) {
        next.delete(accountName)
      } else {
        next.add(accountName)
      }
      return next
    })
  }

  const sortedUsage = useMemo(() => {
    const sorted = [...usageByUser]
    sorted.sort((a, b) =>
      transcriptionOrder === 'desc'
        ? (b.transcription_count || 0) - (a.transcription_count || 0)
        : (a.transcription_count || 0) - (b.transcription_count || 0),
    )
    return sorted
  }, [usageByUser, transcriptionOrder])

  const sortedMissing = useMemo(() => {
    const sorted = [...missingByUser]
    sorted.sort((a, b) =>
      missingOrder === 'desc'
        ? (b.missing_count || 0) - (a.missing_count || 0)
        : (a.missing_count || 0) - (b.missing_count || 0),
    )
    return sorted
  }, [missingByUser, missingOrder])

  const sortedMissingByAccount = useMemo(() => {
    const sorted = [...missingByAccount]
    sorted.sort((a, b) =>
      missingByAccountOrder === 'desc'
        ? (b.total_count || 0) - (a.total_count || 0)
        : (a.total_count || 0) - (b.total_count || 0),
    )
    return sorted
  }, [missingByAccount, missingByAccountOrder])

  // 表示用にスライス
  const displayedSummary = sessionSummary.slice(0, summaryDisplayCount)
  const displayedSessions = sessions.slice(0, sessionsDisplayCount)
  const displayedAccounts = sortedMissingByAccount.slice(0, accountsDisplayCount)

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm text-muted-foreground">アクセス確認中です...</p>
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">ユーザー利用状況</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            セッション履歴と文字起こし利用状況を管理者向けにまとめています。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          データ更新
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          データを読み込み中です...
        </div>
      )}

      {/* ユーザーごとのセッション概要 - 最大100件 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ユーザーごとのセッション概要</CardTitle>
              <CardDescription>
                最終利用日時とセッション数の一覧です（最大100件）
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSessionOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                }
              >
                <Clock className="mr-2 h-4 w-4" />
                {sessionOrder === 'desc' ? '新しい順' : '古い順'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSummarySort((prev) =>
                    prev === 'last_used_at' ? 'session_count' : 'last_used_at',
                  )
                }
              >
                <Users className="mr-2 h-4 w-4" />
                {summarySort === 'last_used_at' ? '最終利用順' : 'セッション数順'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>最終利用日時(JST)</TableHead>
                  <TableHead className="text-right">セッション数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedSummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      データがありません。
                    </TableCell>
                  </TableRow>
                )}
                {displayedSummary.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.user_name || '未設定'}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.email || 'email未登録'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(row.last_used_at_jst || row.last_used_at)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.session_count.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              表示: {displayedSummary.length} / {sessionSummary.length} 件
            </p>
            {summaryDisplayCount < sessionSummary.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSummaryDisplayCount((prev) => prev + PAGE_SIZE)}
              >
                次へ（+{Math.min(PAGE_SIZE, sessionSummary.length - summaryDisplayCount)}件）
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 最新セッション - 最大300件 */}
      <Card>
        <CardHeader>
          <CardTitle>最新セッション（最大300件）</CardTitle>
          <CardDescription>
            直近の利用状況を確認できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>最終利用日時(JST)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedSessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                      データがありません。
                    </TableCell>
                  </TableRow>
                )}
                {displayedSessions.map((session, index) => (
                  <TableRow key={`${session.user_id}-${index}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {session.user_name || '未設定'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {session.email || 'email未登録'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(session.last_used_at_jst || session.last_used_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              表示: {displayedSessions.length} / {sessions.length} 件
            </p>
            {sessionsDisplayCount < sessions.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSessionsDisplayCount((prev) => prev + PAGE_SIZE)}
              >
                次へ（+{Math.min(PAGE_SIZE, sessions.length - sessionsDisplayCount)}件）
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 文字起こし利用状況 */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>文字起こし利用状況</CardTitle>
          <CardDescription>
            利用数が多い順・少ない順に並べ替えできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  文字起こし利用数
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTranscriptionOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  }
                  className="h-8 px-2 text-xs"
                >
                  {transcriptionOrder === 'desc' ? (
                    <>
                      <ArrowDown className="mr-1 h-3.5 w-3.5" />
                      多い順
                    </>
                  ) : (
                    <>
                      <ArrowUp className="mr-1 h-3.5 w-3.5" />
                      少ない順
                    </>
                  )}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ユーザー</TableHead>
                      <TableHead className="text-right">利用数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsage.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                          利用データがありません。
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedUsage.map((row) => (
                      <TableRow key={`${row.user_number}-${row.user_name}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{row.user_name || '未設定'}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.user_number ? `No. ${row.user_number}` : 'user_number未登録'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.transcription_count?.toLocaleString() ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  ツール未登録の文字起こし
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setMissingOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  }
                  className="h-8 px-2 text-xs"
                >
                  {missingOrder === 'desc' ? (
                    <>
                      <ArrowDown className="mr-1 h-3.5 w-3.5" />
                      多い順
                    </>
                  ) : (
                    <>
                      <ArrowUp className="mr-1 h-3.5 w-3.5" />
                      少ない順
                    </>
                  )}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ユーザー</TableHead>
                      <TableHead className="text-right">未登録件数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMissing.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                          未登録データはありません。
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedMissing.map((row) => (
                      <TableRow key={`${row.user_number}-${row.user_name}-missing`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{row.user_name || '未設定'}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.user_number ? `No. ${row.user_number}` : 'user_number未登録'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.missing_count?.toLocaleString() ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ツール未登録動画の詳細 - アカウント名単位でアコーディオン */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ツール未登録動画の詳細</CardTitle>
              <CardDescription>
                アカウント名をクリックすると、ユーザーごとの詳細が表示されます（最大300件）
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setMissingByAccountOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
              }
              className="h-8 px-2 text-xs"
            >
              {missingByAccountOrder === 'desc' ? (
                <>
                  <ArrowDown className="mr-1 h-3.5 w-3.5" />
                  多い順
                </>
              ) : (
                <>
                  <ArrowUp className="mr-1 h-3.5 w-3.5" />
                  少ない順
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayedAccounts.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              未登録データはありません。
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>アカウント名</TableHead>
                  <TableHead className="text-right">データ個数</TableHead>
                  <TableHead>アカウントURL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAccounts.map((account) => {
                  const accountName = account.account_name || 'N/A'
                  const isExpanded = expandedAccounts.has(accountName)
                  return (
                    <>
                      <TableRow
                        key={`account-${accountName}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleAccountExpand(accountName)}
                      >
                        <TableCell className="w-8">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          @{accountName}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {account.total_count?.toLocaleString() ?? 0}
                        </TableCell>
                        <TableCell>
                          {account.account_url ? (
                            <a
                              href={account.account_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              TikTokを見る <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && account.users && account.users.length > 0 && (
                        <TableRow key={`account-${accountName}-details`}>
                          <TableCell colSpan={4} className="bg-muted/30 p-0">
                            <div className="px-8 py-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">ユーザー名</TableHead>
                                    <TableHead className="text-xs text-right">データ個数</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {account.users.map((user, userIndex) => (
                                    <TableRow key={`${accountName}-user-${userIndex}`}>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          <span className="text-sm">{user.user_name || '未設定'}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {user.user_number ? `No. ${user.user_number}` : ''}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-medium">
                                        {user.data_count?.toLocaleString() ?? 0}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              表示: {displayedAccounts.length} / {sortedMissingByAccount.length} 件
            </p>
            {accountsDisplayCount < sortedMissingByAccount.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAccountsDisplayCount((prev) => prev + PAGE_SIZE)}
              >
                次へ（+{Math.min(PAGE_SIZE, sortedMissingByAccount.length - accountsDisplayCount)}件）
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
