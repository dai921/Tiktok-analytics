/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],  // Google Driveのドメインを許可
  },
  // リライトルールを一時的にコメントアウト
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/sheets',
  //       destination: process.env.NEXT_PUBLIC_GAS_URL,
  //     },
  //     {
  //       source: '/api/sheets/:path*',
  //       destination: `${process.env.NEXT_PUBLIC_GAS_URL}/:path*`,
  //     },
  //   ]
  // },
}

module.exports = nextConfig 