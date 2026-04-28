'use client';

import { ViewpointPanelSettings, ViewpointAnalysisReport } from '@/types/canvas';

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
  viewpointReport?: ViewpointAnalysisReport | null;
  hasSelectedArtboard: boolean;
  onGenerate: () => void;
}

// 섹션별 행 정의
const OPTICAL_ROWS: { label: string; key: keyof ViewpointAnalysisReport['optical'] }[] = [
  { label: '촬영 시점',   key: 'viewpoint'   },
  { label: '방위각',      key: 'azimuth'     },
  { label: '촬영 고도',   key: 'altitude'    },
  { label: '투시 왜곡',   key: 'perspective' },
  { label: '센서 포맷',   key: 'sensor'      },
  { label: '이점 거리',   key: 'focalLength' },
  { label: '광선 및 날씨', key: 'lighting'   },
  { label: '대비 강도',   key: 'contrast'    },
];

const GEOMETRIC_ROWS: { label: string; key: keyof ViewpointAnalysisReport['geometric'] }[] = [
  { label: '인피 시스템', key: 'skin'        },
  { label: '내부 파사드', key: 'innerFacade' },
  { label: '외부 파사드', key: 'outerFacade' },
  { label: '기본 매스',   key: 'baseMass'    },
  { label: '하층부',      key: 'baseFloor'   },
  { label: '중인층부',    key: 'midBody'     },
  { label: '상층부',      key: 'roof'        },
];

const CONCEPTUAL_ROWS: { label: string; key: keyof ViewpointAnalysisReport['conceptual'] }[] = [
  { label: '디자인 알고리즘', key: 'designAlgorithm' },
  { label: '주조색',          key: 'colorPalette'    },
  { label: '형태 모티브',     key: 'formMotif'       },
  { label: '형태적 대비',     key: 'formContrast'    },
  { label: '감성적 대비',     key: 'moodContrast'    },
];

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-bebas)',
  fontSize: '0.625rem',
  color: 'var(--color-gray-400)',
  letterSpacing: '0.12em',
  marginBottom: '0.375rem',
  display: 'block',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: '0.625rem',
  fontFamily: 'var(--font-family-pretendard)',
  marginBottom: '0.625rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.25rem 0.5rem',
  color: 'var(--color-gray-500)',
  fontWeight: 400,
  width: '38%',
  verticalAlign: 'top',
  lineHeight: 1.5,
  borderBottom: '1px solid var(--color-gray-100)',
};

const tdStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.25rem 0.5rem',
  color: 'var(--color-black)',
  verticalAlign: 'top',
  lineHeight: 1.5,
  borderBottom: '1px solid var(--color-gray-100)',
};

function ReportSection<T extends object>({
  title,
  rows,
  data,
}: {
  title: string;
  rows: { label: string; key: keyof T }[];
  data: T;
}) {
  return (
    <div>
      <span style={sectionTitleStyle}>{title}</span>
      <table style={tableStyle}>
        <tbody>
          {rows.map(({ label, key }) => (
            <tr key={String(key)}>
              <th style={thStyle}>{label}</th>
              <td style={tdStyle}>{String(data[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChangeViewpointPanel({
  isGenerating,
  prompt, onPromptChange,
  viewpoint, onViewpointChange,
  viewpointReport,
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
            {viewpointReport ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <ReportSection
                  title="1. 관측 및 시점 파라미터"
                  rows={OPTICAL_ROWS}
                  data={viewpointReport.optical}
                />
                <ReportSection
                  title="2. 기하학 & 공간 구조 명세"
                  rows={GEOMETRIC_ROWS}
                  data={viewpointReport.geometric}
                />
                <ReportSection
                  title="3. 개념 & 시각적 속성"
                  rows={CONCEPTUAL_ROWS}
                  data={viewpointReport.conceptual}
                />
              </div>
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
