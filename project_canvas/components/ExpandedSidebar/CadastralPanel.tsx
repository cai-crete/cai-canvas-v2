'use client';


import { CanvasNode } from '@/types/canvas';

interface Props {
  node: CanvasNode;
  onExportImage?: () => void;
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

export function CadastralPanel({ node, onExportImage, onUpdateNode }: Props) {

  const currentTms = node.cadastralTmsType ?? 'Base';
  const showSurrounding = node.cadastralShowSurrounding ?? true;
  const showLotNumbers = node.cadastralShowLotNumbers ?? true;
  const fillSelected = node.cadastralFillSelected ?? true;

  const handleTmsChange = (val: 'None' | 'Base' | 'Satellite' | 'Vector') => {
    onUpdateNode(node.id, { cadastralTmsType: val });
  };

  const toggleSurrounding = () => onUpdateNode(node.id, { cadastralShowSurrounding: !node.cadastralShowSurrounding });
  const toggleLotNumbers = () => onUpdateNode(node.id, { cadastralShowLotNumbers: !node.cadastralShowLotNumbers });
  const toggleFillSelected = () => onUpdateNode(node.id, { cadastralFillSelected: !node.cadastralFillSelected });

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

        {/* BACKGROUND LAYER */}
        <div>
          <span style={sectionLabel}>Background Layer</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.375rem' }}>
            {(['None', 'Base', 'Satellite', 'Vector'] as const).map(t => (
              <button
                key={t}
                onClick={() => handleTmsChange(t)}
                style={{
                  ...toggleBase,
                  flex: 'none',
                  ...(currentTms === t ? activeStyle : inactiveStyle),
                }}
              >
                {t === 'None' ? 'NONE' :
                 t === 'Base' ? 'BASE' :
                 t === 'Satellite' ? 'SATELLITE' : 'VECTOR'}
              </button>
            ))}
          </div>
        </div>

        {/* DISPLAY OPTIONS */}
        <div>
          <span style={sectionLabel}>Display Options</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {[
              { label: 'SURROUNDING', active: showSurrounding, toggle: toggleSurrounding },
              { label: 'LOT NUMBER', active: showLotNumbers, toggle: toggleLotNumbers },
              { label: 'FILL SELECTED', active: fillSelected, toggle: toggleFillSelected },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={opt.toggle}
                style={{
                  ...toggleBase,
                  flex: 'none',
                  ...(opt.active ? activeStyle : inactiveStyle),
                }}
              >
                {opt.label}
              </button>
            ))}
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
              <b>Drag</b> to pan the map<br />
              <b>Scroll</b> to zoom in/out<br />
              <b>Alt + Drag</b> to rotate
            </div>
          </div>
        </div>
      </div>

      {/* EXPORT button (fixed at bottom) */}
      <div style={{ padding: '0.75rem 1rem 1rem', flexShrink: 0 }}>
        <button
          onClick={onExportImage}
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
