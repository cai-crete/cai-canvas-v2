'use client';

import { useRef } from 'react';

import { CanvasNode } from '@/types/canvas';
import type { Map3DViewRef } from '@/components/Map3DView';

interface Props {
  node: CanvasNode;
  map3dRef: React.RefObject<Map3DViewRef | null>;
  onExportImage?: (base64: string) => void;
  onUpdateNode: (id: string, data: Partial<CanvasNode>) => void;
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-family-bebas)',
  fontSize: '0.75rem',
  color: 'var(--color-gray-400)',
  letterSpacing: '0.1em',
  display: 'block',
  marginBottom: '0.5rem',
};

const toggleBase: React.CSSProperties = {
  flex: 1, height: '2.75rem',
  border: '1px solid var(--color-gray-200)',
  borderRadius: '0.75rem',
  fontFamily: 'var(--font-family-bebas)',
  fontSize: '0.875rem',
  letterSpacing: '0.08em',
  cursor: 'pointer',
  transition: 'background-color 100ms ease, color 100ms ease',
};

const activeStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.05)',
  color: 'var(--color-black)',
};

const inactiveStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--color-gray-500)',
};

export function Map3DPanel({ node, map3dRef, onExportImage, onUpdateNode }: Props) {
  const showLabels = node.map3dShowLabels ?? true;
  const isCapturing = useRef(false);

  const toggleLabels = () => {
    const next = !showLabels;
    onUpdateNode(node.id, { map3dShowLabels: next });
    map3dRef.current?.setLabelsVisible(next);
  };

  const handleCapture = async () => {
    if (isCapturing.current || !map3dRef.current) return;
    isCapturing.current = true;

    try {
      const base64 = await map3dRef.current.capture();
      if (base64 && base64.length > 1000) {
        onUpdateNode(node.id, { thumbnailData: base64 });
        onExportImage?.(base64);
      }
    } catch (err) {
      console.error('[Map3DPanel] capture error:', err);
    } finally {
      isCapturing.current = false;
    }
  };

  return (
    <div style={{
      height: '100%', width: '100%',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Scrollable content */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
        minHeight: 0,
      }}>

        {/* DISPLAY OPTIONS */}
        <div>
          <span style={sectionLabel}>Display Options</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <button
              onClick={toggleLabels}
              style={{
                ...toggleBase,
                flex: 'none',
                ...(showLabels ? activeStyle : inactiveStyle),
              }}
            >
              POI / LABELS
            </button>
          </div>
        </div>

        {/* CONTROLS */}
        <div>
          <span style={sectionLabel}>Controls</span>
          <div style={{
            borderRadius: '0.75rem',
            border: '1px solid var(--color-gray-200)',
            background: 'rgba(0,0,0,0.02)',
            padding: '0.75rem',
          }}>
            <div style={{
              fontFamily: 'var(--font-family-pretendard)',
              fontSize: '0.6875rem',
              color: 'var(--color-gray-500)',
              lineHeight: 1.6,
            }}>
              <b>Drag</b> to rotate camera<br />
              <b>Scroll</b> to zoom in/out<br />
              <b>Right-click drag</b> to pan
              {node.map3dRoadInfo && (
                <>
                  <br /><br />
                  <b>Road</b>: {node.map3dRoadInfo}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EXPORT button (fixed at bottom) */}
      <div style={{ padding: '0.75rem 1rem 1rem', flexShrink: 0 }}>
        <button
          onClick={handleCapture}
          style={{
            width: '100%', height: '2.75rem',
            borderRadius: '9999px',
            border: '1px solid var(--color-gray-200)',
            background: 'var(--color-black)',
            color: 'var(--color-white)',
            fontFamily: 'var(--font-family-bebas)',
            fontSize: '1rem',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'opacity 150ms ease, background-color 150ms ease',
          }}
        >
          EXPORT TO IMAGE NODE
        </button>
      </div>

      {/* Footer */}
      <div style={{ paddingBottom: '0.75rem', textAlign: 'center' }}>
        <span style={{ fontSize: '0.5625rem', color: 'var(--color-gray-300)', fontFamily: 'var(--font-family-pretendard)', letterSpacing: '0.04em' }}>
          © CRETE CO.,LTD. 2026
        </span>
      </div>
    </div>
  );
}
