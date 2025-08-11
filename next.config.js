/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',  // すべてのパスを許可
      }
    ]
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
  productionBrowserSourceMaps: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
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
  
  // // 動的レンダリングを強制
  // experimental: {
  //   // 動的なページのみを生成
  //   workerThreads: false,
  //   cpus: 1
  // }

  // セキュリティヘッダーを追加
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ]
  },
}

console.log("Next.js config:", JSON.stringify(nextConfig, null, 2));

module.exports = nextConfig 