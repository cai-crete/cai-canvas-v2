'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import localforage from 'localforage';
import {
  CanvasNode, CanvasEdge, NodeType,
  ArtboardType, NODE_TO_ARTBOARD_TYPE, NODES_THAT_EXPAND,
  NODE_DEFINITIONS, COL_GAP_PX, SketchPanelSettings, PlanPanelSettings, ViewpointPanelSettings,
  NODES_NAVIGATE_DISABLED, NODE_TARGET_ARTBOARD_TYPE,
  PlannerMessage, SavedInsightData, ElevationImages,
} from '@/types/canvas';
import type { ElevationGenerateResult } from '@/elevation/ExpandedView';
import type { PrintDraftState } from '@cai-crete/print-components';
import { nodeImageToSelectedImage } from '@/lib/printUtils';
import { placeNewChild } from '@/lib/autoLayout';
import { compressImageBase64 } from '@/lib/compressImage';
import InfiniteCanvas    from '@/components/InfiniteCanvas';
import LeftToolbar       from '@/components/LeftToolbar';
import RightSidebar      from '@/components/RightSidebar';
import ExpandedView      from '@/components/ExpandedView';
import GeneratingToast   from '@/components/GeneratingToast';

/* ── UUID 생성 (비보안 컨텍스트 폴백: HTTP 로컬 IP 접속 대응) ───── */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ── CrossGrid 합성 썸네일 생성 (Canvas API, 브라우저 전용) ──────── */
async function renderCrossGridThumbnail(images: ElevationImages): Promise<string> {
  const CW = 280, CH = 198;
  const canvas = document.createElement('canvas');
  canvas.width  = CW * 3;
  canvas.height = CH * 3;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#F4F4F4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loadImg = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src.startsWith('data:') || src.startsWith('http') ? src : `data:image/jpeg;base64,${src}`;
  });

  const drawCell = async (src: string, col: number, row: number) => {
    try {
      const img = await loadImg(src);
      const x = col * CW, y = row * CH;
      const s = Math.min(CW / img.width, CH / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, CW, CH);
      ctx.drawImage(img, x + (CW - w) / 2, y + (CH - h) / 2, w, h);
    } catch { /* skip on error */ }
  };

  await Promise.all([
    drawCell(images.top,   1, 0),
    drawCell(images.left,  0, 1),
    drawCell(images.front, 1, 1),
    drawCell(images.right, 2, 1),
    drawCell(images.rear,  1, 2),
  ]);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/* ── 스토리지 키 ─────────────────────────────────────────────────── */
const LF_NODES = 'cai-canvas-nodes';
const LF_EDGES = 'cai-canvas-edges';
const LS_VIEW  = 'cai-canvas-view';

async function lfSaveNodes(nodes: CanvasNode[]) {
  try { await localforage.setItem(LF_NODES, nodes); } catch { /* quota */ }
}

async function lfLoadNodes(): Promise<CanvasNode[]> {
  try {
    const raw = await localforage.getItem<CanvasNode[]>(LF_NODES);
    if (!raw) return [];
    return raw.map(n => ({ ...n, artboardType: n.artboardType ?? 'sketch' }));
  } catch { return []; }
}

async function lfSaveEdges(edges: CanvasEdge[]) {
  try { await localforage.setItem(LF_EDGES, edges); } catch { /* quota */ }
}

async function lfLoadEdges(): Promise<CanvasEdge[]> {
  try { return (await localforage.getItem<CanvasEdge[]>(LF_EDGES)) || []; }
  catch { return []; }
}

function lsSaveView(scale: number, offset: { x: number; y: number }) {
  try { localStorage.setItem(LS_VIEW, JSON.stringify({ scale, offset })); } catch { /* quota */ }
}

function lsLoadView(): { scale: number; offset: { x: number; y: number } } {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_VIEW) || '{}');
    return {
      scale:  raw.scale  ?? 1,
      offset: raw.offset ?? { x: 80, y: 80 },
    };
  } catch { return { scale: 1, offset: { x: 80, y: 80 } }; }
}

const CARD_W    = 280;
const CARD_H    = 198;
const HEADER_H  = 56;   /* var(--header-h) = 3.5rem */
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

/* 아트보드 미선택 상태에서 탭 클릭 시 바로 expand 진입하는 노드 */
const DIRECT_EXPAND_NODES: NodeType[] = ['image', 'plan', 'planners'];

type ActiveTool = 'cursor' | 'handle';

export default function CanvasPage() {
  /* ── viewport ──────────────────────────────────────────────────── */
  const [scale,  setScale]  = useState(1);
  const [offset, setOffset] = useState({ x: 80, y: 80 });

  /* ── tool ───────────────────────────────────────────────────────── */
  const [activeTool, setActiveTool] = useState<ActiveTool>('cursor');

  /* ── nodes + history ─────────────────────────────────────────────── */
  const [nodes,        setNodes]        = useState<CanvasNode[]>([]);
  const [history,      setHistory]      = useState<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([{ nodes: [], edges: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  /* ── edges + 신규 엣지 애니메이션 ───────────────────────────────── */
  const [edges,      setEdges]      = useState<CanvasEdge[]>([]);
  const [newEdgeIds] = useState<Set<string>>(new Set());

  /* ── edges 최신값 ref (stale closure 방지) ──────────────────────── */
  const edgesRef = useRef<CanvasEdge[]>([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  /* ── planners expand 중 실시간 데이터 ref ───────────────────────── */
  const plannerMessagesRef    = useRef<PlannerMessage[]>([]);
  const plannerInsightDataRef = useRef<SavedInsightData | null>(null);

  /* ── localStorage 복원 완료 플래그 (persist effect 선실행 방지) ─── */
  const isRestoredRef = useRef(false);

  /* ── 줌 배율 버튼 사이클 상태 (0: idle, 1: fit-all, 2: focus-latest) */
  const zoomCycleStateRef = useRef(0);
  const savedViewRef      = useRef<{ scale: number; offset: { x: number; y: number } } | null>(null);

  /* ── 선택 / 확장 상태 ────────────────────────────────────────────── */
  const [selectedNodeIds,      setSelectedNodeIds]      = useState<string[]>([]);
  const [expandedNodeId,       setExpandedNodeId]       = useState<string | null>(null);
  const [expandedViewMode,     setExpandedViewMode]     = useState<'image' | 'plan' | 'default'>('default');
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  /* expand 진입 시 planners ref를 기존 노드 데이터로 초기화 */
  useEffect(() => {
    if (!expandedNodeId) return;
    const node = nodes.find(n => n.id === expandedNodeId);
    if (node?.type === 'planners') {
      plannerMessagesRef.current    = node.plannerMessages ?? [];
      plannerInsightDataRef.current = node.plannerInsightData ?? null;
    }
  // expandedNodeId 변경 시에만 초기화 (nodes 변경마다 리셋하면 안 됨)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedNodeId]);

  /* ── 생성 상태 ──────────────────────────────────────────────────── */
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState('IMAGE GENERATING');
  const abortControllerRef = useRef<AbortController | null>(null);

  /* ── 통합 사이드바 상태 ──────────────────────────────────────────── */
  const [activeSidebarNodeType, setActiveSidebarNodeType] = useState<NodeType | null>(null);
  const [printDraftState,       setPrintDraftState]       = useState<PrintDraftState | null>(null);
  const [printAutoGenerate,     setPrintAutoGenerate]     = useState(false);

  /* ── Toast 시스템 ─────────────────────────────────────────────── */
  type ToastType = 'warning' | 'success';
  interface ToastState { message: string; type: ToastType; visible: boolean; fadingOut: boolean; }
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'warning', visible: false, fadingOut: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'warning') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, visible: true, fadingOut: false });
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, fadingOut: true }));
      toastTimerRef.current = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false, fadingOut: false }));
      }, 300);
    }, 2500);
  }, []);

  /* ── 선택된 아트보드 유형 (파생값) ──────────────────────────────── */
  const selectedArtboardType: ArtboardType | null = selectedNodeId
    ? (nodes.find(n => n.id === selectedNodeId)?.artboardType ?? null)
    : null;

  /* ── 선택 노드에 대응하는 활성 탭 힌트 (disabled 방지용, 시각 하이라이트 없음) */
  const activeTabHint: NodeType | null = (() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    if (
      node.artboardType === 'image' &&
      (node.type === 'plan' || node.type === 'image' || node.type === 'viewpoint')
    ) return 'image';
    return null;
  })();

  /* ── history helpers ─────────────────────────────────────────────── */
  const pushHistory = useCallback((nextNodes: CanvasNode[], nextEdges?: CanvasEdge[]) => {
    const edgesToSave = nextEdges ?? edgesRef.current;
    setHistory(prev => [...prev.slice(0, historyIndex + 1), { nodes: nextNodes, edges: edgesToSave }]);
    setHistoryIndex(i => i + 1);
    setNodes(nextNodes);
    if (nextEdges !== undefined) setEdges(nextEdges);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setNodes(history[idx].nodes);
    setEdges(history[idx].edges);
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setNodes(history[idx].nodes);
    setEdges(history[idx].edges);
  }, [historyIndex, history]);

  /* ── keyboard shortcuts ──────────────────────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.shiftKey ? redo() : undo();
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setSelectedNodeIds([]);
        if (expandedNodeId) handleReturnFromExpand();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, expandedNodeId]);

  /* ── persist: nodes → IndexedDB (복원 완료 후에만) ─────────────── */
  useEffect(() => {
    if (!isRestoredRef.current) return;
    lfSaveNodes(nodes);
  }, [nodes]);

  /* ── persist: edges → IndexedDB (복원 완료 후에만) ─────────────── */
  useEffect(() => {
    if (!isRestoredRef.current) return;
    lfSaveEdges(edges);
  }, [edges]);

  /* ── persist: viewport → localStorage (복원 완료 후에만) ───────── */
  useEffect(() => {
    if (!isRestoredRef.current) return;
    lsSaveView(scale, offset);
  }, [scale, offset]);

  /* ── mount: IndexedDB 복원 → isRestoredRef = true ──────────────── */
  useEffect(() => {
    const view = lsLoadView();
    setScale(view.scale);
    setOffset(view.offset);

    Promise.all([lfLoadNodes(), lfLoadEdges()]).then(([savedNodes, savedEdges]) => {
      if (savedNodes.length > 0) {
        setNodes(savedNodes);
        setEdges(savedEdges);
        setHistory([{ nodes: savedNodes, edges: savedEdges }]);
      }
      isRestoredRef.current = true;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 노드 생성 후 즉시 expand 진입 ──────────────────────────────── */
  const createAndExpandNode = useCallback((type: NodeType) => {
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === type);
    const num = existing.length + 1;
    const artboardType: ArtboardType = NODE_TO_ARTBOARD_TYPE[type] ?? 'blank';
    const newId = generateId();

    const cwx = (window.innerWidth  / 2 - offset.x) / scale - CARD_W / 2;
    const cwy = (window.innerHeight / 2 - offset.y) / scale - 120;
    let position = { x: cwx, y: cwy };

    if (selectedNodeId) {
      const { position: childPos, pushdowns } = placeNewChild(selectedNodeId, currentNodes, currentEdges);
      position = childPos;
      const newNode: CanvasNode = {
        id: newId, type,
        title: `${NODE_DEFINITIONS[type].caption} #${num}`,
        position, instanceNumber: num, hasThumbnail: false, artboardType,
        parentId: selectedNodeId, autoPlaced: true,
      };
      let nextNodes = [...currentNodes, newNode];
      if (pushdowns.size > 0) {
        nextNodes = nextNodes.map(n => {
          const np = pushdowns.get(n.id);
          return np ? { ...n, position: np } : n;
        });
      }
      const newEdge: CanvasEdge = { id: generateId(), sourceId: selectedNodeId, targetId: newId };
      pushHistory(nextNodes, [...currentEdges, newEdge]);
    } else {
      const newNode: CanvasNode = {
        id: newId, type,
        title: `${NODE_DEFINITIONS[type].caption} #${num}`,
        position, instanceNumber: num, hasThumbnail: false, artboardType,
      };
      pushHistory([...currentNodes, newNode]);
    }

    setExpandedNodeId(newId);
    setActiveSidebarNodeType(null);
  }, [nodes, offset, scale, pushHistory, selectedNodeId]);

  /* ── '+' 버튼: 빈 아트보드 생성 ─────────────────────────────────── */
  const handleAddArtboard = useCallback(() => {
    const currentNodes = nodes;
    const num = currentNodes.length + 1;
    const cwx = (window.innerWidth  / 2 - offset.x) / scale - CARD_W / 2;
    const cwy = (window.innerHeight / 2 - offset.y) / scale - 120;
    const newNode: CanvasNode = {
      id: generateId(),
      type: 'sketch',
      title: `ARTBOARD #${num}`,
      position: { x: cwx, y: cwy },
      instanceNumber: num,
      hasThumbnail: false,
      artboardType: 'blank',
    };
    pushHistory([...currentNodes, newNode]);
    setSelectedNodeIds([newNode.id]);
    setActiveSidebarNodeType(null);
  }, [nodes, offset, scale, pushHistory]);

  /* ── elevation/viewpoint/diagram 전용 자식 노드 생성 ─────────── */
  const createChildNode = useCallback((
    parentId: string, type: NodeType, artboardType: ArtboardType,
    extraProps?: Partial<CanvasNode>,
  ): string => {
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === type);
    const num = existing.length + 1;
    const newId = generateId();

    const { position, pushdowns } = placeNewChild(parentId, currentNodes, currentEdges);
    const newNode: CanvasNode = {
      id: newId, type,
      title: `${NODE_DEFINITIONS[type].caption} #${num}`,
      position, instanceNumber: num, hasThumbnail: false,
      artboardType, parentId, autoPlaced: true,
      ...extraProps,
    };

    let nextNodes = [...currentNodes, newNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }

    const newEdge: CanvasEdge = { id: generateId(), sourceId: parentId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
    return newId;
  }, [nodes, pushHistory]);

  /* ── 이미지 파일 업로드 → image 아트보드 생성 ────────────────── */
  const handleUploadImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const currentNodes = nodes;
      const num = currentNodes.filter(n => n.type === 'image').length + 1;
      const cwx = (window.innerWidth  / 2 - offset.x) / scale - CARD_W / 2;
      const cwy = (window.innerHeight / 2 - offset.y) / scale - 120;
      const newNode: CanvasNode = {
        id: generateId(),
        type: 'image',
        title: `${NODE_DEFINITIONS['image'].caption} #${num}`,
        position: { x: cwx, y: cwy },
        instanceNumber: num,
        hasThumbnail: true,
        artboardType: 'image',
        thumbnailData: dataUrl,
      };
      pushHistory([...currentNodes, newNode]);
      setSelectedNodeIds([newNode.id]);
    };
    reader.readAsDataURL(file);
  }, [nodes, offset, scale, pushHistory]);

  /* ── planners: 지적도 노드 자동 생성 ────────────────────────────── */
  const handleCadastralDataReceived = useCallback((pnu: string | null, _landCount: number) => {
    if (!expandedNodeId || !pnu) return;
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === 'cadastral');
    const num = existing.length + 1;
    const newId = generateId();
    const { position, pushdowns } = placeNewChild(expandedNodeId, currentNodes, currentEdges);
    const newNode: CanvasNode = {
      id: newId, type: 'cadastral',
      title: `지적도 #${num}`,
      position, instanceNumber: num, hasThumbnail: false, artboardType: 'image',
      parentId: expandedNodeId, autoPlaced: true,
      cadastralPnu: pnu,
    };
    let nextNodes = [...currentNodes, newNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }
    const newEdge: CanvasEdge = { id: generateId(), sourceId: expandedNodeId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
  }, [expandedNodeId, nodes, pushHistory]);

  /* ── expand에서 돌아올 때 썸네일 생성 + planners 데이터 flush */
  const handleReturnFromExpand = useCallback(() => {
    setExpandedViewMode('default');
    if (!expandedNodeId) { setExpandedNodeId(null); return; }
    const node = nodes.find(n => n.id === expandedNodeId);
    const isSketchImage = node?.artboardType === 'sketch' && node?.type === 'image';
    const isSketchPlan  = node?.artboardType === 'sketch' && node?.type === 'plan';
    const isPlanners    = node?.type === 'planners';

    if (!isSketchImage && !isSketchPlan) {
      const msgs        = plannerMessagesRef.current;
      const insightData = plannerInsightDataRef.current;
      setNodes(prev => {
        const next = prev.map(n => {
          if (n.id !== expandedNodeId) return n;
          const targetArtboardType = NODE_TARGET_ARTBOARD_TYPE[n.type] || n.artboardType;
          const updates: Partial<CanvasNode> = { hasThumbnail: true, artboardType: targetArtboardType };
          if (isPlanners) {
            if (msgs.length > 0)  updates.plannerMessages    = msgs;
            if (insightData)      updates.plannerInsightData = insightData;
          }
          return { ...n, ...updates };
        });
        setHistory(h => [...h.slice(0, historyIndex + 1), { nodes: next, edges: edgesRef.current }]);
        setHistoryIndex(i => i + 1);
        return next;
      });
    }

    plannerMessagesRef.current    = [];
    plannerInsightDataRef.current = null;
    setPrintDraftState(null);
    setPrintAutoGenerate(false);
    setExpandedNodeId(null);
  }, [expandedNodeId, nodes, historyIndex]);

  /* ── sketch-image [<-]: 스케치 + 패널 설정 저장 ─────────────────── */
  const handleCollapseWithSketch = useCallback((sketchBase64: string, thumbnailBase64: string, panelSettings?: SketchPanelSettings) => {
    if (!expandedNodeId) return;
    setGeneratingLabel('IMAGE GENERATING');
    setNodes(prev => prev.map(n => {
      if (n.id !== expandedNodeId) return n;
      const updates: Partial<CanvasNode> = { sketchPanelSettings: panelSettings };
      /* image 아트보드(생성 결과 노드)는 원본 이미지 데이터 유지 — 스케치 노드만 업데이트 */
      if (sketchBase64 && n.artboardType !== 'image') {
        updates.hasThumbnail  = true;
        updates.thumbnailData = thumbnailBase64;
        updates.sketchData    = sketchBase64;
      }
      return { ...n, ...updates };
    }));
  }, [expandedNodeId]);

  /* ── sketch-plan [<-]: 스케치 + 패널 설정 저장 ────────────────────── */
  const handleCollapseWithPlanSketch = useCallback((sketchBase64: string, thumbnailBase64: string, planSettings?: PlanPanelSettings) => {
    if (!expandedNodeId) return;
    setGeneratingLabel('PLAN GENERATING');
    setNodes(prev => prev.map(n => {
      if (n.id !== expandedNodeId) return n;
      const updates: Partial<CanvasNode> = { planPanelSettings: planSettings };
      /* image 아트보드(생성 결과 노드)는 원본 이미지 데이터 유지 — 스케치 노드만 업데이트 */
      if (sketchBase64 && n.artboardType !== 'image') {
        updates.hasThumbnail  = true;
        updates.thumbnailData = thumbnailBase64;
        updates.sketchData    = sketchBase64;
      }
      return { ...n, ...updates };
    }));
  }, [expandedNodeId]);

  /* ── sketch-plan GENERATE 완료 ─────────────────────────────────────── */
  const handleGeneratePlanComplete = useCallback(({
    sketchBase64: _sketchBase64, thumbnailBase64: _thumbnailBase64, generatedPlanBase64, roomAnalysis, nodeId,
  }: { sketchBase64: string; thumbnailBase64: string; generatedPlanBase64: string; roomAnalysis: string; nodeId: string }) => {
    setIsGenerating(false);
    abortControllerRef.current = null;

    setNodes(prev => {
      const origin = prev.find(n => n.id === nodeId);
      if (!origin) return prev;

      /* 원본 노드는 변경하지 않음 — handleCollapseWithPlanSketch에서 이미 저장 완료 */
      const existingOfType = prev.filter(n => n.type === origin.type);
      const num = existingOfType.length + 1;
      const newNode: CanvasNode = {
        id: generateId(),
        type: 'plan',
        artboardType: 'image',
        title: `${NODE_DEFINITIONS['plan'].caption} #${num}`,
        position: {
          x: origin.position.x + CARD_W + COL_GAP_PX,
          y: origin.position.y,
        },
        instanceNumber: num,
        hasThumbnail: true,
        thumbnailData: generatedPlanBase64,
        generatedImageData: generatedPlanBase64,
        roomAnalysis,
        parentId: nodeId,
        autoPlaced: true,
      };

      const next = [...prev, newNode];

      const newEdge: CanvasEdge = {
        id: generateId(),
        sourceId: nodeId,
        targetId: newNode.id,
      };
      const nextEdges = [...edgesRef.current, newEdge];

      pushHistory(next, nextEdges);
      setExpandedNodeId(null);
      return next;
    });
  }, [pushHistory]);

  /* ── print 노드 부분 업데이트 (savedState, selectedImages 등) ──────── */
  const handlePrintNodeUpdate = useCallback((updates: Partial<CanvasNode>) => {
    if (!expandedNodeId) return;
    setNodes(prev => prev.map(n =>
      n.id === expandedNodeId ? { ...n, ...updates } : n
    ));
  }, [expandedNodeId]);

  /* ── print GENERATE 완료 → 노드 썸네일 업데이트 ────────────────────── */
  const handleGeneratePrintComplete = useCallback(({ thumbnailBase64 }: { thumbnailBase64: string }) => {
    if (!expandedNodeId) return;
    setNodes(prev => prev.map(n =>
      n.id === expandedNodeId
        ? {
            ...n,
            hasThumbnail: true,
            thumbnailData: thumbnailBase64,
            // thumbnailData를 덮어쓰기 전에 원본 소스 이미지를 generatedImageData에 보존
            generatedImageData: n.generatedImageData ?? n.thumbnailData,
          }
        : n
    ));
  }, [expandedNodeId]);

  /* ── elevation GENERATE 완료 → CrossGrid 결과 노드 생성 ──────────── */
  const handleGenerateElevationComplete = useCallback(async ({
    aepl, images, nodeId,
  }: ElevationGenerateResult) => {
    setIsGenerating(false);

    const thumbnail = await renderCrossGridThumbnail(images);

    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === 'elevation');
    const num = existing.length + 1;
    const newId = generateId();

    const { position, pushdowns } = placeNewChild(nodeId, currentNodes, currentEdges);

    const resultNode: CanvasNode = {
      id: newId,
      type: 'elevation',
      title: `${NODE_DEFINITIONS['elevation'].caption} #${num}`,
      position,
      instanceNumber: num,
      hasThumbnail: true,
      artboardType: 'image',
      parentId: nodeId,
      autoPlaced: true,
      thumbnailData: thumbnail,
      generatedImageData: images.front,
      elevationImages: images,
      elevationAeplData: aepl,
    };

    let nextNodes = currentNodes.map(n =>
      n.id === nodeId ? { ...n, hasThumbnail: true } : n
    );
    nextNodes = [...nextNodes, resultNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }

    const newEdge: CanvasEdge = { id: generateId(), sourceId: nodeId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
  }, [nodes, pushHistory]);

  /* ── sketch-image GENERATE 실패 → ExpandedView 재진입 ─────────────── */
  const handleGenerateError = useCallback((nodeId: string) => {
    setIsGenerating(false);
    abortControllerRef.current = null;
    setExpandedNodeId(nodeId);
  }, []);

  /* ── AbortController 동기화 (취소 버튼 연결) ────────────────────── */
  const handleAbortControllerReady = useCallback((ctrl: AbortController) => {
    abortControllerRef.current = ctrl;
  }, []);

  /* ── node position ───────────────────────────────────────────────── */
  const updateNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, position: pos } : n));
  }, []);

  const commitNodePosition = useCallback((id: string) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, autoPlaced: false } : n);
      setHistory(h => [...h.slice(0, historyIndex + 1), { nodes: next, edges: edgesRef.current }]);
      setHistoryIndex(i => i + 1);
      return next;
    });
  }, [historyIndex]);

  /* ── 사이드바 노드 탭 선택 ────────────────────────────────────────── */
  const handleNodeTabSelect = useCallback((type: NodeType) => {
    const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

    /* print + image 아트보드 선택(단일/다중) → print 노드 생성 + expanded 진입 (이미지 사전 로드) */
    if (type === 'print') {
      const imageNodes = selectedNodeIds
        .map(id => nodes.find(n => n.id === id))
        .filter((n): n is CanvasNode => !!n && n.artboardType === 'image');

      if (imageNodes.length > 0) {
        const currentNodes = nodes;
        const currentEdges = edgesRef.current;
        const num = currentNodes.filter(n => n.type === 'print').length + 1;
        const newId = generateId();
        const { position, pushdowns } = placeNewChild(imageNodes[0].id, currentNodes, currentEdges);

        const preloadedImages = imageNodes.flatMap(n => {
          const raw = n.generatedImageData ?? n.thumbnailData;
          return raw ? [nodeImageToSelectedImage(raw, n.id)] : [];
        });

        const printNode: CanvasNode = {
          id: newId, type: 'print',
          title: `${NODE_DEFINITIONS['print'].caption} #${num}`,
          position, instanceNumber: num, hasThumbnail: false,
          artboardType: 'thumbnail',
          parentId: imageNodes[0].id, autoPlaced: true,
          printSelectedImages: preloadedImages,
        };

        let nextNodes = [...currentNodes, printNode];
        if (pushdowns.size > 0) {
          nextNodes = nextNodes.map(n => {
            const np = pushdowns.get(n.id);
            return np ? { ...n, position: np } : n;
          });
        }

        const newEdges: CanvasEdge[] = imageNodes.map(imgNode => ({
          id: generateId(), sourceId: imgNode.id, targetId: newId,
        }));

        pushHistory(nextNodes, [...currentEdges, ...newEdges]);
        setExpandedNodeId(newId);
        setActiveSidebarNodeType(null);
        return;
      }
    }

    /* ── 아트보드가 선택된 경우: 직접 액션 ──────────────────────── */
    if (selectedNode) {
      /* PLAN 탭 + image 아트보드 노드(plan/image/viewpoint) → Plan ExpandedView */
      if (
        type === 'plan' &&
        selectedNode.artboardType === 'image' &&
        (selectedNode.type === 'plan' || selectedNode.type === 'image' || selectedNode.type === 'viewpoint')
      ) {
        setExpandedViewMode('plan');
        setExpandedNodeId(selectedNode.id);
        setActiveSidebarNodeType(null);
        return;
      }

      /* IMAGE 탭 + plan/image/viewpoint 노드(artboardType=image) → Image ExpandedView */
      if (
        type === 'image' &&
        selectedNode.artboardType === 'image' &&
        (selectedNode.type === 'plan' || selectedNode.type === 'image' || selectedNode.type === 'viewpoint')
      ) {
        setExpandedViewMode('image');
        setExpandedNodeId(selectedNode.id);
        setActiveSidebarNodeType(null);
        return;
      }

      /* planners: 선택 노드가 planners면 expand, 그 외에는 새 planners 자식 노드 생성 */
      if (type === 'planners') {
        if (selectedNode.type === 'planners') {
          setExpandedNodeId(selectedNode.id);
        } else {
          createAndExpandNode('planners');
        }
        setActiveSidebarNodeType(null);
        return;
      }

      /* viewpoint: 사이드바 패널 토글 (ExpandedView 없음) */
      if (type === 'viewpoint') {
        if (selectedNode.artboardType === 'image') {
          setActiveSidebarNodeType(prev => prev === 'viewpoint' ? null : 'viewpoint');
        } else {
          showToast('이미지를 선택해 주세요');
        }
        return;
      }

      /* elevation: image 아트보드에서 자식 노드 생성 + 즉시 expand */
      if (type === 'elevation') {
        if (selectedNode.artboardType === 'image') {
          const sourceImage = selectedNode.generatedImageData ?? selectedNode.thumbnailData;
          setGeneratingLabel('ELEVATION GENERATING');
          const childId = createChildNode(selectedNode.id, type, 'image',
            sourceImage ? { thumbnailData: sourceImage, hasThumbnail: true } : undefined
          );
          setExpandedNodeId(childId);
        } else {
          showToast('이미지를 선택해 주세요');
        }
        setActiveSidebarNodeType(null);
        return;
      }

      /* diagram: image 아트보드에서만 자식 생성 */
      if (NODES_NAVIGATE_DISABLED.includes(type)) {
        if (selectedNode.artboardType === 'image') {
          createChildNode(selectedNode.id, type, 'image');
        }
        setActiveSidebarNodeType(null);
        return;
      }

      const targetArtboardType = NODE_TO_ARTBOARD_TYPE[type];
      if (!targetArtboardType) return;

      /* blank 아트보드: 유형 배정 */
      if (selectedNode.artboardType === 'blank') {
        const next = nodes.map(n =>
          n.id === selectedNode.id
            ? { ...n, artboardType: targetArtboardType, type }
            : n
        );
        pushHistory(next);
      }

      /* expand 진입 노드 → 즉시 expand */
      if (NODES_THAT_EXPAND.includes(type)) {
        setExpandedNodeId(selectedNode.id);
      }

      setActiveSidebarNodeType(null);
      return;
    }

    /* ── 아트보드 미선택: 기존 동작 ─────────────────────────────── */
    if (type === 'viewpoint') {
      showToast('이미지를 선택해 주세요');
      return;
    }
    if (NODES_NAVIGATE_DISABLED.includes(type)) return;
    if (DIRECT_EXPAND_NODES.includes(type)) {
      createAndExpandNode(type);
      return;
    }
    setActiveSidebarNodeType(prev => prev === type ? null : type);
  }, [selectedNodeId, selectedNodeIds, nodes, pushHistory, createAndExpandNode, createChildNode, showToast]);

  /* ── "→" 버튼: 사이드바 패널에서 expand 진입 ──────────────────────── */
  const handleNavigateToExpand = useCallback((type: NodeType) => {
    if (NODES_NAVIGATE_DISABLED.includes(type)) return;
    if (selectedNodeId) {
      const selected = nodes.find(n => n.id === selectedNodeId);
      if (selected) {
        const isImageResultNode =
          type === 'image' &&
          selected.artboardType === 'image' &&
          (selected.type === 'image' || selected.type === 'viewpoint' || selected.type === 'plan');
        if (selected.type === type || isImageResultNode) {
          setExpandedViewMode(type === 'image' ? 'image' : 'default');
          setExpandedNodeId(selectedNodeId);
          setActiveSidebarNodeType(null);
          return;
        }
      }
    }
    setExpandedViewMode('default');
    createAndExpandNode(type);
  }, [selectedNodeId, nodes, createAndExpandNode]);

  /* ── print 사이드바 액션 (generate / export) ─────────────────────── */
  const handlePrintSidebarAction = useCallback((action: 'generate' | 'export' | 'saves', draft: PrintDraftState) => {
    if (!selectedNodeId) return;
    if (action === 'generate') {
      setPrintDraftState(draft);
      setPrintAutoGenerate(true);
    } else {
      setPrintAutoGenerate(false);
    }
    setExpandedNodeId(selectedNodeId);
    setActiveSidebarNodeType(null);
  }, [selectedNodeId]);

  /* ── 썸네일 단일 클릭 → 선택 + 패널 열기 ───────────────────────── */
  const handleNodeCardSelect = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setSelectedNodeIds([id]);
    /* thumbnail 아트보드: 노드 종류별 패널 표시 (print와 planners 구분) */
    if (node.artboardType === 'thumbnail') {
      setActiveSidebarNodeType(node.type === 'print' ? 'print' : 'planners');
    } else {
      setActiveSidebarNodeType(null);
    }
  }, [nodes]);

  /* ── 빈 캔버스 클릭 → 선택 해제 + 패널 닫기 ────────────────────── */
  const handleNodeDeselect = useCallback(() => {
    setSelectedNodeIds([]);
    setActiveSidebarNodeType(null);
  }, []);

  const handleNodesSelect = useCallback((ids: string[]) => {
    setSelectedNodeIds(ids);
    setActiveSidebarNodeType(null);
  }, []);

  /* ── node duplicate / delete ─────────────────────────────────────── */
  const duplicateNode = useCallback((id: string) => {
    const src = nodes.find(n => n.id === id);
    if (!src) return;
    const num = nodes.filter(n => n.type === src.type).length + 1;
    pushHistory([...nodes, {
      ...src,
      id: generateId(),
      title: `${NODE_DEFINITIONS[src.type].caption} #${num}`,
      instanceNumber: num,
      position: { x: src.position.x + 24, y: src.position.y + 24 },
    }]);
  }, [nodes, pushHistory]);

  const deleteNode = useCallback((id: string) => {
    setSelectedNodeIds(prev => {
      if (prev.includes(id)) setActiveSidebarNodeType(null);
      return prev.filter(sid => sid !== id);
    });
    const nextNodes = nodes.filter(n => n.id !== id);
    const nextEdges = edgesRef.current.filter(e => e.sourceId !== id && e.targetId !== id);
    pushHistory(nextNodes, nextEdges);
  }, [nodes, pushHistory]);

  /* ── Sketch-to-Image 생성 완료 핸들러 ───────────────────────────── */
  const handleGenerateComplete = useCallback(({
    sketchBase64: _sketchBase64, thumbnailBase64: _thumbnailBase64, generatedBase64, nodeId,
  }: { sketchBase64: string; thumbnailBase64: string; generatedBase64: string; nodeId: string }) => {
    setIsGenerating(false);
    abortControllerRef.current = null;

    setNodes(prev => {
      const origin = prev.find(n => n.id === nodeId);
      if (!origin) return prev;

      /* 원본 노드는 변경하지 않음 — handleCollapseWithSketch에서 이미 저장 완료 */
      const existingOfType = prev.filter(n => n.type === origin.type);
      const num = existingOfType.length + 1;
      const newNode: CanvasNode = {
        id: generateId(),
        type: 'image',
        artboardType: 'image',
        title: `${NODE_DEFINITIONS['image'].caption} #${num}`,
        position: {
          x: origin.position.x + CARD_W + COL_GAP_PX,
          y: origin.position.y,
        },
        instanceNumber: num,
        hasThumbnail: true,
        thumbnailData: generatedBase64,
        generatedImageData: generatedBase64,
        parentId: nodeId,
        autoPlaced: true,
      };

      const next = [...prev, newNode];

      const newEdge: CanvasEdge = {
        id: generateId(),
        sourceId: nodeId,
        targetId: newNode.id,
      };
      const nextEdges = [...edgesRef.current, newEdge];

      pushHistory(next, nextEdges);
      setExpandedNodeId(null);
      return next;
    });
  }, [pushHistory]);

  /* ── viewpoint 패널 설정 변경 ───────────────────────────────────── */
  const handleViewpointSettingsChange = useCallback((settings: ViewpointPanelSettings) => {
    if (!selectedNodeId) return;
    setNodes(prev => prev.map(n =>
      n.id === selectedNodeId ? { ...n, viewpointPanelSettings: settings } : n
    ));
  }, [selectedNodeId]);

  /* ── viewpoint GENERATE ──────────────────────────────────────────── */
  const handleGenerateViewpoint = useCallback(async () => {
    if (!selectedNodeId) return;
    const sourceNode = nodes.find(n => n.id === selectedNodeId);
    if (!sourceNode) return;

    const settings = sourceNode.viewpointPanelSettings;
    if (!settings?.viewpoint) return;

    const rawImage = sourceNode.generatedImageData ?? sourceNode.thumbnailData;
    if (!rawImage) return;

    /* data URL 여부에 따라 base64 추출 */
    const isDataUrl = rawImage.startsWith('data:');
    const base64    = isDataUrl ? rawImage.split(',')[1] : rawImage;
    const mimeType  = isDataUrl && rawImage.startsWith('data:image/jpeg') ? 'image/jpeg'
                    : isDataUrl && rawImage.startsWith('data:image/webp') ? 'image/webp'
                    : 'image/png';

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    setGeneratingLabel('PICTURE GENERATING');
    setIsGenerating(true);

    try {
      /* Vercel 4.5MB body 제한 대응: 이미지 압축 */
      const compressed = await compressImageBase64(base64, mimeType);

      const res = await fetch('/api/change-viewpoint', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: compressed.base64,
          mime_type:    compressed.mimeType,
          viewpoint:    settings.viewpoint,
          user_prompt:  settings.prompt,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `API 오류: ${res.status}`);
      }

      const data = await res.json() as { generated_image: string; analysis: string; report?: import('@/types/canvas').ViewpointAnalysisReport | null };

      setNodes(prev => {
        const origin = prev.find(n => n.id === selectedNodeId);
        if (!origin) return prev;

        const num = prev.filter(n => n.type === 'viewpoint').length + 1;
        const newNode: CanvasNode = {
          id: generateId(),
          type: 'viewpoint',
          artboardType: 'image',
          title: `${NODE_DEFINITIONS['viewpoint'].caption} #${num}`,
          position: {
            x: origin.position.x + CARD_W + COL_GAP_PX,
            y: origin.position.y,
          },
          instanceNumber: num,
          hasThumbnail: true,
          thumbnailData: data.generated_image,
          generatedImageData: data.generated_image,
          viewpointAnalysis: data.analysis,
          viewpointReport: data.report ?? undefined,
          viewpointPanelSettings: settings,
          parentId: selectedNodeId,
          autoPlaced: true,
        };

        const next = [...prev, newNode];
        const newEdge: CanvasEdge = {
          id: generateId(),
          sourceId: selectedNodeId,
          targetId: newNode.id,
        };
        pushHistory(next, [...edgesRef.current, newEdge]);
        return next;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      showToast(msg, 'warning');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [selectedNodeId, nodes, pushHistory, showToast]);

  /* ── 확장 뷰 ─────────────────────────────────────────────────────── */
  const expandedNode = expandedNodeId ? nodes.find(n => n.id === expandedNodeId) ?? null : null;

  /* ── zoom ───────────────────────────────────────────────────────── */
  const zoomIn  = () => setScale(s => Math.min(MAX_SCALE, parseFloat((s * 1.25).toFixed(2))));
  const zoomOut = () => setScale(s => Math.max(MIN_SCALE, parseFloat((s * 0.8).toFixed(2))));

  const handleZoomCycle = useCallback(() => {
    const state = zoomCycleStateRef.current;
    const vpW   = window.innerWidth;
    const vpH   = window.innerHeight - HEADER_H;

    if (state === 0) {
      savedViewRef.current = { scale, offset };

      if (nodes.length === 0) {
        setScale(1); setOffset({ x: 80, y: 80 });
        zoomCycleStateRef.current = 1;
        return;
      }
      const pad  = 80;
      const minX = Math.min(...nodes.map(n => n.position.x));
      const minY = Math.min(...nodes.map(n => n.position.y));
      const maxX = Math.max(...nodes.map(n => n.position.x + CARD_W));
      const maxY = Math.max(...nodes.map(n => n.position.y + CARD_H));
      const cW   = maxX - minX;
      const cH   = maxY - minY;
      const ns   = Math.min(
        (vpW - pad * 2) / cW,
        (vpH - pad * 2) / cH,
        MAX_SCALE,
      );
      const clampedScale = Math.max(MIN_SCALE, ns);
      setScale(clampedScale);
      setOffset({
        x: vpW / 2 - ((minX + maxX) / 2) * clampedScale,
        y: vpH / 2 - ((minY + maxY) / 2) * clampedScale,
      });
      zoomCycleStateRef.current = 1;
      return;
    }

    if (state === 1) {
      const last = nodes[nodes.length - 1];
      if (last) {
        const ns = 1;
        setScale(ns);
        setOffset({
          x: vpW / 2 - (last.position.x + CARD_W / 2) * ns,
          y: vpH / 2 - (last.position.y + CARD_H / 2) * ns,
        });
      }
      zoomCycleStateRef.current = 2;
      return;
    }

    const saved = savedViewRef.current;
    if (saved) { setScale(saved.scale); setOffset(saved.offset); }
    else        { setScale(1); setOffset({ x: 80, y: 80 }); }
    savedViewRef.current      = null;
    zoomCycleStateRef.current = 0;
  }, [scale, offset, nodes]);

  /* ── 헤더 ───────────────────────────────────────────────────────── */
  const Header = () => (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--color-white)',
      borderBottom: '1px solid var(--color-gray-100)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.25rem',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>
      <span className="text-title" style={{ fontSize: '1.25rem', letterSpacing: '0.05em' }}>
        CAI&nbsp;&nbsp;CANVAS
      </span>
    </header>
  );

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', userSelect: 'none' }}>
      <Header />

      {expandedNode ? (
        <ExpandedView
          node={expandedNode}
          viewMode={expandedViewMode}
          onCollapse={handleReturnFromExpand}
          onCollapseWithSketch={handleCollapseWithSketch}
          onGenerateError={handleGenerateError}
          onAbortControllerReady={handleAbortControllerReady}
          activeTool={activeTool}
          scale={scale}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onToolChange={setActiveTool}
          onUndo={undo}
          onRedo={redo}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={handleZoomCycle}
          onAddArtboard={handleAddArtboard}
          onGenerateComplete={handleGenerateComplete}
          onCollapseWithPlanSketch={handleCollapseWithPlanSketch}
          onGeneratePlanComplete={handleGeneratePlanComplete}
          onGeneratingChange={setIsGenerating}
          isGenerating={isGenerating}
          onGeneratePrintComplete={handleGeneratePrintComplete}
          onPrintNodeUpdate={handlePrintNodeUpdate}
          autoGeneratePrint={printAutoGenerate}
          printDraftState={printDraftState}
          onGenerateElevationComplete={handleGenerateElevationComplete}
          onPlannerMessagesChange={(msgs) => { plannerMessagesRef.current = msgs; }}
          onInsightDataChange={(data) => { plannerInsightDataRef.current = data as SavedInsightData | null; }}
          initialInsightData={expandedNode?.plannerInsightData}
          onCadastralDataReceived={handleCadastralDataReceived}
        />
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <InfiniteCanvas
            nodes={nodes}
            edges={edges}
            newEdgeIds={newEdgeIds}
            scale={scale}
            offset={offset}
            activeTool={activeTool}
            selectedNodeIds={selectedNodeIds}
            onScaleChange={setScale}
            onOffsetChange={setOffset}
            onNodePositionChange={updateNodePosition}
            onNodePositionCommit={commitNodePosition}
            onNodeSelect={handleNodeCardSelect}
            onNodeDeselect={handleNodeDeselect}
            onNodesSelect={handleNodesSelect}
            onNodeExpand={(id) => { setExpandedViewMode('default'); setExpandedNodeId(id); }}
            onNodeDuplicate={duplicateNode}
            onNodeDelete={deleteNode}
          />

          <LeftToolbar
            activeTool={activeTool}
            scale={scale}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onToolChange={setActiveTool}
            onUndo={undo}
            onRedo={redo}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={handleZoomCycle}
            onAddArtboard={handleAddArtboard}
            onUploadImage={handleUploadImage}
          />

          <RightSidebar
            activeSidebarNodeType={activeSidebarNodeType}
            selectedArtboardType={selectedArtboardType}
            activeTabHint={activeTabHint}
            onNodeTabSelect={handleNodeTabSelect}
            onNavigateToExpand={handleNavigateToExpand}
            hasSelectedArtboard={selectedNodeId !== null}
            onShowToast={showToast}
            viewpointPanelSettings={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.viewpointPanelSettings : undefined}
            onViewpointSettingsChange={handleViewpointSettingsChange}
            onViewpointGenerate={handleGenerateViewpoint}
            isViewpointGenerating={isGenerating}
            viewpointReport={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.viewpointReport : undefined}
            plannerMessages={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.plannerMessages : undefined}
            printSavedState={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.printSavedState : undefined}
            onPrintAction={handlePrintSidebarAction}
          />
        </div>
      )}

      {isGenerating && (
        <GeneratingToast
          label={expandedNode?.type === 'print' ? 'PRINT GENERATING' : generatingLabel}
          onCancel={() => {
            abortControllerRef.current?.abort();
            setIsGenerating(false);
          }}
        />
      )}

      {toast.visible && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: `translateX(-50%) translateY(${toast.fadingOut ? '8px' : '0'})`,
          opacity: toast.fadingOut ? 0 : 1,
          transition: 'opacity 300ms ease, transform 300ms ease',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--color-white)', borderRadius: 'var(--radius-pill)',
            boxShadow: 'var(--shadow-float)', padding: '0.625rem 1rem',
            fontFamily: 'var(--font-family-pretendard)', fontSize: '0.8125rem',
            color: 'var(--color-gray-700)', whiteSpace: 'nowrap',
          }}>
            {toast.type === 'warning' ? (
              <svg viewBox="0 0 16 16" style={{ width: 16, height: 16, flexShrink: 0 }} fill="none">
                <path d="M8 2L14 13H2L8 2Z" fill="#FFC107" stroke="none" />
                <line x1="8" y1="6.5" x2="8" y2="9.5" stroke="#333" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="8" cy="11.5" r="0.7" fill="#333" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" style={{ width: 16, height: 16, flexShrink: 0 }} fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#22C55E" strokeWidth="1.4" />
                <polyline points="5,8.5 7,10.5 11,6" stroke="#22C55E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}