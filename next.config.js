/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['drive.google.com'],  // Google Driveのドメインを許可
  },
  async rewrites() {
    return [
      {
        source: '/api/sheets',
        destination: process.env.NEXT_PUBLIC_GAS_URL,
      },
      {
        source: '/api/sheets/:path*',
        destination: `${process.env.NEXT_PUBLIC_GAS_URL}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig 