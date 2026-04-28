'use client';

import { useCallback, useEffect } from 'react';
import { PrintExpandedView as PkgPrintExpandedView } from '@cai-crete/print-components';
import type { PrintSaveResult, SelectedImage, PrintToolbarTools } from '@cai-crete/print-components';
import type { CanvasNode } from '@/types/canvas';

export interface PrintGenerateResult {
  thumbnailBase64: string;
}

interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
}

function parseNodeImage(raw: string): SelectedImage {
  let current  = raw;
  let mimeType: SelectedImage['mimeType'] = 'image/jpeg';
  while (current.startsWith('data:')) {
    const semi  = current.indexOf(';');
    const comma = current.indexOf(',');
    if (semi === -1 || comma === -1) break;
    mimeType = current.slice(5, semi) as SelectedImage['mimeType'];
    current  = current.slice(comma + 1);
  }
  return { id: 'node-image', base64: current.replace(/\s/g, ''), mimeType, filename: 'source.jpg' };
}

export default function PrintExpandedView({
  node,
  onCollapse,
  onGeneratePrintComplete,
}: Props) {
  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCollapse]);

  // 노드 이미지 → SelectedImage 변환
  const sourceImage = node.generatedImageData ?? node.thumbnailData;
  const selectedImages: SelectedImage[] = sourceImage ? [parseNodeImage(sourceImage)] : [];

  // 저장 완료 → Canvas 썸네일 업데이트
  const handleSave = useCallback((result: PrintSaveResult) => {
    onGeneratePrintComplete?.({ thumbnailBase64: result.thumbnail });
  }, [onGeneratePrintComplete]);

  // 패키지 Toolbar를 대체 — 닫기 버튼 포함한 커스텀 툴바
  const renderToolbarWrapper = useCallback((tools: PrintToolbarTools) => (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: 'var(--gap-global, 1rem)',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--gap-global, 1rem)',
        zIndex: 1100,
      }}
    >
      {/* 닫기(접기) 버튼 */}
      <button
        onClick={onCollapse}
        title="닫기 (Esc)"
        style={{
          width: '2.75rem', height: '2.75rem', borderRadius: '50%',
          backgroundColor: 'var(--color-white, #fff)',
          border: '1.5px solid var(--color-gray-200, #e5e7eb)',
          color: 'var(--color-gray-500, #6b7280)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
          fontSize: '1rem',
          flexShrink: 0,
        }}
      >✕</button>

      {/* Pill 묶음: Undo / Redo / Library / Saves */}
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '0.5rem',
          gap: '0.25rem',
          backgroundColor: 'var(--color-white, #fff)',
          borderRadius: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
        }}
      >
        {tools.undo}
        {tools.redo}
        <div style={{ width: '1.5rem', height: '1px', backgroundColor: '#e5e7eb', margin: '0.125rem auto' }} />
        {tools.library}
        {tools.saves}
      </div>

      {/* 저장 버튼 */}
      {tools.save}
    </div>
  ), [onCollapse]);

  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <PkgPrintExpandedView
        selectedImages={selectedImages}
        apiBaseUrl="/api/print-proxy"
        onSave={handleSave}
        onDelete={onCollapse}
        renderToolbarWrapper={renderToolbarWrapper}
      />
    </div>
  );
}
