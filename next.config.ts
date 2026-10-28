import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // turbopack 은 dev 서버에만 사용 · Vercel 프로덕션 빌드에는 불필요
  // ESM 환경에서 __dirname 접근 시 undefined 문제 회피
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // dev 서버의 디스크 캐시(.next/dev/cache)를 끈다. Next 16 은 기본으로 켜 둔다.
    // 이 캐시가 한 번 꼬이자 HMR 이 매번 "Next.js package not found" 로 실패했고,
    // 그때마다 서버가 브라우저에 새로고침을 보내 화면이 0.1초마다 새로고침됐다 (2026-10-28).
    // 이 폴더는 Dropbox 가 동기화하는 곳이라 캐시 파일을 붙잡아 다시 꼬일 수 있다.
    // 끄면 서버를 켤 때마다 처음부터 컴파일해 첫 화면이 몇 초 늦어질 뿐이다.
    turbopackFileSystemCacheForDev: false,
  },
}

export default nextConfig
