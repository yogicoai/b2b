import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // turbopack 은 dev 서버에만 사용 · Vercel 프로덕션 빌드에는 불필요
  // ESM 환경에서 __dirname 접근 시 undefined 문제 회피
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
