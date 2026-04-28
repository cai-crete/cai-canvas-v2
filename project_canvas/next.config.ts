import type { NextConfig } from 'next';
import path from 'path';

const PRINT_PKG = path.resolve('./node_modules/@cai-crete/print-components');

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: { unoptimized: true },
  transpilePackages: ['@cai-crete/print-components'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // BFF proxy route handler도 적용 (Next.js 15.1+)
    },
  },
  webpack: (config, { dev }) => {
    // 개발 모드에서 파일 시스템 캐시를 비활성화하여 OneDrive 충돌 방지
    if (dev) {
      config.cache = false;
    }
    // print-components 패키지 내부의 @/ 경로를 패키지 내부로 리디렉션
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/app':                `${PRINT_PKG}/app`,
      '@/types/print-canvas': `${PRINT_PKG}/types/print-canvas`,
      '@/lib/types':          `${PRINT_PKG}/lib/types`,
      '@/lib/export':         `${PRINT_PKG}/lib/export`,
      '@/lib/saves':          `${PRINT_PKG}/lib/saves`,
      '@/lib/imageUtils':     `${PRINT_PKG}/lib/imageUtils`,
      '@/lib/thumbnailUtils': `${PRINT_PKG}/lib/thumbnailUtils`,
      '@/lib/htmlUtils':      `${PRINT_PKG}/lib/htmlUtils`,
      '@/lib/agentErrors':    `${PRINT_PKG}/lib/agentErrors`,
    };
    return config;
  },
};

export default nextConfig;
