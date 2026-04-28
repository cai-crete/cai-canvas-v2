'use client';

import { useState, useEffect } from 'react';
import { CanvasNode, ElevationAeplData, ElevationImages } from '@/types/canvas';
import ExpandedSidebar from '@/components/ExpandedSidebar';
import { useElevationGeneration } from '@/hooks/useElevationGeneration';

export interface ElevationGenerateResult {
  sketchBase64: string;
  aepl: ElevationAeplData;
  images: ElevationImages;
  nodeId: string;
}

interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  isGenerating?: boolean;
  onGenerateElevationComplete?: (params: ElevationGenerateResult) => void;
}

function normalizeImageSrc(img: string): string {
  if (img.startsWith('http') || img.startsWith('data:')) return img;
  return `data:image/jpeg;base64,${img}`;
}

/* ── IconLoader ─────────────────────────────────────────────────── */
function IconLoader() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

/* ── CrossGrid ──────────────────────────────────────────────────── */
function CrossGrid({ images }: { images: ElevationImages }) {
  const cell = (src: string, label: string) => (
    <div style={{ position: 'relative', background: '#000', overflow: 'hidden', minHeight: 0 }}>
      <img src={normalizeImageSrc(src)} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <span style={{
        position: 'absolute', top: 6, left: 8,
        fontFamily: 'var(--font-family-bebas)',
        fontSize: '0.6rem', letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.55)',
        pointerEvents: 'none',
      }}>{label}</span>
    </div>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 2fr 1fr',
      gridTemplateRows: '1fr 2fr 1fr',
      gap: 3,
      width: '100%',
      height: '100%',
      background: 'var(--color-app-bg)',
    }}>
      {/* row 0 */}
      <div />
      {cell(images.top,   'TOP')}
      <div />
      {/* row 1 */}
      {cell(images.left,  'LEFT')}
      {cell(images.front, 'FRONT')}
      {cell(images.right, 'RIGHT')}
      {/* row 2 */}
      <div />
      {cell(images.rear,  'REAR')}
      <div />
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function ElevationExpandedView({
  node, onCollapse, onGeneratingChange, isGenerating: externalIsGenerating = false,
  onGenerateElevationComplete,
}: Props) {
  const [elevPrompt, setElevPrompt] = useState(node.elevationPanelSettings?.prompt ?? '');
  const [promptChanged, setPromptChanged] = useState(false);

  const { isLoading, generate } = useElevationGeneration();

  const effectiveIsGenerating = externalIsGenerating || isLoading;

  const hasResult  = !!node.elevationImages && !promptChanged;
  const buttonMode: 'generate' | 'generating' | 'export' =
    effectiveIsGenerating ? 'generating' :
    hasResult             ? 'export'     : 'generate';

  const sourceImage = node.thumbnailData ?? node.generatedImageData ?? null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCollapse]);

  const handleGenerate = async () => {
    if (effectiveIsGenerating) return;
    if (!sourceImage) return;

    const raw = sourceImage.startsWith('data:') ? sourceImage.split(',')[1] : sourceImage;
    const mime = sourceImage.startsWith('data:')
      ? sourceImage.split(';')[0].split(':')[1]
      : 'image/jpeg';

    onGeneratingChange?.(true);
    onCollapse();

    const result = await generate(raw, mime, { prompt: elevPrompt.trim() });
    if (result) {
      onGenerateElevationComplete?.({
        sketchBase64: sourceImage,
        aepl:   result.aepl,
        images: result.images,
        nodeId: node.id,
      });
    } else {
      onGeneratingChange?.(false);
    }
  };

  const handleExport = () => {
    if (!node.elevationImages) return;
    const imgs = node.elevationImages;
    const views: Array<[string, string]> = [
      ['front', imgs.front],
      ['rear',  imgs.rear],
      ['left',  imgs.left],
      ['right', imgs.right],
      ['top',   imgs.top],
    ];
    views.forEach(([label, src]) => {
      const a = document.createElement('a');
      a.href = normalizeImageSrc(src);
      a.download = `elevation-${label}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  /* ── 메인 영역 콘텐츠 ── */
  const mainContent = () => {
    if (hasResult && node.elevationImages) {
      return <CrossGrid images={node.elevationImages} />;
    }
    if (sourceImage) {
      return (
        <img
          src={normalizeImageSrc(sourceImage)}
          alt="source"
          style={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 'var(--radius-box)',
            boxShadow: 'var(--shadow-float)',
          }}
        />
      );
    }
    return (
      <div style={{
        width: '100%', maxWidth: 480,
        aspectRatio: '297 / 210',
        background: 'var(--color-white)',
        borderRadius: 'var(--radius-box)',
        boxShadow: 'var(--shadow-float)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="text-caption" style={{ color: 'var(--color-gray-300)' }}>
          이미지를 선택한 후 GENERATE를 클릭하세요
        </span>
      </div>
    );
  };

  /* ── ELEVATION SPEC 패널 ── */
  const aeplData = node.elevationAeplData;
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-family-pretendard)',
    fontSize: '0.6875rem', fontWeight: 600,
    letterSpacing: '0.08em', color: 'var(--color-gray-400)',
    marginBottom: '0.5rem',
  };

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>

      {/* ── 메인 영역 ── */}
      <div style={{
        position: 'absolute', inset: 0,
        right: 'calc(var(--sidebar-w) + 2rem)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', overflow: 'hidden',
      }}>
        {mainContent()}
      </div>

      {/* ── 사이드바 ── */}
      <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* 스크롤 가능 패널 */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '1rem',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
          }}>

            {/* PROMPT */}
            <div>
              <div style={labelStyle}>PROMPT</div>
              <textarea
                value={elevPrompt}
                onChange={e => { setElevPrompt(e.target.value); setPromptChanged(true); }}
                placeholder="입면도 생성을 위한 프롬프트를 입력해 주세요. (선택사항)"
                maxLength={1000}
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

            {/* ELEVATION SPEC */}
            <div>
              <div style={labelStyle}>ELEVATION SPEC</div>
              {aeplData ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  padding: '0.75rem',
                  background: 'var(--color-white)',
                  borderRadius: 'var(--radius-box)',
                  border: '1px solid var(--color-gray-100)',
                }}>
                  {/* Proportions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>W × H × D</span>
                    <span style={{ fontFamily: 'var(--font-family-bebas)', fontSize: '0.875rem', color: 'var(--color-black)', letterSpacing: '0.04em' }}>
                      {aeplData.width.toFixed(1)} × {aeplData.height.toFixed(1)} × {aeplData.depth.toFixed(1)}
                    </span>
                  </div>
                  {/* Void Ratio */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>VOID RATIO</span>
                    <span style={{ fontFamily: 'var(--font-family-bebas)', fontSize: '0.875rem', color: 'var(--color-black)', letterSpacing: '0.04em' }}>
                      {Math.round(aeplData.voidRatio * 100)}%
                    </span>
                  </div>
                  {/* Base Material */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>BASE</span>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-black)', textTransform: 'uppercase' }}>
                      {aeplData.baseMaterial}
                    </span>
                  </div>
                  {/* Secondary Material */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>SECONDARY</span>
                    <span style={{ fontFamily: 'var(--font-family-pretendard)', fontSize: '0.75rem', color: 'var(--color-black)', textTransform: 'uppercase' }}>
                      {aeplData.secondaryMaterial}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '0.75rem',
                  background: 'var(--color-white)',
                  borderRadius: 'var(--radius-box)',
                  border: '1px solid var(--color-gray-100)',
                }}>
                  <span className="text-caption" style={{ color: 'var(--color-gray-300)' }}>No report yet.</span>
                </div>
              )}
            </div>
          </div>

          {/* 하단 CTA */}
          <div style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--color-gray-100)',
            flexShrink: 0,
          }}>
            {buttonMode === 'export' ? (
              <button
                onClick={handleExport}
                style={{
                  width: '100%', height: 'var(--h-cta-lg)',
                  borderRadius: 'var(--radius-pill)',
                  border: '1.5px solid var(--color-gray-500)',
                  background: 'transparent',
                  color: 'var(--color-gray-500)',
                  fontFamily: 'var(--font-family-bebas)',
                  fontSize: '1rem', letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'all 100ms',
                }}
              >
                EXPORT
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={buttonMode === 'generating' || !sourceImage}
                style={{
                  width: '100%', height: 'var(--h-cta-lg)',
                  borderRadius: 'var(--radius-pill)', border: 'none',
                  background: buttonMode === 'generating' || !sourceImage
                    ? 'var(--color-gray-200)'
                    : 'var(--color-black)',
                  color: buttonMode === 'generating' || !sourceImage
                    ? 'var(--color-gray-300)'
                    : 'var(--color-white)',
                  fontFamily: 'var(--font-family-bebas)',
                  fontSize: '1rem', letterSpacing: '0.08em',
                  cursor: buttonMode === 'generating' || !sourceImage ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  transition: 'background 100ms, color 100ms',
                }}
              >
                {buttonMode === 'generating' ? <><IconLoader />GENERATING...</> : 'GENERATE'}
              </button>
            )}
          </div>
        </div>
      </ExpandedSidebar>
    </div>
  );
}
