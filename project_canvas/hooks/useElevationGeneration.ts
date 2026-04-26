'use client';

import { useState, useCallback } from 'react';
import { compressImageBase64 } from '@/lib/compressImage';
import type { ElevationAeplData, ElevationImages } from '@/types/canvas';

export interface ElevationResult {
  aepl: ElevationAeplData;
  images: ElevationImages;
}

export function useElevationGeneration() {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const generate = useCallback(
    async (
      imageBase64: string,
      mimeType: string,
      params: { prompt?: string },
    ): Promise<ElevationResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const compressed = await compressImageBase64(imageBase64, mimeType);

        const res = await fetch('/api/image-to-elevation', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: compressed.base64,
            mimeType:    compressed.mimeType,
            prompt:      params.prompt ?? '',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `API 오류: ${res.status}`);
        }

        const data = await res.json() as { success: boolean; aepl: ElevationAeplData; images: ElevationImages };
        return { aepl: data.aepl, images: data.images };
      } catch (err) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { isLoading, error, generate };
}
