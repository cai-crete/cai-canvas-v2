'use client';

import { useState } from 'react';
import {
  NodeType, NODE_DEFINITIONS, NODE_ORDER, ArtboardType,
  ARTBOARD_COMPATIBLE_NODES, NODES_NAVIGATE_DISABLED,
  PANEL_CTA_MESSAGE, DISABLED_TAB_MESSAGE, ViewpointPanelSettings, PlannerMessage,
  ViewpointAnalysisReport,
} from '@/types/canvas';
import ChangeViewpointPanel from '@/components/panels/ChangeViewpointPanel';
import { PrintCanvasSidebarPanel } from '@cai-crete/print-components';
import type { PrintSavedState, PrintDraftState } from '@cai-crete/print-components';

interface Props {
  activeSidebarNodeType: NodeType | null;
  selectedArtboardType: ArtboardType | null;
  activeTabHint?: NodeType | null;
  onNodeTabSelect: (type: NodeType) => void;
  onNavigateToExpand: (type: NodeType) => void;
  hasSelectedArtboard: boolean;
  onShowToast: (message: string, type?: 'warning' | 'success') => void;
  // viewpoint 전용
  viewpointPanelSettings?: ViewpointPanelSettings;
  onViewpointSettingsChange?: (settings: ViewpointPanelSettings) => void;
  onViewpointGenerate?: () => void;
  isViewpointGenerating?: boolean;
  viewpointReport?: ViewpointAnalysisReport | null;
  // planners 전용
  plannerMessages?: PlannerMessage[];
  // print 전용
  printSavedState?: PrintSavedState;
  onPrintAction?: (action: 'generate' | 'export' | 'saves', draft: PrintDraftState) => void;
}

const IC = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IconChevronUp   = () => <svg viewBox="0 0 20 20" {...IC}><polyline points="4,13 10,7 16,13" /></svg>;
const IconChevronDown = () => <svg viewBox="0 0 20 20" {...IC}><polyline points="4,7 10,13 16,7" /></svg>;
const IconNavigate    = () => (
  <svg viewBox="0 0 20 20" {...IC}><path d="M4 10H16M11 5L16 10L11 15" /></svg>
);

function extractFirstLine(text: string): string {
  return text.split('\n').find(l => l.trim().length > 0) ?? '';
}

function parseShortFinal(data: Record<string, unknown>): string {
  const raw = data?.short_final ?? data?.final ?? data?.summary ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function PlannerReportPanel({ messages }: { messages: PlannerMessage[] }) {
  const aiMessages = messages.filter(m => m.type === 'ai') as Array<{ type: 'ai'; data: Record<string, unknown> }>;

  if (aiMessages.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.5rem 1rem', gap: '0.5rem' }}>
        <span className="text-title" style={{ fontSize: '0.75rem', color: 'var(--color-gray-300)', letterSpacing: '0.08em' }}>PLANNERS</span>
        <span style={{ display: 'block', width: 28, height: 1, background: 'var(--color-gray-200)' }} />
        <span className="text-caption" style={{ color: 'var(--color-gray-300)', textAlign: 'center' }}>
          기획서를 생성하려면<br />PLANNERS를 열어 대화를 시작하세요
        </span>
      </div>
    );
  }

  const lastAi = aiMessages[aiMessages.length - 1];
  const reportText = parseShortFinal(lastAi.data);
  const previewLine = extractFirstLine(reportText);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1rem 0.75rem', borderBottom: '1px solid var(--color-gray-100)', flexShrink: 0 }}>
        <span className="text-title" style={{ fontSize: '0.7rem', color: 'var(--color-gray-400)', letterSpacing: '0.08em' }}>기획서 미리보기</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {previewLine ? (
          <p className="text-body-3" style={{ color: 'var(--color-gray-700)', margin: 0, lineHeight: 1.6 }}>
            {previewLine}
          </p>
        ) : (
          <p className="text-caption" style={{ color: 'var(--color-gray-300)', margin: 0 }}>
            기획서를 생성하면 미리보기가 표시됩니다
          </p>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <span className="text-caption" style={{ color: 'var(--color-gray-300)' }}>
            AI 응답 {aiMessages.length}건
          </span>
        </div>
      </div>
    </div>
  );
}

function NodePanel({
  type, onGenerate, hasSelectedArtboard, onShowToast,
}: {
  type: NodeType;
  onGenerate: () => void;
  hasSelectedArtboard: boolean;
  onShowToast: (message: string, type?: 'warning' | 'success') => void;
}) {
  const def = NODE_DEFINITIONS[type];

  if (type === 'planners') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.5rem 1rem', gap: '0.5rem' }}>
        <span className="text-title" style={{ fontSize: '0.75rem', color: 'var(--color-gray-300)', letterSpacing: '0.08em' }}>
          {def.displayLabel}
        </span>
        <span style={{ display: 'block', width: 28, height: 1, background: 'var(--color-gray-200)' }} />
        <span className="text-caption" style={{ color: 'var(--color-gray-300)', textAlign: 'center' }}>
          API 연동 후 활성화
        </span>
      </div>
    );
  }

  const handleGenerateClick = () => {
    if (!hasSelectedArtboard) {
      onShowToast(PANEL_CTA_MESSAGE[type] || '아트보드를 선택해 주세요');
      return;
    }
    onGenerate();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', height: '100%', padding: '1.5rem 1rem 1rem', gap: '0.75rem' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <span className="text-title" style={{ fontSize: '0.75rem', color: 'var(--color-gray-300)', letterSpacing: '0.08em' }}>
          {def.displayLabel}
        </span>
        <span style={{ display: 'block', width: 28, height: 1, background: 'var(--color-gray-200)' }} />
        <span className="text-caption" style={{ color: 'var(--color-gray-300)', textAlign: 'center' }}>
          API 연동 후 활성화
        </span>
      </div>
      <button
        onClick={handleGenerateClick}
        style={{
          width: '100%', height: 'var(--h-cta-lg)', border: 'none',
          borderRadius: 'var(--radius-pill)', background: 'var(--color-black)',
          color: 'var(--color-white)', fontFamily: 'var(--font-family-bebas)',
          fontSize: '1rem', letterSpacing: '0.08em', cursor: 'pointer',
          transition: 'opacity 120ms ease', flexShrink: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        GENERATE
      </button>
    </div>
  );
}

export default function RightSidebar({
  activeSidebarNodeType, selectedArtboardType, activeTabHint,
  onNodeTabSelect, onNavigateToExpand,
  hasSelectedArtboard, onShowToast,
  viewpointPanelSettings, onViewpointSettingsChange,
  onViewpointGenerate, isViewpointGenerating,
  viewpointReport,
  plannerMessages,
  printSavedState, onPrintAction,
}: Props) {
  const [accordionOpen, setAccordionOpen] = useState(true);

  const isPanelMode = activeSidebarNodeType !== null;

  const area: React.CSSProperties = {
    position: 'absolute', right: '1rem', top: '1rem', bottom: '1rem',
    width: 'var(--sidebar-w)', display: 'flex', flexDirection: 'column',
    gap: '0.5rem', zIndex: 90, pointerEvents: 'none',
    overflowY: isPanelMode ? 'hidden' : 'auto', overflowX: 'hidden',
  };

  const pill = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: 'var(--color-white)', borderRadius: 'var(--radius-pill)',
    boxShadow: 'var(--shadow-float)', pointerEvents: 'all', flexShrink: 0, ...extra,
  });

  const hoverOn  = (e: React.MouseEvent<HTMLButtonElement>) =>
    (e.currentTarget.style.backgroundColor = 'var(--color-gray-100)');
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) =>
    (e.currentTarget.style.backgroundColor = 'transparent');

  const isTabDisabled = (type: NodeType): boolean => {
    if (type === 'planners') return false;
    if (!selectedArtboardType) return false;
    if (selectedArtboardType === 'blank') return NODES_NAVIGATE_DISABLED.includes(type);
    const compatible = ARTBOARD_COMPATIBLE_NODES[selectedArtboardType as Exclude<typeof selectedArtboardType, 'blank'>];
    if (!compatible) return false;
    return !compatible.includes(type);
  };

  const tabBtn = (type: NodeType) => {
    const isHinted = type === activeTabHint;
    const disabled = isTabDisabled(type) && !isHinted;
    return (
      <div key={type} style={pill()}>
        <button
          onClick={() => {
            if (disabled) {
              onShowToast(DISABLED_TAB_MESSAGE[type] || '이 탭을 사용할 수 없습니다');
              return;
            }
            onNodeTabSelect(type);
          }}
          style={{
            width: '100%', height: 'var(--h-cta-lg)', display: 'flex',
            alignItems: 'center', padding: '0 1rem', border: 'none',
            background: 'transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-family-bebas)',
            fontSize: '1rem', letterSpacing: '0.04em',
            color: disabled ? 'var(--color-gray-300)' : 'var(--color-black)',
            textAlign: 'left', transition: 'background-color 150ms ease',
          }}
          onMouseEnter={e => { if (!disabled) hoverOn(e); }}
          onMouseLeave={e => { if (!disabled) hoverOff(e); }}
          onMouseDown={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-gray-200)'; }}
          onMouseUp={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-gray-100)'; }}
        >
          {NODE_DEFINITIONS[type].displayLabel}
        </button>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════
     PANEL 모드 — 탭 클릭으로 패널 열린 상태
  ══════════════════════════════════════════════════════════════ */
  if (isPanelMode) {
    const isViewpoint = activeSidebarNodeType === 'viewpoint';
    const isPlanners  = activeSidebarNodeType === 'planners';
    const isPrint     = activeSidebarNodeType === 'print';

    return (
      <div style={{ ...area, overflowY: 'hidden' }}>
        {/* 헤더 행 */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexShrink: 0 }}>
          {/* viewpoint는 ExpandedView 없으므로 navigate 버튼 생략 */}
          {!isViewpoint && (
            <div style={{ ...pill(), width: 'var(--h-cta-lg)', height: 'var(--h-cta-lg)' }}>
              <button
                onClick={() => onNavigateToExpand(activeSidebarNodeType!)}
                title="expand로 이동"
                style={{
                  width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', border: 'none', background: 'transparent',
                  cursor: 'pointer', borderRadius: 'var(--radius-pill)',
                  color: 'var(--color-gray-500)', transition: 'background-color 100ms ease, color 100ms ease',
                }}
                onMouseEnter={e => { hoverOn(e); e.currentTarget.style.color = 'var(--color-black)'; }}
                onMouseLeave={e => { hoverOff(e); e.currentTarget.style.color = 'var(--color-gray-500)'; }}
              >
                <span style={{ width: 20, height: 20, display: 'flex' }}><IconNavigate /></span>
              </button>
            </div>
          )}

          <div style={{ ...pill(), flex: 1 }}>
            <button
              onClick={() => onNodeTabSelect(activeSidebarNodeType!)}
              style={{
                width: '100%', height: 'var(--h-cta-lg)', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '0 0.875rem 0 1rem', border: 'none', background: 'transparent',
                cursor: 'pointer', borderRadius: 'var(--radius-pill)',
                transition: 'background-color 100ms ease',
              }}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              <span className="text-title" style={{ color: 'var(--color-black)', letterSpacing: '0.04em' }}>
                {NODE_DEFINITIONS[activeSidebarNodeType!].displayLabel}
              </span>
              <span style={{ width: 16, height: 16, display: 'flex', color: 'var(--color-gray-500)', flexShrink: 0 }}>
                <IconChevronUp />
              </span>
            </button>
          </div>
        </div>

        {/* 패널 본문 */}
        <div style={{
          background: 'var(--color-white)', borderRadius: 'var(--radius-box)',
          boxShadow: 'var(--shadow-float)', flex: 1, minHeight: 0, pointerEvents: 'all',
          overflow: 'hidden',
        }}>
          {isViewpoint ? (
            <ChangeViewpointPanel
              isGenerating={isViewpointGenerating ?? false}
              prompt={viewpointPanelSettings?.prompt ?? ''}
              onPromptChange={v => onViewpointSettingsChange?.({
                prompt: v,
                viewpoint: viewpointPanelSettings?.viewpoint ?? 'aerial',
              })}
              viewpoint={viewpointPanelSettings?.viewpoint ?? null}
              onViewpointChange={v => onViewpointSettingsChange?.({
                prompt: viewpointPanelSettings?.prompt ?? '',
                viewpoint: v,
              })}
              viewpointReport={viewpointReport}
              hasSelectedArtboard={hasSelectedArtboard}
              onGenerate={() => {
                if (!hasSelectedArtboard) {
                  onShowToast(PANEL_CTA_MESSAGE['viewpoint'] || '이미지를 선택해 주세요');
                  return;
                }
                onViewpointGenerate?.();
              }}
            />
          ) : isPlanners ? (
            <PlannerReportPanel messages={plannerMessages ?? []} />
          ) : isPrint ? (
            <PrintCanvasSidebarPanel savedState={printSavedState} onAction={onPrintAction!} />
          ) : (
            <NodePanel
              type={activeSidebarNodeType!}
              onGenerate={() => onNavigateToExpand(activeSidebarNodeType!)}
              hasSelectedArtboard={hasSelectedArtboard}
              onShowToast={onShowToast}
            />
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     SELECT TOOLS 모드 — 모든 탭 표시 (비활성 탭 회색)
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="no-scrollbar" style={area}>
      <div style={pill()}>
        <button
          onClick={() => setAccordionOpen(v => !v)}
          style={{
            width: '100%', height: 'var(--h-cta-lg)', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '0 0.875rem 0 1rem', border: 'none', background: 'transparent',
            cursor: 'pointer', borderRadius: 'var(--radius-pill)',
            transition: 'background-color 100ms ease',
          }}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <span className="text-title" style={{ color: 'var(--color-black)', letterSpacing: '0.04em' }}>
            SELECT TOOLS
          </span>
          <span style={{ width: 16, height: 16, display: 'flex', color: 'var(--color-gray-500)', flexShrink: 0 }}>
            {accordionOpen ? <IconChevronUp /> : <IconChevronDown />}
          </span>
        </button>
      </div>

      {accordionOpen && NODE_ORDER.map(tabBtn)}
    </div>
  );
}
