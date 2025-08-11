import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Cookieからトークンと管理者フラグを取得（キー名を変更）
  const token = request.cookies.get('auth_token')?.value
  const isAdmin = request.cookies.get('is_admin')?.value === 'true'
  
  
  const path = request.nextUrl.pathname
  
  // 管理者専用ページかどうか（/admin/loginは除外）
  const isAdminPage = path === '/register' || (path.startsWith('/admin') && path !== '/admin/login')
  
  // レスポンスオブジェクトを作成
  let response = NextResponse.next()
  
  // すべてのページにX-Robots-Tagを設定（検索エンジンからのインデックスを防ぐ）
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  
  // 管理者ログインページへのアクセス
  if (path === '/admin/login') {
    // すでに認証済みの管理者の場合はダッシュボードへリダイレクト
    if (token && isAdmin) {
      return NextResponse.redirect(new URL('/register', request.url))
    }

    // 未認証の場合はそのまま管理者ログインページを表示
    return response
  }
  
  // 管理者専用ページに非管理者がアクセスした場合
  if (isAdminPage) {
    // トークンがないか、管理者でない場合
    if (!token || !isAdmin) {
      const adminLoginUrl = new URL('/admin/login', request.url)
      return NextResponse.redirect(adminLoginUrl)
    }
  }
    
  // 認証済みユーザーが一般認証ページにアクセス
  if (token && (path === '/login' )) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  // ダッシュボードへのアクセスには認証が必要
  if ((path.startsWith('/dashboard') || path.startsWith('/trends') || path.startsWith('/summary')) && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  console.log('Middleware実行:', {
    path,
    hasToken: !!token, 
    isAdmin,
    cookies: request.cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ')
  });
  
  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/trends/:path*',
    '/summary/:path*',
    '/corporate/:path*',
    '/overall-trends/:path*',
    '/transcription/:path*',
    '/login',
    '/register',
    '/admin/:path*',
    '/my-report/:path*',
  ]
} 