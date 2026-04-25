'use client';

import { useState, useEffect } from 'react';
import { CanvasNode } from '@/types/canvas';
import ExpandedSidebar from '@/components/ExpandedSidebar';
import { compressImageBase64 } from '@/lib/compressImage';

type PrintMode = 'REPORT' | 'DRAWING & SPECIFICATION' | 'PANEL' | 'VIDEO';
const MODES: PrintMode[] = ['REPORT', 'DRAWING & SPECIFICATION', 'PANEL', 'VIDEO'];

export interface PrintGenerateResult {
  thumbnailBase64: string;
}

interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

function normalizeImageSrc(img: string): string {
  if (img.startsWith('http') || img.startsWith('data:')) return img;
  return `data:image/jpeg;base64,${img}`;
}

export default function PrintExpandedView({
  node, onCollapse, onGeneratingChange, onGeneratePrintComplete,
}: Props) {
  const [mode, setMode]               = useState<PrintMode>('REPORT');
  const [pageCount, setPageCount]     = useState(3);
  const [prompt, setPrompt]           = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pages, setPages]             = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError]             = useState<string | null>(null);

  const sourceImage  = node.generatedImageData ?? node.thumbnailData;
  const hasResult    = pages.length > 0;
  const displayImage = hasResult
    ? normalizeImageSrc(pages[currentPage] ?? pages[0])
    : sourceImage ? normalizeImageSrc(sourceImage) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCollapse]);

  const handleGenerate = async () => {
    if (!sourceImage) { setError('이미지가 없습니다.'); return; }
    setIsGenerating(true);
    setError(null);
    onGeneratingChange?.(true);
    try {
      const isDataUrl  = sourceImage.startsWith('data:');
      const rawBase64  = isDataUrl ? sourceImage.split(',')[1] : sourceImage;
      const rawMime    = isDataUrl ? sourceImage.split(';')[0].split(':')[1] : 'image/jpeg';
      const { base64: compBase64, mimeType: compMime } = await compressImageBase64(rawBase64, rawMime);

      const formData = new FormData();
      formData.append('mode', mode);
      if (prompt.trim()) formData.append('prompt', prompt.trim());
      formData.append('pageCount', String(pageCount));
      formData.append('images', base64ToBlob(compBase64, compMime), 'image.jpg');

      const res = await fetch('/api/print-proxy/api/print', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `서버 오류 ${res.status}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const resultPages: string[] =
        Array.isArray(data.pages)          ? (data.pages  as string[]) :
        Array.isArray(data.images)         ? (data.images as string[]) :
        typeof data.result === 'string'    ? [data.result]             :
        typeof data.url    === 'string'    ? [data.url]                : [];

      if (resultPages.length === 0) throw new Error('결과 데이터가 없습니다.');

      setPages(resultPages);
      setCurrentPage(0);
      onGeneratePrintComplete?.({ thumbnailBase64: normalizeImageSrc(resultPages[0]) });
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 실패');
    } finally {
      setIsGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  const handleExport = () => {
    pages.forEach((page, i) => {
      const src = normalizeImageSrc(page);
      const a = document.createElement('a');
      if (src.startsWith('http')) {
        a.href = src;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.href = src;
      }
      a.download = `print-${mode.toLowerCase().replace(/[\s&]+/g, '-')}-p${i + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-family-pretendard)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: 'var(--color-gray-400)',
    marginBottom: '0.5rem',
  };

  const stepperBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: '50%',
    border: '1.5px solid var(--color-gray-200)',
    background: 'transparent',
    color: disabled ? 'var(--color-gray-300)' : 'var(--color-gray-500)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '1.125rem', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  });

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>

      {/* ── 메인 영역 ── */}
      <div style={{
        position: 'absolute', inset: 0,
        right: 'calc(var(--sidebar-w) + 2rem)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '1rem', padding: '2rem', overflow: 'hidden',
      }}>
        {displayImage ? (
          <>
            <img
              src={displayImage}
              alt="print preview"
              style={{
                maxWidth: '100%',
                maxHeight: pages.length > 1 ? 'calc(100% - 3.5rem)' : '100%',
                objectFit: 'contain',
                borderRadius: 'var(--radius-box)',
                boxShadow: 'var(--shadow-float)',
              }}
            />
            {hasResult && pages.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  style={stepperBtnStyle(currentPage === 0)}
                >←</button>
                <span style={{
                  fontSize: '0.8125rem', color: 'var(--color-gray-400)',
                  fontFamily: 'var(--font-family-pretendard)',
                }}>
                  {currentPage + 1} / {pages.length}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                  disabled={currentPage === pages.length - 1}
                  style={stepperBtnStyle(currentPage === pages.length - 1)}
                >→</button>
              </div>
            )}
          </>
        ) : (
          <div style={{
            width: '100%', maxWidth: 480,
            aspectRatio: '210 / 297',
            background: 'var(--color-white)',
            borderRadius: 'var(--radius-box)',
            boxShadow: 'var(--shadow-float)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="text-caption" style={{ color: 'var(--color-gray-300)' }}>
              이미지를 선택한 후 GENERATE를 클릭하세요
            </span>
          </div>
        )}

        {error && (
          <div style={{
            padding: '0.5rem 0.875rem',
            background: '#FFF5F5',
            border: '1px solid #FFCCCC',
            borderRadius: 'var(--radius-box)',
            fontSize: '0.8125rem',
            color: '#EF4444',
            fontFamily: 'var(--font-family-pretendard)',
            maxWidth: '100%',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ── 사이드바 ── */}
      <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* 스크롤 가능 패널 영역 */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '1rem',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
          }}>

            {/* PURPOSE */}
            <div>
              <div style={labelStyle}>PURPOSE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius-box)',
                      border: `1.5px solid ${mode === m ? 'var(--color-black)' : 'var(--color-gray-200)'}`,
                      background: mode === m ? 'var(--color-black)' : 'transparent',
                      color: mode === m ? 'var(--color-white)' : 'var(--color-gray-500)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-family-pretendard)',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'background 100ms, color 100ms, border-color 100ms',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* NUMBER OF PAGES */}
            <div>
              <div style={labelStyle}>NUMBER OF PAGES</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <button
                  onClick={() => setPageCount(p => Math.max(1, p - 1))}
                  disabled={pageCount <= 1}
                  style={stepperBtnStyle(pageCount <= 1)}
                >−</button>
                <span style={{
                  fontSize: '1rem', fontWeight: 600, minWidth: 28,
                  textAlign: 'center', fontFamily: 'var(--font-family-pretendard)',
                  color: 'var(--color-black)',
                }}>
                  {pageCount}
                </span>
                <button
                  onClick={() => setPageCount(p => Math.min(12, p + 1))}
                  disabled={pageCount >= 12}
                  style={stepperBtnStyle(pageCount >= 12)}
                >+</button>
              </div>
            </div>

            {/* PROMPT */}
            <div>
              <div style={labelStyle}>PROMPT</div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="문서 생성을 위한 프롬프트를 입력해 주세요. (선택사항)"
                rows={4}
                style={{
                  width: '100%', resize: 'none',
                  padding: '0.625rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-family-pretendard)',
                  lineHeight: 1.5,
                  border: '1.5px solid var(--color-gray-200)',
                  borderRadius: 'var(--radius-box)',
                  background: 'transparent',
                  color: 'var(--color-gray-500)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* 하단 버튼 */}
          <div style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--color-gray-100)',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
            flexShrink: 0,
          }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !sourceImage}
              style={{
                width: '100%', height: 'var(--h-cta-lg)',
                borderRadius: 'var(--radius-pill)', border: 'none',
                background: isGenerating || !sourceImage ? 'var(--color-gray-200)' : 'var(--color-black)',
                color: isGenerating || !sourceImage ? 'var(--color-gray-300)' : 'var(--color-white)',
                fontFamily: 'var(--font-family-bebas)',
                fontSize: '1rem', letterSpacing: '0.08em',
                cursor: isGenerating || !sourceImage ? 'not-allowed' : 'pointer',
                transition: 'background 100ms, color 100ms',
              }}
            >
              {isGenerating ? 'GENERATING...' : 'GENERATE'}
            </button>
            <button
              onClick={handleExport}
              disabled={!hasResult}
              style={{
                width: '100%', height: 'var(--h-cta-lg)',
                borderRadius: 'var(--radius-pill)',
                border: `1.5px solid ${hasResult ? 'var(--color-gray-500)' : 'var(--color-gray-200)'}`,
                background: 'transparent',
                color: hasResult ? 'var(--color-gray-500)' : 'var(--color-gray-300)',
                fontFamily: 'var(--font-family-bebas)',
                fontSize: '1rem', letterSpacing: '0.08em',
                cursor: hasResult ? 'pointer' : 'not-allowed',
                transition: 'all 100ms',
              }}
            >
              EXPORT
            </button>
          </div>
        </div>
      </ExpandedSidebar>
    </div>
  );
}
