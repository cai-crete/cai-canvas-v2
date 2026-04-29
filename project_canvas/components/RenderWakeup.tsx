'use client';

import { useEffect } from 'react';

export default function RenderWakeup() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_RENDER_HEALTH_URL;
    if (!url) return;
    fetch(`${url}/health`).catch(() => {});
    // Render B 웨이크업은 Render A 서버가 시작 시 직접 처리
  }, []);

  return null;
}
