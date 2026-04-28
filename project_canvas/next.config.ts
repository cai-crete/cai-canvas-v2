import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: { unoptimized: true },
  transpilePackages: ['@cai-crete/print-components'],
  experimental: {
    serverActions: {
      // Next.js action-handler가 multipart/form-data POST를 인터셉트할 때의 크기 제한.
      // 이 값이 없으면 기본 1MB → 이미지 업로드 시 413 발생 후 BFF route handler가 실행조차 안 됨.
      bodySizeLimit: '50mb',
    },
  },
  webpack: (config, { dev }) => {
    // 개발 모드에서 파일 시스템 캐시를 비활성화하여 OneDrive 충돌 방지
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
