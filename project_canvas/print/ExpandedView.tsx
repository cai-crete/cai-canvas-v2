'use client';

import { useCallback, useEffect } from 'react';
import { PrintExpandedView as PkgPrintExpandedView } from '@cai-crete/print-components';
import type { PrintSaveResult, PrintToolbarTools, SelectedImage } from '@cai-crete/print-components';
import type { CanvasNode } from '@/types/canvas';

export interface PrintGenerateResult {
  thumbnailBase64: string;
}

interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
  onPrintNodeUpdate?: (updates: Partial<CanvasNode>) => void;
}

const IC = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IconUndo    = () => <svg viewBox="0 0 20 20" {...IC}><path d="M7 14L4 11L7 8" /><path d="M4 11H13A4 4 0 1 1 13 19" /></svg>;
const IconRedo    = () => <svg viewBox="0 0 20 20" {...IC}><path d="M13 14L16 11L13 8" /><path d="M16 11H7A4 4 0 1 0 7 19" /></svg>;
const IconLibrary = () => <svg viewBox="0 0 20 20" {...IC}><rect x="3" y="4" width="6" height="7" rx="1" /><rect x="11" y="4" width="6" height="7" rx="1" /><rect x="3" y="13" width="6" height="3" rx="1" /><rect x="11" y="13" width="6" height="3" rx="1" /></svg>;
const IconSave    = () => <svg viewBox="0 0 20 20" {...IC}><path d="M4 4H14L16 6V17A1 1 0 0 1 15 18H5A1 1 0 0 1 4 17V4Z" /><rect x="7" y="4" width="6" height="4" /><rect x="6" y="11" width="8" height="7" /></svg>;

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
  onPrintNodeUpdate,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCollapse]);

  // 저장된 이미지가 있으면 우선 사용, 없으면 generatedImageData 사용
  const selectedImages: SelectedImage[] = node.printSelectedImages
    ? node.printSelectedImages
    : node.generatedImageData ? [parseNodeImage(node.generatedImageData)] : [];

  // 저장 완료 → Canvas 썸네일 + 문서 상태 업데이트
  const handleSave = useCallback((result: PrintSaveResult) => {
    onGeneratePrintComplete?.({ thumbnailBase64: result.thumbnail });
    onPrintNodeUpdate?.({
      printSavedState: {
        html: result.html,
        mode: result.mode,
        metadata: result.metadata,
        savedAt: new Date().toISOString(),
      },
    });
  }, [onGeneratePrintComplete, onPrintNodeUpdate]);

  // 이미지 변경 콜백 → Canvas 노드에 저장
  const handleImagesChange = useCallback((images: SelectedImage[]) => {
    onPrintNodeUpdate?.({ printSelectedImages: images });
  }, [onPrintNodeUpdate]);

  // Canvas 전용 커스텀 툴바
  const renderToolbarWrapper = useCallback((tools: PrintToolbarTools) => {
    const toolBtnBase: React.CSSProperties = {
      width: 36, height: 36, border: 'none', borderRadius: '50%',
      background: 'transparent', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-gray-500)', transition: 'color 100ms ease',
      flexShrink: 0,
    };

    return (
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
        {/* 닫기 버튼 */}
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

        {/* 툴 Pill: Undo / Redo / Library */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0.5rem', gap: '0.25rem',
            backgroundColor: 'var(--color-white, #fff)',
            borderRadius: '2rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
          }}
        >
          <button
            title="실행 취소"
            disabled={!tools.canUndo}
            onClick={tools.onUndo}
            style={{ ...toolBtnBase, opacity: tools.canUndo ? 1 : 0.35, cursor: tools.canUndo ? 'pointer' : 'default' }}
          >
            <span style={{ width: 16, height: 16, display: 'flex' }}><IconUndo /></span>
          </button>
          <button
            title="다시 실행"
            disabled={!tools.canRedo}
            onClick={tools.onRedo}
            style={{ ...toolBtnBase, opacity: tools.canRedo ? 1 : 0.35, cursor: tools.canRedo ? 'pointer' : 'default' }}
          >
            <span style={{ width: 16, height: 16, display: 'flex' }}><IconRedo /></span>
          </button>
          <div style={{ width: '1.5rem', height: '1px', backgroundColor: '#e5e7eb', margin: '0.125rem auto' }} />
          <button
            title="라이브러리"
            onClick={tools.onOpenLibrary}
            style={toolBtnBase}
          >
            <span style={{ width: 16, height: 16, display: 'flex' }}><IconLibrary /></span>
          </button>
        </div>

        {/* 저장 버튼 */}
        <button
          title="저장"
          onClick={tools.onSave}
          style={{
            width: '2.75rem', height: '2.75rem', borderRadius: '50%',
            backgroundColor: 'var(--color-black, #111)',
            border: 'none',
            color: 'var(--color-white, #fff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,.2)',
            flexShrink: 0,
          }}
        >
          <span style={{ width: 16, height: 16, display: 'flex' }}><IconSave /></span>
        </button>
      </div>
    );
  }, [onCollapse]);

  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <PkgPrintExpandedView
        selectedImages={selectedImages}
        savedState={node.printSavedState}
        apiBaseUrl="/api/print-proxy"
        onSave={handleSave}
        onDelete={onCollapse}
        onCurrentImagesChange={handleImagesChange}
        renderToolbarWrapper={renderToolbarWrapper}
      />
    </div>
  );
}
