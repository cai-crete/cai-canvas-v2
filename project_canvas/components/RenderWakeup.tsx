'use client';

import { useEffect } from 'react';

export default function RenderWakeup() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_RENDER_HEALTH_URL;
    if (url) fetch(`${url}/health`).catch(() => {});
  }, []);

  return null;
}
