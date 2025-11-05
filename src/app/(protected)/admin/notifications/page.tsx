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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'

type NotificationOption = {
  id: string
  label: string
  description: string
}

type NotificationGroup = {
  id: string
  title: string
  description: string
  options: NotificationOption[]
}

const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    id: 'pr',
    title: 'PR関連',
    description:
      'PR未判定や差し戻しなど、インフルエンサーPR商材に関する通知設定です。',
    options: [
      {
        id: 'pending_pr_alert',
        label: '未判定PR商材の通知',
        description:
          '判定待ちのPR商材が一定件数を超えたときに通知します。',
      },
      {
        id: 'stale_pr_alert',
        label: '滞留アラート',
        description: '3日以上判定されていないPR商材がある場合に通知します。',
      },
    ],
  },
  {
    id: 'report',
    title: 'レポート＆トレンド',
    description: 'My Reportやトレンド関連の更新を知らせる通知です。',
    options: [
      {
        id: 'my_report_ready',
        label: 'My Report集計完了',
        description: 'My Reportの最新集計が完了したタイミングで通知します。',
      },
      {
        id: 'trend_digest',
        label: '週次トレンドダイジェスト',
        description: '週に一度、主要トレンドのサマリーをメールで受け取ります。',
      },
    ],
  },
  {
    id: 'system',
    title: 'システム',
    description: 'システム保守やアカウント関連のお知らせです。',
    options: [
      {
        id: 'release_note',
        label: 'リリースノート',
        description: '新機能や改善内容をまとめたリリースノートを受け取ります。',
      },
      {
        id: 'incident_alert',
        label: '障害アラート',
        description: '障害や遅延が発生した際に即座に通知します。',
      },
    ],
  },
]

export default function AdminNotificationSettingsPage() {
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {}
    NOTIFICATION_GROUPS.forEach((group) => {
      group.options.forEach((option) => {
        defaults[option.id] = false
      })
    })
    return defaults
  })

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

  const handleToggle = (id: string) => {
    setPreferences((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleSave = () => {
    toast({
      title: '通知設定を保存しました',
      description: '保存内容は現在ローカルに保持されています。API連携は今後追加予定です。',
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">通知設定</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          重要なイベントを見逃さないよう、受け取りたい通知を選択してください。現在はプレースホルダーのUIで、保存内容はブラウザ上で完結します。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {NOTIFICATION_GROUPS.map((group) => (
          <Card key={group.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {group.options.map((option) => (
                <label
                  key={option.id}
                  className="flex items-start gap-3 rounded-lg border border-dashed border-gray-200 p-3"
                >
                  <Checkbox
                    id={option.id}
                    checked={preferences[option.id]}
                    onCheckedChange={() => handleToggle(option.id)}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor={option.id} className="text-base">
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end border-t border-gray-200 pt-4">
        <Button onClick={handleSave}>設定を保存</Button>
      </div>
    </div>
  )
}
