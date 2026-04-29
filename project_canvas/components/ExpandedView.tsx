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
import { CadastralMapView, type CadastralMapViewRef } from '@/components/CadastralMapView';
import { CadastralPanel } from '@/components/ExpandedSidebar/CadastralPanel';
import { Map3DPanel } from '@/components/ExpandedSidebar/Map3DPanel';
import { Map3DView, type Map3DViewRef } from '@/components/Map3DView';
import { useCanvasStore } from '@/store/canvas';
import type { CadastralGeoJson } from '@/types/canvas';

interface Props {
  node: CanvasNode;
  expandedViewMode?: 'image' | 'plan' | 'default';
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
  onGenerateElevationComplete?: (params: ElevationGenerateResult) => void;
  elevationSourceNodeId?: string;
  onPlannerMessagesChange?: (msgs: PlannerMessage[]) => void;
  onInsightDataChange?: (data: FetchLawsResult | null) => void;
  initialInsightData?: SavedInsightData | null;
  onCadastralDataReceived?: (
    pnu: string | null,
    geoJson: CadastralGeoJson | null,
    mapCenter: { lng: number; lat: number } | null,
  ) => void;
  onExportCadastralImage?: (base64: string) => void;
  onExportMap3dImage?: (base64: string) => void;
  plannerInitialImages?: string[];
}

/* ── SketchInfiniteGrid (sketch/blank 아트보드용) ───────────────── */
const SKETCH_GRID_SIZE = 32;

function SketchInfiniteGrid() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });
  const [localScale, setLocalScale] = useState(1);

  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetSnap = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(localScale);
  const offsetRef = useRef(gridOffset);

  useEffect(() => { scaleRef.current = localScale; }, [localScale]);
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
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    offsetSnap.current = { ...offsetRef.current };
  };

  const gs = SKETCH_GRID_SIZE * localScale;
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
  node, expandedViewMode = 'default', onCollapse, onCollapseWithSketch, onCollapseWithPlanSketch, onGenerateError, onAbortControllerReady,
  activeTool, scale, canUndo, canRedo,
  onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomReset,
  onAddArtboard, onGenerateComplete, onGeneratePlanComplete, onGeneratingChange,
  isGenerating = false,
  onGeneratePrintComplete,
  onGenerateElevationComplete,
  elevationSourceNodeId,
  onPlannerMessagesChange, onInsightDataChange, initialInsightData, onCadastralDataReceived, onExportCadastralImage,
  onExportMap3dImage,
  plannerInitialImages,
}: Props) {
  const mapRef = useRef<CadastralMapViewRef>(null);
  const map3dRef = useRef<Map3DViewRef>(null);

  const def = NODE_DEFINITIONS[node.type];
  const isSketchImageMode = node.artboardType === 'sketch' && (node.type === 'image' || node.type === 'map3d');
  const isSketchPlanMode = node.artboardType === 'sketch' && (node.type === 'plan' || node.type === 'cadastral');
  const isSketchMode = node.artboardType === 'sketch' || node.artboardType === 'blank';

  const [insightData, setInsightData] = useState<FetchLawsResult | null>(
    (initialInsightData as FetchLawsResult | null) ?? null
  );

  /* ── elevation 전용 뷰 (isSketchImageMode보다 먼저 체크) ──────────── */
  if (node.type === 'elevation' || !!elevationSourceNodeId) {
    return (
      <ElevationExpandedView
        node={node}
        sourceNodeId={elevationSourceNodeId}
        onCollapse={onCollapse}
        onGeneratingChange={onGeneratingChange}
        isGenerating={isGenerating}
        onGenerateElevationComplete={onGenerateElevationComplete}
      />
    );
  }

  /* ── sketch-to-image 전용 뷰 ────────────────────────────────────── */
  if (isSketchImageMode) {
    return (
      <SketchToImageExpandedView
        node={node}
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

  /* ── planners 전용 뷰 ── Sketch to Image와 동일한 구조 ─────────── */
  if (node.type === 'planners') {
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)', display: 'flex' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)' }}>
          <PlannersPanel
            initialMessages={node.plannerMessages as never}
            onMessagesChange={(msgs) => onPlannerMessagesChange?.(msgs as PlannerMessage[])}
            onInsightDataUpdate={(data) => {
              setInsightData(data);
              onInsightDataChange?.(data);
            }}
            onCadastralDataReceived={onCadastralDataReceived}
            initialImages={plannerInitialImages}
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
      />
    );
  }

  /* ── 지적도 전용 뷰 (artboardType=image 분기보다 먼저 체크, sketch는 제외) ──────── */
  if (node.type === 'cadastral' && node.artboardType !== 'sketch') {
    const boundary = node.cadastralGeoJson ?? null;
    const center = node.cadastralMapCenter ?? null;

    // 진단 로그 — 브라우저 콘솔에서 확인
    console.log('[지적도 DIAG] ExpandedView 진입 — node.cadastralPnu:', node.cadastralPnu ?? 'null');
    console.log('[지적도 DIAG] ExpandedView — boundary:', boundary ? `features=${boundary.features.length}` : 'null');
    console.log('[지적도 DIAG] ExpandedView — center:', center ?? 'null');

    // 실패 원인 판별
    const diagReason = !node.cadastralPnu
      ? 'PNU 없음'
      : !boundary
        ? 'GeoJSON null (WFS 미수신 또는 fetch 실패)'
        : boundary.features.length === 0
          ? 'GeoJSON features 빈 배열 (WFS 응답 0건)'
          : !center
            ? 'mapCenter null (centroid 계산 실패)'
            : null;

    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)', display: 'flex', flexDirection: 'column' }}>
          {boundary && center && boundary.features.length > 0 ? (
            <CadastralMapView
              ref={mapRef}
              boundary={boundary}
              center={center}
              tmsType={node.cadastralTmsType ?? 'Base'}
              showSurrounding={node.cadastralShowSurrounding ?? true}
              showLotNumbers={node.cadastralShowLotNumbers ?? true}
              fillSelected={node.cadastralFillSelected ?? true}
              isOffsetMode={node.cadastralIsOffsetMode}
              mapOffset={node.cadastralMapOffset}
              onChangeOffset={(offset) => useCanvasStore.getState().updateNode(node.id, { cadastralMapOffset: offset })}
              onThumbnailCaptured={(base64Url) => {
                // 썸네일 데이터가 없을 때만 1회 저장 (깜빡임 방지)
                if (!node.thumbnailData) {
                  useCanvasStore.getState().updateNode(node.id, { thumbnailData: base64Url });
                }
              }}
              className="w-full h-full"
            />
          ) : (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>
                {node.cadastralPnu ? '지적 경계 데이터를 불러올 수 없습니다' : 'PNU 코드가 없습니다'}
              </span>
              {/* 진단 정보 — 개발 중 원인 파악용 */}
              <span style={{ fontSize: '11px', color: '#f97316', fontFamily: 'monospace', background: '#fff7ed', padding: '4px 8px', borderRadius: '4px' }}>
                진단: {diagReason ?? '원인 불명'} | PNU: {node.cadastralPnu ?? 'none'}
              </span>
            </div>
          )}
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse}>
          <CadastralPanel
            node={node}
            onExportImage={async () => {
              if (mapRef.current && onExportCadastralImage) {
                const base64 = await mapRef.current.exportToImage();
                if (base64) onExportCadastralImage(base64);
              }
            }}
          />
        </ExpandedSidebar>
      </div>
    );
  }

  /* ── 3D 버드아이 뷰 (artboardType=image 분기보다 먼저 체크, sketch는 제외) ────────── */
  if (node.type === 'map3d' && node.artboardType !== 'sketch') {
    const center3d = node.map3dCenter;
    const heading3d = node.map3dHeading ?? null;
    const height3d = node.map3dHeight ?? 800;
    const offsetAngle3d = node.map3dOffsetAngle ?? 45;
    const showLabels3d = node.map3dShowLabels ?? true;

    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)', display: 'flex', flexDirection: 'column' }}>
          {center3d ? (
            <Map3DView
              ref={map3dRef}
              containerId={`map3d-${node.id}`}
              center={center3d}
              heading={heading3d}
              height={height3d}
              offsetAngle={offsetAngle3d}
              showLabels={showLabels3d}
            />
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>3D 뷰 데이터가 없습니다</span>
            </div>
          )}
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse}>
          <Map3DPanel
            node={node}
            map3dRef={map3dRef}
            onExportImage={onExportMap3dImage}
          />
        </ExpandedSidebar>
      </div>
    );
  }

  /* ── artboardType=image + [PLAN] 버튼 → sketch-to-plan ExpandedView ── */
  if (node.artboardType === 'image' && expandedViewMode === 'plan') {
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

  /* ── artboardType=image + [IMAGE] 버튼 or 더블클릭 → sketch-to-image ExpandedView ── */
  if (node.artboardType === 'image' && (expandedViewMode === 'image' || expandedViewMode === 'default')) {
    return (
      <SketchToImageExpandedView
        node={node}
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

  /* ── 생성 이미지 뷰 (image/plan → generate 결과, artboardType=image) ── */
  if (node.artboardType === 'image' && (node.type === 'image' || node.type === 'plan')) {
    const imgSrc = node.generatedImageData ?? node.thumbnailData;
    const displaySrc = imgSrc
      ? (imgSrc.startsWith('data:') ? imgSrc : `data:image/jpeg;base64,${imgSrc}`)
      : null;
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)', display: 'flex' }}>
        <div style={{
          position: 'absolute', inset: 0,
          left: 'calc(4rem + 1.5rem)',
          right: 'calc(var(--sidebar-w) + 2rem)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem',
        }}>
          {displaySrc ? (
            <img
              src={displaySrc}
              alt={node.title}
              style={{
                maxWidth: '100%', maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 'var(--radius-box)',
                boxShadow: 'var(--shadow-float)',
              }}
            />
          ) : (
            <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>이미지가 없습니다</span>
          )}
        </div>
        <LeftToolbar
          activeTool={activeTool} scale={scale}
          canUndo={canUndo} canRedo={canRedo}
          onToolChange={onToolChange} onUndo={onUndo} onRedo={onRedo}
          onZoomIn={onZoomIn} onZoomOut={onZoomOut} onZoomReset={onZoomReset}
          onAddArtboard={onAddArtboard}
        />
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
