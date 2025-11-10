'use client'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'

type PlannedDestination = {
  label: string
  href: string
  note?: string
}

type RoadmapSection = {
  id: string
  title: string
  status: '検討中' | '開発予定' | 'リリース準備中'
  description: string
  highlights: string[]
  destinations: PlannedDestination[]
}

const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    id: 'my-report',
    title: 'My Report拡張機能',
    status: '開発予定',
    description:
      'アカウントごとの深堀分析と共有導線を強化し、営業資料にも転用しやすいレポートへアップデートします。',
    highlights: [
      'ダッシュボードのカスタム指標配置',
      '定期配信メール・Slack通知との連携',
      '共有用リンクのアクセス制御',
    ],
    destinations: [
      {
        label: 'my-reportページを確認',
        href: '/my-report',
        note: '現行バージョン',
      },
    ],
  },
]

export default function AdminFeatureRoadmapPage() {
  const { isAdmin } = useAuth()

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
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">追加機能の予定</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ここでは今後追加予定の機能や既存ページへの導線をまとめています。各セクションから関連ページへ飛べるようにしているので、検証やレビューを素早く行えます。
        </p>
      </div>

      {ROADMAP_SECTIONS.map((section) => (
        <Card key={section.id}>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </div>
            <Badge variant="secondary">{section.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                注力ポイント
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {section.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                関連ページ
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {section.destinations.length > 0 ? (
                  section.destinations.map((destination) => (
                    <Button key={destination.href} variant="outline" asChild>
                      <Link href={destination.href}>
                        {destination.label}
                        {destination.note && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {destination.note}
                          </span>
                        )}
                      </Link>
                    </Button>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    リンク準備中
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
