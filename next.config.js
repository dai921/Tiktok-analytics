/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],  // Google Driveのドメインを許可
  },
  // バックエンドAPIへのリダイレクト設定
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/health`,
      }
    ]
  },
  
  // ESLintチェックを無効化
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // 型チェックを無効化
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Cloud Runでの実行のためにスタンドアロンモードを有効化
  output: 'standalone',
}

module.exports = nextConfig 