'use client';

import { useState, useRef, useEffect } from 'react';
import { CanvasNode, NODE_DEFINITIONS, ActiveTool, SketchPanelSettings, PlanPanelSettings, PlannerMessage, SavedInsightData } from '@/types/canvas';
import LeftToolbar from '@/components/LeftToolbar';
import ExpandedSidebar from '@/components/ExpandedSidebar';
import SketchToImageExpandedView from '@/sketch-to-image/ExpandedView';
import SketchToPlanExpandedView from '@/sketch-to-plan/ExpandedView';
import PlannersPanel from '@/planners/PlannersPanel';
import { PlannersInsightPanel } from '@/components/panels/PlannersInsightPanel';
import type { FetchLawsResult } from '@/planners/lib/lawApi';
import PrintExpandedView, { type PrintGenerateResult } from '@/print/ExpandedView';
import ElevationExpandedView, { type ElevationGenerateResult } from '@/elevation/ExpandedView';

interface Props {
  node: CanvasNode;
  viewMode?: 'image' | 'plan' | 'default';
  onCollapse: () => void;
  onCollapseWithSketch?: (sketchBase64: string, thumbnailBase64: string, panelSettings: SketchPanelSettings) => void;
  onCollapseWithPlanSketch?: (sketchBase64: string, thumbnailBase64: string, planSettings: PlanPanelSettings) => void;
  onGenerateError?: (nodeId: string) => void;
  onAbortControllerReady?: (ctrl: AbortController) => void;
  activeTool: ActiveTool;
  scale: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (t: ActiveTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onAddArtboard: () => void;
  onUploadImage?: () => void;
  onGenerateComplete?: (params: { sketchBase64: string; thumbnailBase64: string; generatedBase64: string; nodeId: string }) => void;
  onGeneratePlanComplete?: (params: { sketchBase64: string; thumbnailBase64: string; generatedPlanBase64: string; roomAnalysis: string; nodeId: string }) => void;
  onGeneratingChange?: (v: boolean) => void;
  isGenerating?: boolean;
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
  onPrintNodeUpdate?: (updates: Partial<CanvasNode>) => void;
  onGenerateElevationComplete?: (params: ElevationGenerateResult) => void;
  onPlannerMessagesChange?: (msgs: PlannerMessage[]) => void;
  onInsightDataChange?: (data: FetchLawsResult | null) => void;
  initialInsightData?: SavedInsightData | null;
  onCadastralDataReceived?: (pnu: string | null, landCount: number) => void;
}

/* ── SketchInfiniteGrid (sketch/blank 아트보드용) ───────────────── */
const SKETCH_GRID_SIZE = 32;

function SketchInfiniteGrid() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });
  const [localScale, setLocalScale] = useState(1);

  const isPanning    = useRef(false);
  const panStart     = useRef({ x: 0, y: 0 });
  const offsetSnap   = useRef({ x: 0, y: 0 });
  const scaleRef     = useRef(localScale);
  const offsetRef    = useRef(gridOffset);

  useEffect(() => { scaleRef.current  = localScale; },  [localScale]);
  useEffect(() => { offsetRef.current = gridOffset; }, [gridOffset]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prev = scaleRef.current;
      const next = Math.max(0.2, Math.min(4, prev * (e.deltaY < 0 ? 1.1 : 0.9)));
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const off = offsetRef.current;
      setLocalScale(next);
      setGridOffset({ x: mx - (mx - off.x) * (next / prev), y: my - (my - off.y) * (next / prev) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!isPanning.current) return;
      setGridOffset({
        x: offsetSnap.current.x + (e.clientX - panStart.current.x),
        y: offsetSnap.current.y + (e.clientY - panStart.current.y),
      });
    };
    const onUp = () => { isPanning.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanning.current  = true;
    panStart.current   = { x: e.clientX, y: e.clientY };
    offsetSnap.current = { ...offsetRef.current };
  };

  const gs  = SKETCH_GRID_SIZE * localScale;
  const gox = ((gridOffset.x % gs) + gs) % gs;
  const goy = ((gridOffset.y % gs) + gs) % gs;

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        touchAction: 'none', cursor: 'crosshair',
        backgroundColor: 'var(--color-app-bg)',
        backgroundImage: `
          linear-gradient(var(--color-gray-100) 1px, transparent 1px),
          linear-gradient(90deg, var(--color-gray-100) 1px, transparent 1px)
        `,
        backgroundSize: `${gs}px ${gs}px`,
        backgroundPosition: `${gox}px ${goy}px`,
      }}
    >
      <div style={{
        position: 'absolute',
        left: gridOffset.x - 3, top: gridOffset.y - 3,
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--color-gray-200)', pointerEvents: 'none',
      }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ExpandedView — 라우터: 노드 유형별 전용 뷰로 위임
══════════════════════════════════════════════════════════════════ */
export default function ExpandedView({
  node, viewMode = 'default', onCollapse, onCollapseWithSketch, onCollapseWithPlanSketch, onGenerateError, onAbortControllerReady,
  activeTool, scale, canUndo, canRedo,
  onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomReset,
  onAddArtboard, onGenerateComplete, onGeneratePlanComplete, onGeneratingChange,
  isGenerating = false,
  onGeneratePrintComplete,
  onPrintNodeUpdate,
  onGenerateElevationComplete,
  onPlannerMessagesChange, onInsightDataChange, initialInsightData, onCadastralDataReceived,
}: Props) {
  const def = NODE_DEFINITIONS[node.type];
  const isSketchImageMode =
    (node.type === 'image' || node.type === 'viewpoint') && viewMode !== 'plan' ||
    (viewMode === 'image' && node.artboardType === 'image');
  const isSketchPlanMode =
    (node.type === 'plan' && viewMode !== 'image') ||
    ((node.type === 'image' || node.type === 'viewpoint') && viewMode === 'plan');
  const isSketchMode      = node.artboardType === 'sketch' || node.artboardType === 'blank';

  const [insightData, setInsightData] = useState<FetchLawsResult | null>(
    (initialInsightData as FetchLawsResult | null) ?? null
  );

  /* ── sketch-to-image 전용 뷰 ────────────────────────────────────── */
  if (isSketchImageMode) {
    return (
      <SketchToImageExpandedView
        node={node}
        displayNodeType={viewMode === 'image' && node.type !== 'image' ? 'image' : undefined}
        onCollapse={onCollapse}
        onCollapseWithSketch={onCollapseWithSketch}
        onGenerateError={onGenerateError}
        onAbortControllerReady={onAbortControllerReady}
        onGenerateComplete={onGenerateComplete}
        onGeneratingChange={onGeneratingChange}
        isGenerating={isGenerating}
      />
    );
  }

  /* ── sketch-to-plan 전용 뷰 ─────────────────────────────────────── */
  if (isSketchPlanMode) {
    return (
      <SketchToPlanExpandedView
        node={node}
        onCollapse={onCollapse}
        onCollapseWithPlanSketch={onCollapseWithPlanSketch}
        onGeneratePlanComplete={onGeneratePlanComplete}
        onGeneratingChange={onGeneratingChange}
        isGenerating={isGenerating}
      />
    );
  }

  /* ── planners 전용 뷰 ───────────────────────────────────────────── */
  if (node.type === 'planners') {
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)', display: 'flex' }}>
        <div style={{ flex: 1, overflow: 'hidden', marginRight: 'calc(var(--sidebar-w) + 2rem)' }}>
          <PlannersPanel
            initialMessages={node.plannerMessages as never}
            onMessagesChange={(msgs) => onPlannerMessagesChange?.(msgs as PlannerMessage[])}
            onInsightDataUpdate={(data) => {
              setInsightData(data);
              onInsightDataChange?.(data);
            }}
            onCadastralDataReceived={onCadastralDataReceived}
          />
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse}>
          <PlannersInsightPanel apiInsightData={insightData} />
        </ExpandedSidebar>
      </div>
    );
  }

  /* ── print 전용 뷰 ─────────────────────────────────────────────── */
  if (node.type === 'print') {
    return (
      <PrintExpandedView
        node={node}
        onCollapse={onCollapse}
        onGeneratingChange={onGeneratingChange}
        onGeneratePrintComplete={onGeneratePrintComplete}
        onPrintNodeUpdate={onPrintNodeUpdate}
      />
    );
  }

  /* ── elevation 전용 뷰 ──────────────────────────────────────────── */
  if (node.type === 'elevation') {
    return (
      <ElevationExpandedView
        node={node}
        onCollapse={onCollapse}
        onGeneratingChange={onGeneratingChange}
        isGenerating={isGenerating}
        onGenerateElevationComplete={onGenerateElevationComplete}
      />
    );
  }

  /* ── 지적도 전용 뷰 ─────────────────────────────────────────────── */
  if (node.type === 'cadastral') {
    const pnu = node.cadastralPnu ?? null;
    const iframeSrc = pnu
      ? `https://www.eum.go.kr/web/ar/lu/luLandUseIndex.jsp?pnu=${pnu}`
      : null;
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)' }}>
          {iframeSrc ? (
            <iframe
              src={iframeSrc}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="토지이음 지적도"
            />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>PNU 코드가 없습니다</span>
            </div>
          )}
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse} />
      </div>
    );
  }

  /* ── 기존 레이아웃 (sketch/blank 아트보드, image 외 노드) ───────── */
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>

      {isSketchMode ? (
        <SketchInfiniteGrid />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          left: 'calc(4rem + 1.5rem)',
          right: 'calc(var(--sidebar-w) + 2rem)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '1.5rem', padding: '2rem',
        }}>
          <div style={{
            width: '100%', maxWidth: 800,
            aspectRatio: '297 / 210',
            background: 'var(--color-white)',
            borderRadius: 'var(--radius-box)',
            boxShadow: 'var(--shadow-float)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          }}>
            <span className="text-title" style={{ fontSize: '1.25rem', color: 'var(--color-gray-300)', letterSpacing: '0.08em' }}>
              {def.displayLabel}
            </span>
            <span style={{ display: 'block', width: 48, height: 1, background: 'var(--color-gray-200)' }} />
            <span className="text-body-3" style={{ color: 'var(--color-gray-400)' }}>{node.title}</span>
            <span className="text-caption" style={{ color: 'var(--color-gray-300)', marginTop: 4 }}>
              API 연동 후 작업 화면이 표시됩니다.
            </span>
          </div>
        </div>
      )}

      <LeftToolbar
        activeTool={activeTool}
        scale={scale}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={onToolChange}
        onUndo={onUndo}
        onRedo={onRedo}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
        onAddArtboard={onAddArtboard}
      />

      <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse} />
    </div>
  );
}
