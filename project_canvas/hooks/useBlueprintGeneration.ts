'use client';

import { useState, useCallback } from 'react';
import { compressImageBase64 } from '@/lib/compressImage';
import type { SelectedImage } from '@cai-crete/print-components';
import type { MultiSourceAnalysisReport } from '@/types/canvas';

export interface GenerationParams {
  userPrompt?: string;
  vizMode?: string;
  styleMode?: string;
  resolution?: string;
  aspectRatio?: string;
}

export interface GenerationResult {
  generatedImage: string | null;
  analysisReport: MultiSourceAnalysisReport | Record<string, unknown> | null;
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
  const [analysisReport, setAnalysisReport] = useState<MultiSourceAnalysisReport | Record<string, unknown> | null>(null);

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
        /* Vercel 4.5MB body 제한 대응: 이미지 압축
         * 멀티소스 시 총 페이로드 예산:
         *   sketch ~1MB binary, 각 input_source ~1MB binary → base64 합계 ≈ 4MB 이하
         */
        const hasInputSources = inputSources && inputSources.length > 0;
        const sketchMaxBytes  = hasInputSources ? 1 * 1024 * 1024 : 3 * 1024 * 1024;
        const compressed = await compressImageBase64(sketchBase64, 'image/png', sketchMaxBytes);

        const body: Record<string, unknown> = {
          sketch_image: compressed.base64,
          mime_type:    compressed.mimeType,
          user_prompt:  params.userPrompt  ?? '',
          viz_mode:     params.vizMode     ?? 'CONCEPT',
          style_mode:   params.styleMode   ?? 'NONE',
          resolution:   params.resolution  ?? 'NORMAL QUALITY',
          aspect_ratio: params.aspectRatio ?? '4:3',
        };

        if (hasInputSources) {
          const roles = ['평면도', '입면도'];
          const INPUT_MAX_BYTES = 1 * 1024 * 1024; // 각 입력 이미지 1MB 제한
          const compressedSources = await Promise.all(
            inputSources!.map((img) => compressImageBase64(img.base64, img.mimeType, INPUT_MAX_BYTES))
          );
          body.input_sources = inputSources!.map((img, idx) => ({
            id:        img.id,
            data:      compressedSources[idx].base64,
            mime_type: compressedSources[idx].mimeType,
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

        const data = await res.json() as { generated_image: string; analysis_report: MultiSourceAnalysisReport | Record<string, unknown> };
        setGeneratedImage(data.generated_image);
        setAnalysisReport(data.analysis_report ?? null);
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
