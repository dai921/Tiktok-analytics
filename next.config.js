/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  experimental: {
    turbo: {
      rules: {
        '**': {
          loaders: ['@next/loader'],
        },
      },
    },
  },
};

module.exports = nextConfig; 