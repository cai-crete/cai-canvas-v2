'use client';

interface InfiniteGridProps {
  zoom: number;
  offset: { x: number; y: number };
  gridModule?: number; // mm 단위, 예: 8000
}

export function InfiniteGrid({ zoom, offset, gridModule }: InfiniteGridProps) {
  const minor = 12 * (zoom / 100);
  const major = minor * 5;
  const showMinor = minor >= 6;

  const bpx = offset.x;
  const bpy = offset.y;

  const lineColor      = 'rgba(0,0,0,0.04)';
  const lineColorMajor = 'rgba(0,0,0,0.14)';

  const bgImages = [
    `linear-gradient(to right,  ${lineColorMajor} 1px, transparent 1px)`,
    `linear-gradient(to bottom, ${lineColorMajor} 1px, transparent 1px)`,
    ...(showMinor ? [
      `linear-gradient(to right,  ${lineColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
    ] : []),
  ];

  const bgSizes = [
    `${major}px ${major}px`,
    `${major}px ${major}px`,
    ...(showMinor ? [`${minor}px ${minor}px`, `${minor}px ${minor}px`] : []),
  ];

  const bgPos = `calc(50% + ${bpx}px) calc(50% + ${bpy}px)`;
  const bgPositions = [bgPos, bgPos, ...(showMinor ? [bgPos, bgPos] : [])];

  // gridModule 레이블 문자열
  const gridLabel = gridModule
    ? gridModule >= 1000 ? `${gridModule / 1000}m` : `${gridModule}mm`
    : null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* CSS 그리드 배경 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: bgImages.join(', '),
          backgroundSize: bgSizes.join(', '),
          backgroundPosition: bgPositions.join(', '),
        }}
      />

      {/* 우하단 스케일 인디케이터 */}
      {gridLabel && (
        <div style={{
          position: 'absolute',
          right: '1rem',
          bottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(4px)',
          borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem',
          border: '1px solid rgba(0,0,0,0.08)',
        }}>
          {/* 1-cell 시각 막대 */}
          <div style={{
            width: Math.min(Math.max(major, 16), 48),
            height: 2,
            background: 'rgba(0,0,0,0.35)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-family-pretendard, system-ui, sans-serif)',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'rgba(0,0,0,0.5)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}>
            {gridLabel}
          </span>
        </div>
      )}
    </div>
  );
}
