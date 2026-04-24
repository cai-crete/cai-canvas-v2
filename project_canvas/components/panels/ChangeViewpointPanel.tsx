'use client';

import { ViewpointPanelSettings } from '@/types/canvas';

const VIEWPOINT_OPTIONS: { label: string; value: ViewpointPanelSettings['viewpoint'] }[] = [
  { label: "Bird's eye view", value: 'aerial'  },
  { label: 'Street view',     value: 'street'  },
  { label: 'Corner view',     value: 'quarter' },
  { label: 'Detail view',     value: 'detail'  },
];

const IC = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IconLoader = () => (
  <svg viewBox="0 0 20 20" width={18} height={18} {...IC} style={{ animation: 'spin 1s linear infinite' }}>
    <circle cx="10" cy="10" r="7" strokeOpacity={0.3} />
    <path d="M10 3A7 7 0 0 1 17 10" />
  </svg>
);

export interface ChangeViewpointPanelProps {
  isGenerating: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  viewpoint: ViewpointPanelSettings['viewpoint'] | null;
  onViewpointChange: (v: ViewpointPanelSettings['viewpoint']) => void;
  viewpointAnalysis?: string;
  hasSelectedArtboard: boolean;
  onGenerate: () => void;
}

export default function ChangeViewpointPanel({
  isGenerating,
  prompt, onPromptChange,
  viewpoint, onViewpointChange,
  viewpointAnalysis,
  hasSelectedArtboard,
  onGenerate,
}: ChangeViewpointPanelProps) {
  const canGenerate = hasSelectedArtboard && viewpoint !== null && !isGenerating;

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-family-bebas)',
    fontSize: '0.75rem',
    color: 'var(--color-gray-400)',
    letterSpacing: '0.1em',
    display: 'block',
    marginBottom: '0.5rem',
  };

  const activeStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.05)',
    color: 'var(--color-black)',
  };
  const inactiveStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--color-gray-500)',
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

        {/* PROMPT */}
        <div>
          <span style={sectionLabel}>Prompt</span>
          <textarea
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            placeholder="시점 변경 요청을 입력하세요..."
            maxLength={2000}
            style={{
              width: '100%', height: '7rem',
              resize: 'none',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-gray-200)',
              background: 'rgba(255,255,255,0.6)',
              padding: '0.75rem',
              fontFamily: 'var(--font-family-pretendard)',
              fontSize: '0.75rem',
              color: 'var(--color-black)',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          <div style={{ textAlign: 'right', fontSize: '0.625rem', color: 'var(--color-gray-300)', marginTop: 2 }}>
            {prompt.length} / 2000
          </div>
        </div>

        {/* VIEWPOINT */}
        <div>
          <span style={sectionLabel}>Viewpoint</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {VIEWPOINT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onViewpointChange(opt.value)}
                style={{
                  width: '100%', height: '2.75rem',
                  border: '1px solid var(--color-gray-200)',
                  borderRadius: '0.75rem',
                  fontFamily: 'var(--font-family-bebas)',
                  fontSize: '0.875rem',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'background-color 100ms ease, color 100ms ease',
                  textAlign: 'left',
                  paddingLeft: '0.875rem',
                  ...(viewpoint === opt.value ? activeStyle : inactiveStyle),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ANALYSIS REPORT */}
        <div>
          <span style={sectionLabel}>Analysis Report</span>
          <div style={{
            borderRadius: '0.75rem',
            border: '1px solid var(--color-gray-200)',
            background: 'rgba(0,0,0,0.02)',
            padding: '0.75rem',
            minHeight: '5rem',
          }}>
            {viewpointAnalysis ? (
              <p style={{
                fontFamily: 'var(--font-family-pretendard)',
                fontSize: '0.6875rem',
                color: 'var(--color-black)',
                lineHeight: 1.6,
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}>
                {viewpointAnalysis}
              </p>
            ) : (
              <p style={{
                fontFamily: 'var(--font-family-pretendard)',
                fontSize: '0.6875rem',
                color: 'var(--color-gray-300)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                생성 후 표시됩니다
              </p>
            )}
          </div>
        </div>
      </div>

      {/* GENERATE button */}
      <div style={{ padding: '0.75rem 1rem 1rem' }}>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          style={{
            width: '100%', height: '2.75rem',
            borderRadius: '9999px',
            border: '1px solid var(--color-gray-200)',
            background: canGenerate ? 'var(--color-black)' : 'var(--color-gray-200)',
            color: canGenerate ? 'var(--color-white)' : 'var(--color-gray-400)',
            fontFamily: 'var(--font-family-bebas)',
            fontSize: '1rem',
            letterSpacing: '0.1em',
            cursor: canGenerate ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'opacity 150ms ease, background-color 150ms ease',
          }}
        >
          {isGenerating ? (
            <>
              <IconLoader />
              <span>GENERATING...</span>
            </>
          ) : (
            'GENERATE'
          )}
        </button>
      </div>

      {/* Footer */}
      <div style={{ paddingBottom: '0.75rem', textAlign: 'center' }}>
        <span style={{ fontSize: '0.5625rem', color: 'var(--color-gray-300)', fontFamily: 'var(--font-family-pretendard)', letterSpacing: '0.04em' }}>
          © CRETE CO.,LTD. 2026
        </span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
