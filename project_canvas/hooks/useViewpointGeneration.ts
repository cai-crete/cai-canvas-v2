'use client';

import { useState, useCallback } from 'react';

export interface ViewpointParams {
  viewpoint: 'aerial' | 'street' | 'quarter' | 'detail';
  userPrompt?: string;
}

export interface ViewpointResult {
  generatedImage: string | null;
  analysis: string | null;
}

export interface UseViewpointGenerationReturn extends ViewpointResult {
  isLoading: boolean;
  error: string | null;
  generate: (
    imageBase64: string,
    mimeType: string,
    params: ViewpointParams,
    signal?: AbortSignal
  ) => Promise<string | null>;
  reset: () => void;
}

export function useViewpointGeneration(): UseViewpointGenerationReturn {
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [analysis,       setAnalysis]       = useState<string | null>(null);

  const generate = useCallback(
    async (
      imageBase64: string,
      mimeType: string,
      params: ViewpointParams,
      signal?: AbortSignal
    ): Promise<string | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const body = {
          image_base64: imageBase64,
          mime_type:    mimeType,
          viewpoint:    params.viewpoint,
          user_prompt:  params.userPrompt ?? '',
        };

        const res = await fetch('/api/change-viewpoint', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `API 오류: ${res.status}`);
        }

        const data = await res.json() as { generated_image: string; analysis: string };
        setGeneratedImage(data.generated_image);
        setAnalysis(data.analysis);
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
    setAnalysis(null);
    setError(null);
  }, []);

  return { isLoading, error, generatedImage, analysis, generate, reset };
}
