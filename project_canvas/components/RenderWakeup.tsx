'use client';

import { useEffect } from 'react';

export default function RenderWakeup() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_RENDER_HEALTH_URL;
    if (!url) return;
    fetch(`${url}/health`).catch(() => {});
    // print 서버도 동시에 웨이크업 (print-proxy를 통해 포워딩)
    fetch(`${url}/print-proxy/`, { method: 'HEAD' }).catch(() => {});
  }, []);

  return null;
}
