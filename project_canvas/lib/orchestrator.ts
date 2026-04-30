import type { ArtboardStatus, RedTeamReport, CanvasNode } from '@/types/canvas';
import { NODE_CUTOFF_MAP } from '@/types/canvas';

/* ── 스토리지 키 ─────────────────────────────────────────────────── */
const LS_SCORE_MAP = 'cai-canvas-score-map';

export interface ScoreEntry {
  score: number;
  cutoff: number;
  status: ArtboardStatus;
  lastResult?: RedTeamReport;
}

export type ScoreMap = Record<string, ScoreEntry>;

/* ── 누적 점수 맵 로드 / 저장 ────────────────────────────────────── */
export function loadScoreMap(): ScoreMap {
  try {
    const raw = localStorage.getItem(LS_SCORE_MAP);
    return raw ? (JSON.parse(raw) as ScoreMap) : {};
  } catch {
    return {};
  }
}

export function saveScoreMap(map: ScoreMap): void {
  try {
    localStorage.setItem(LS_SCORE_MAP, JSON.stringify(map));
  } catch { /* quota */ }
}

/* ── 노드 초기 상태 엔트리 생성 ──────────────────────────────────── */
export function initScoreEntry(nodeType: string): ScoreEntry {
  return {
    score:  0,
    cutoff: NODE_CUTOFF_MAP[nodeType] ?? 1,
    status: 'VOID',
  };
}

/* ── CanvasNode 오케스트레이터 초기 필드 반환 (노드 생성 시 spread 용) */
export function nodeOrchestratorInit(nodeType: string): {
  artboardStatus: ArtboardStatus;
  cumulativeScore: number;
  nodeCutoff: number;
} {
  const cutoff = NODE_CUTOFF_MAP[nodeType] ?? 1;
  return { artboardStatus: 'VOID', cumulativeScore: 0, nodeCutoff: cutoff };
}

/* ── Orchestrator v2.0 CONSTRAINT: REALIZED 전환 guard ───────────
 * Red Team FAIL(is_final_approved=false)이면 절대 REALIZED 불가.
 * 누적 점수가 cutoff에 도달해야만 REALIZED로 전환.
 */
export function applyOrchestratorDecision(
  nodeId: string,
  node: CanvasNode,
  report: RedTeamReport,
): { nextStatus: ArtboardStatus; nextScore: number } {
  const currentScore = node.cumulativeScore ?? 0;
  const cutoff       = node.nodeCutoff ?? (NODE_CUTOFF_MAP[node.type] ?? 1);

  if (!report.is_final_approved) {
    logOrchestratorConstraint(nodeId, report.critical_defect);
    return { nextStatus: 'VERIFYING', nextScore: currentScore };
  }

  const nextScore  = currentScore + 1;
  const nextStatus: ArtboardStatus = nextScore >= cutoff ? 'REALIZED' : 'VERIFYING';

  logOrchestratorTransition(nodeId, node.artboardStatus ?? 'VOID', nextStatus, nextScore, cutoff);
  return { nextStatus, nextScore };
}

/* ── Dev Console 로그 (Phase 4) ─────────────────────────────────── */
export function logRedTeamResult(nodeId: string, report: RedTeamReport): void {
  const { node, constitution_check: cc, cumulative_status, is_final_approved } = report;
  console.group(`[CAI RED TEAM] ${node} | ${cumulative_status}`);
  console.log(`  Principle_1 (계보적 불변성):       ${cc.Principle_1 ? '✓' : '✗'}`);
  console.log(`  Principle_2 (결정론적 하드데이터): ${cc.Principle_2 ? '✓' : '✗'}`);
  console.log(`  Principle_3 (기능적 해결성):       ${cc.Principle_3 ? '✓' : '✗'}`);
  if (!is_final_approved) {
    console.warn(`→ ORCHESTRATOR DECISION: RETRY`);
    console.warn(`→ critical_defect: ${report.critical_defect}`);
  } else {
    console.info(`→ ORCHESTRATOR DECISION: PASS (nodeId: ${nodeId})`);
  }
  console.groupEnd();
}

function logOrchestratorTransition(
  nodeId: string,
  from: ArtboardStatus,
  to: ArtboardStatus,
  score: number,
  cutoff: number,
): void {
  const label = to === 'REALIZED'
    ? `VERIFYING → REALIZED (Score: ${score}/${cutoff})`
    : `${from} → ${to} (Score: ${score}/${cutoff})`;
  console.info(`[CAI ORCHESTRATOR] ${nodeId}: ${label}`);
}

function logOrchestratorConstraint(nodeId: string, reason: string): void {
  console.warn(`[CAI ORCHESTRATOR] CONSTRAINT BLOCKED: REALIZED 전환 차단 — Red Team FAIL`);
  console.warn(`  nodeId: ${nodeId} | reason: ${reason}`);
}

/* ── window.__cai_orchestrator 전역 인스펙터 초기화 (클라이언트 전용) */
export function initOrchestratorInspector(getNodes: () => CanvasNode[]): void {
  if (typeof window === 'undefined') return;

  const inspector = {
    get score_map(): ScoreMap {
      return loadScoreMap();
    },
    inspect(nodeId: string): void {
      const map  = loadScoreMap();
      const node = getNodes().find(n => n.id === nodeId);
      const entry = map[nodeId];
      console.group(`[CAI ORCHESTRATOR] inspect: ${nodeId}`);
      console.log('  type:             ', node?.type ?? 'unknown');
      console.log('  artboardStatus:   ', node?.artboardStatus ?? 'VOID');
      console.log('  cumulativeScore:  ', node?.cumulativeScore ?? 0);
      console.log('  nodeCutoff:       ', node?.nodeCutoff ?? 1);
      console.log('  scoreMapEntry:    ', entry ?? '(없음)');
      console.log('  lastRedTeamResult:', node?.redTeamLastResult ?? '(없음)');
      console.groupEnd();
    },
    reset(nodeId: string): void {
      const map = loadScoreMap();
      if (map[nodeId]) {
        map[nodeId] = { ...map[nodeId], score: 0, status: 'VOID', lastResult: undefined };
        saveScoreMap(map);
        console.info(`[CAI ORCHESTRATOR] reset: ${nodeId} → VOID (score: 0)`);
      } else {
        console.warn(`[CAI ORCHESTRATOR] reset: nodeId not found in score_map: ${nodeId}`);
      }
    },
  };

  (window as unknown as Record<string, unknown>)['__cai_orchestrator'] = inspector;
}
