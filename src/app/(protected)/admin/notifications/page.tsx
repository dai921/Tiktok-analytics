'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'

type NotificationAction = {
  id: string
  label: string
  description: string
  href: string
  variant?: 'default' | 'outline'
}

type NotificationWorkflow = {
  id: string
  title: string
  description: string
  actions: NotificationAction[]
}

const NOTIFICATION_WORKFLOWS: NotificationWorkflow[] = [
  {
    id: 'release_notes',
    title: 'リリースノート',
    description:
      '新機能や改善点をユーザーへ展開するための2ステップフローです。テンプレート編集で内容を整えてから、周知送信で配信します。',
    actions: [
      {
        id: 'release_template',
        label: 'テンプレート編集',
        description: '既存のテンプレートを編集して次回配信の下準備を行います。',
        href: '/admin/notifications/release/template',
        variant: 'outline',
      },
      {
        id: 'release_broadcast',
        label: '周知送信',
        description: '完成したリリースノートをメール／通知として即時配信します。',
        href: '/admin/notifications/release/broadcast',
      },
    ],
  },
  {
    id: 'incident_alerts',
    title: '障害アラート',
    description:
      'インシデント発生時に迅速に周知するためのテンプレ編集＋配信フローです。事前にテンプレを整備することで送信を効率化します。',
    actions: [
      {
        id: 'incident_template',
        label: 'テンプレート編集',
        description: '障害報告テンプレートの最新版をメンテナンスします。',
        href: '/admin/notifications/incident/template',
        variant: 'outline',
      },
      {
        id: 'incident_broadcast',
        label: '周知送信',
        description: '影響範囲・復旧状況を含む障害報告を関係者へ届けます。',
        href: '/admin/notifications/incident/broadcast',
      },
    ],
  },
]

export default function AdminNotificationSettingsPage() {
  const { isAdmin } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

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

  const handleNavigate = (href: string) => {
    if (!href) {
      toast({
        title: '画面が未実装です',
        description: 'リンク先が出来次第、再度お試しください。',
      })
      return
    }
    router.push(href)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">通知フロー管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          通知を受け取る設定ではなく、配信担当者向けの操作画面です。対象の通知を選び、テンプレ編集または周知送信のボタンからそれぞれの画面へ遷移してください。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {NOTIFICATION_WORKFLOWS.map((workflow) => (
          <Card key={workflow.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{workflow.title}</CardTitle>
              <CardDescription>{workflow.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {workflow.actions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-lg border border-dashed border-gray-200 p-3"
                >
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                  <Button
                    className="mt-3 w-full"
                    variant={action.variant ?? 'default'}
                    onClick={() => handleNavigate(action.href)}
                  >
                    {action.label}画面へ
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
