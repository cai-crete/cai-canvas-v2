'use client';

import { useState, useCallback } from 'react';
import { compressImageBase64 } from '@/lib/compressImage';
import type { SelectedImage } from '@cai-crete/print-components';

export interface GenerationParams {
  userPrompt?: string;
  vizMode?: string;
  styleMode?: string;
  resolution?: string;
  aspectRatio?: string;
}

export interface GenerationResult {
  generatedImage: string | null;
  analysisReport: Record<string, unknown> | null;
}

export interface UseBlueprintGenerationReturn extends GenerationResult {
  isLoading: boolean;
  error: string | null;
  generate: (
    sketchBase64: string,
    params?: GenerationParams,
    signal?: AbortSignal,
    inputSources?: SelectedImage[]
  ) => Promise<string | null>;
  reset: () => void;
}

export function useBlueprintGeneration(): UseBlueprintGenerationReturn {
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<Record<string, unknown> | null>(null);

  const generate = useCallback(
    async (
      sketchBase64: string,
      params: GenerationParams = {},
      signal?: AbortSignal,
      inputSources?: SelectedImage[]
    ): Promise<string | null> => {
      setIsLoading(true);
      setError(null);

      try {
        /* Vercel 4.5MB body 제한 대응: 이미지 압축 */
        const compressed = await compressImageBase64(sketchBase64, 'image/png');

        const body: Record<string, unknown> = {
          sketch_image: compressed.base64,
          mime_type:    compressed.mimeType,
          user_prompt:  params.userPrompt  ?? '',
          viz_mode:     params.vizMode     ?? 'CONCEPT',
          style_mode:   params.styleMode   ?? 'NONE',
          resolution:   params.resolution  ?? 'NORMAL QUALITY',
          aspect_ratio: params.aspectRatio ?? '4:3',
        };

        if (inputSources && inputSources.length > 0) {
          const roles = ['평면도', '입면도'];
          body.input_sources = inputSources.map((img, idx) => ({
            id:        img.id,
            data:      img.base64,
            mime_type: img.mimeType,
            role:      roles[idx] ?? `소스 ${idx + 1}`,
          }));
        }

        const res = await fetch('/api/sketch-to-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `API 오류: ${res.status}`);
        }

        const data = await res.json() as { generated_image: string; analysis_report: Record<string, unknown> };
        setGeneratedImage(data.generated_image);
        setAnalysisReport(data.analysis_report);
        return data.generated_image;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setGeneratedImage(null);
    setAnalysisReport(null);
    setError(null);
  }, []);

  return { isLoading, error, generatedImage, analysisReport, generate, reset };
}
