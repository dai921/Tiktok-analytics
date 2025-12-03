'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  ExternalLink,
  Loader2,
  Mic,
  RefreshCcw,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
  MissingUsageEntry,
  MissingVideoEntry,
  SessionSummary,
  SessionUsage,
  TranscriptionUsageEntry,
  fetchSessionUsage,
  fetchTranscriptionUsage,
} from '@/lib/api/admin-usage'

type MissingVideosByUser = MissingUsageEntry & {
  videos: MissingVideoEntry[]
}

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

  const [sessions, setSessions] = useState<SessionUsage[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary[]>([])
  const [usageByUser, setUsageByUser] = useState<TranscriptionUsageEntry[]>([])
  const [missingByUser, setMissingByUser] = useState<MissingUsageEntry[]>([])
  const [missingVideos, setMissingVideos] = useState<MissingVideoEntry[]>([])

  const loadData = useCallback(
    async (withSpinner: boolean = false) => {
      if (!isAdmin) return
      if (withSpinner) {
        setIsLoading(true)
      }

      try {
        const [sessionRes, transcriptionRes] = await Promise.all([
          fetchSessionUsage({ order: sessionOrder, summarySort }),
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
        setMissingVideos(transcriptionRes.data.missing_videos || [])
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

  const missingVideosByUser = useMemo<MissingVideosByUser[]>(() => {
    const grouped = new Map<string, MissingVideoEntry[]>()
    missingVideos.forEach((video) => {
      const key = String(video.user_number ?? video.user_name ?? 'unknown')
      const current = grouped.get(key) || []
      grouped.set(key, [...current, video])
    })

    return sortedMissing.map((user) => {
      const key = String(user.user_number ?? user.user_name ?? 'unknown')
      return {
        ...user,
        videos: grouped.get(key) || [],
      }
    })
  }, [missingVideos, sortedMissing])

  const totalSessions = sessions.length
  const totalUsers = sessionSummary.length
  const totalTranscriptions = useMemo(
    () => usageByUser.reduce((sum, item) => sum + (item.transcription_count || 0), 0),
    [usageByUser],
  )
  const totalMissingVideos = missingVideos.length

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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSessionOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
            }
          >
            <Clock className="mr-2 h-4 w-4" />
            {sessionOrder === 'desc' ? '新しい順' : '古い順'}で表示
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
      </div>

      {isLoading && (
        <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          データを読み込み中です...
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">セッション数</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <p className="text-xs text-muted-foreground">取得済みセッション</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">利用ユーザー数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">セッションを持つユーザー</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">文字起こし総数</CardTitle>
            <Mic className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTranscriptions}</div>
            <p className="text-xs text-muted-foreground">完了した文字起こし合計</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">未登録動画</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMissingVideos}</div>
            <p className="text-xs text-muted-foreground">ツール未登録の文字起こし</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザーごとのセッション概要</CardTitle>
          <CardDescription>
            最終利用日時とセッション数の一覧です。並び替えはボタンで切り替えできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>ユーザー番号</TableHead>
                  <TableHead>最終利用日時(JST)</TableHead>
                  <TableHead className="text-right">セッション数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionSummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      データがありません。
                    </TableCell>
                  </TableRow>
                )}
                {sessionSummary.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.user_name || '未設定'}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.email || 'email未登録'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {row.user_number ?? 'N/A'}
                      </Badge>
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

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            取得順序: {sessionOrder === 'desc' ? '新しい順' : '古い順'} / 並び替えキー: {summarySort === 'last_used_at' ? '最終利用日時' : 'セッション数'}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最新セッション（最大30件）</CardTitle>
          <CardDescription>
            直近の利用状況を確認できます。トークンは一部のみマスクしています。
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>セッションID</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>最終利用日時(JST)</TableHead>
                <TableHead>トークンプレビュー</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    データがありません。
                  </TableCell>
                </TableRow>
              )}
              {sessions.slice(0, 30).map((session) => (
                <TableRow key={session.session_id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {session.session_id}
                  </TableCell>
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
                  <TableCell className="text-xs text-muted-foreground">
                    Token: {session.session_token_preview || 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sessions.length > 30 && (
            <p className="mt-2 text-xs text-muted-foreground">
              表示は30件までです。取得済みセッション数: {sessions.length}
            </p>
          )}
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>ツール未登録動画の詳細</CardTitle>
          <CardDescription>
            TikTokリンクに飛び、パケットキャプチャなどで登録を検討できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingVideosByUser.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              未登録データはありません。
            </div>
          )}

          {missingVideosByUser.map((group) => (
            <div
              key={`${group.user_number}-${group.user_name}-group`}
              className="rounded-lg border bg-muted/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{group.user_name || '未設定'}</span>
                    <Badge variant="secondary">
                      {group.user_number ? `No. ${group.user_number}` : 'user_number未登録'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    未登録件数: {group.missing_count?.toLocaleString() ?? 0}
                  </p>
                </div>
                <Badge variant="outline">{group.videos.length} 件</Badge>
              </div>

              <div className="mt-3 space-y-2">
                {group.videos.map((video) => (
                  <div
                    key={video.video_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/80 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">video_id: {video.video_id}</span>
                      <span className="text-xs text-muted-foreground">
                        account: {video.account_name || 'N/A'}
                      </span>
                      {video.file_path && (
                        <span className="text-xs text-muted-foreground">
                          file: {video.file_path}
                        </span>
                      )}
                    </div>
                    {video.video_url ? (
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        TikTokを見る <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        URLは生成できません。video_idで検索してください。
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            表示上限: missing_limit=300 で取得した結果を表示しています。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
