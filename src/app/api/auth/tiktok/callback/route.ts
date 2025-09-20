import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const base = process.env.NEXT_PUBLIC_BASE_URL || url.origin

  if (error || !code) {
    const msg = encodeURIComponent(error || '認証に失敗しました')
    return NextResponse.redirect(new URL(`/my-report?error=${msg}`, base))
  }

  const api = process.env.NEXT_PUBLIC_API_URL
  if (!api) {
    const msg = encodeURIComponent('APIの設定が未設定です')
    return NextResponse.redirect(new URL(`/my-report?error=${msg}`, base))
  }

  try {
    const res = await fetch(`${api}/api/auth/tiktok/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const msg = encodeURIComponent('認証の完了に失敗しました')
      return NextResponse.redirect(new URL(`/my-report?error=${msg}`, base))
    }

    return NextResponse.redirect(new URL('/my-report?tiktok_connected=true', base))
  } catch (e) {
    const msg = encodeURIComponent('認証通信でエラーが発生しました')
    return NextResponse.redirect(new URL(`/my-report?error=${msg}`, base))
  }
}
