# 작업지시서 — Orchestrator v2.0 (메인 프로토콜) + Red Team v2 이식 계획
작성일: 2026-04-29  
담당: AGENT A (실행 에이전트)  
분류: Protocol / Architecture

---

## 시스템 계층 구조 (핵심 인식)

```
┌─────────────────────────────────────────────────────────┐
│         Orchestrator v2.0 (메인 프로토콜)               │
│         orchestrator_augment_prompt-v2.md               │
│                                                         │
│  ┌── Intent Analysis → Node Mapping (N1~N7)             │
│  ├── Context Fusion & Causality (인과관계 구축)          │
│  ├── ▶ Red Team v2 호출 (verification_gate)             │
│  │       └─ 3대 원칙 검증 → binary score 반환           │
│  └── Score Management → 상태 전환                       │
│       VOID → VERIFYING → REALIZED                       │
└─────────────────────────────────────────────────────────┘
           │
           ▼ 결정을 기술적으로 실행
┌─────────────────────────────────────────────────────────┐
│     loop-orchestrator.txt (기술 실행 레이어)             │
│     에이전트 스폰 메커니즘 (Loop Review / Frontend)      │
└─────────────────────────────────────────────────────────┘
```

**Orchestrator v2.0은 앱 전체를 관통하는 단일 컨트롤 타워이다.**  
Red Team은 오케스트레이터가 호출하는 검증 서브시스템이며, 주도권은 항상 오케스트레이터에 있다.

---

## 이식 범위

| 문서 | 시스템 내 위치 | 이식 레이어 |
|------|---------------|-------------|
| `orchestrator_augment_prompt-v2.md` | **메인 프로토콜** — 전체 파이프라인 컨트롤 타워 | Agent Protocol Layer + App State Layer |
| `red-team-v2.md` | 검증 서브시스템 — 오케스트레이터 산하 verification_gate | Agent Protocol Layer |

---

## 이식 목표

1. **Orchestrator v2.0**: 모든 노드 실행의 시작점. 사용자 의도 분석 → 노드 매핑 → Causality 구축 → Red Team 게이트 → 상태 전환까지 전 과정 총괄. 앱 상태 레이어의 `artboardStatus`, `cumulative_score_map`과 실시간 연결.
2. **Red Team v2**: 오케스트레이터의 `verification_gate`에 종속. 3대 원칙(계보적 불변성 / 결정론적 하드데이터 / 기능적 해결성)으로 이진 검증. FAIL 시 오케스트레이터가 재실행 결정.

---

## Phase별 체크리스트

---

### Phase 1 — Agent Protocol Layer: 레퍼런스 파일 이식
> **담당:** AGENT A | **작업 유형:** 파일 생성

**우선순위: CRITICAL — 다른 Phase보다 먼저 완료해야 함**

- [x] `docs/references/orchestrator-v2.md` 신규 생성
  - `orchestrator_augment_prompt-v2.md` 내용 전체 이식
  - 파일 상단에 다음 주석 추가:
    ```
    # ORCHESTRATOR v2.0 — CAI-CANVAS 메인 프로토콜
    # 모든 노드 실행의 컨트롤 타워. loop-orchestrator.txt보다 상위 레이어.
    # Red Team v2(docs/references/red-team-v2.md)를 verification_gate로 호출한다.
    ```
- [x] `docs/references/red-team-v2.md` 신규 생성
  - `red-team-v2.md` 내용 전체 이식
  - 파일 상단에 다음 주석 추가:
    ```
    # RED TEAM v2 — CAI 검증 헌법 (Causality & Integrity Auditor)
    # Orchestrator v2.0의 verification_gate에 종속.
    # 독립적으로 실행되지 않으며, 오케스트레이터가 호출 시에만 작동.
    ```
- [x] `docs/references/loop-orchestrator.txt` 하단에 계층 관계 명시
- [x] `AGENTS.md` 업데이트
  - [x] 에이전트 정보 섹션에 **Orchestrator v2.0 메인 프로토콜** 참조 경로 추가
  - [x] Agent B 항목에 Red Team v2 연동 명시
  - [x] 세션 루틴 테이블에 신규 파일 경로 추가

---

### Phase 2 — App State Layer: 타입 확장
> **담당:** AGENT A / AGENT C | **작업 유형:** TypeScript 타입 수정

파일: `project_canvas/types/canvas.ts` (또는 동등 타입 파일)

- [x] `ArtboardStatus` 타입 추가
- [x] `CanvasNode`에 오케스트레이터 상태 필드 추가 (`artboardStatus`, `cumulativeScore`, `nodeCutoff`, `redTeamLastResult`)
- [x] `RedTeamReport` 인터페이스 추가
- [x] `NODE_CUTOFF_MAP` 상수 추가

---

### Phase 3 — App State Layer: 오케스트레이터 상태 스토리지
> **담당:** AGENT A | **작업 유형:** 상태 관리 로직 추가

파일: `project_canvas/app/page.tsx` 또는 `project_canvas/store/canvas.ts`

**오케스트레이터의 `cumulative_score_map` INPUT VARIABLE을 앱 레이어에 영속화한다.**

- [x] LocalStorage 키 등록: `cai-canvas-score-map`
- [x] `loadScoreMap()` / `saveScoreMap()` 유틸 함수 추가 (`project_canvas/lib/orchestrator.ts`)
- [x] 노드 생성 시 오케스트레이터 초기 상태 설정 — `nodeOrchestratorInit()` 전 노드 생성 지점에 적용
- [x] `applyOrchestratorDecision()` guard 함수 추가 (REALIZED 잠금 CONSTRAINT 구현)

---

### Phase 4 — Dev Console Layer: 오케스트레이터 상태 확인 인터페이스
> **담당:** AGENT A | **작업 유형:** 개발자 도구 연결 (UI 컴포넌트 변경 없음)

**방침:** 기존 UI에 배지/인디케이터를 추가하지 않는다. 오케스트레이터 상태는 브라우저 콘솔로만 노출.

- [x] `window.__cai_orchestrator` 전역 객체 노출 (score_map, inspect, reset)
- [x] Red Team 검증 결과 수신 시 콘솔 그룹 로그 (`logRedTeamResult()`)
- [x] 오케스트레이터 상태 전환 시 콘솔 로그 (`logOrchestratorTransition()`, `logOrchestratorConstraint()`)

---

### Phase 5 — Protocol Layer: 노드별 Red Team 판단 기준 문서화
> **담당:** AGENT A | **작업 유형:** 문서 작성 (독립 실행 가능)

- [x] `docs/product-specs/red-team-criteria.md` 신규 생성
  - 오케스트레이터의 `node_cutoff_standard` 근거 설명
  - 노드별(N1~N7) 3대 원칙 적용 방법 및 판단 기준
  - N3(Image) 고엔트로피 처리 규칙 (Cut-off 3의 근거)
  - 오케스트레이터와 Red Team 간 책임 경계 명시

---

## 구현 우선순위 & 의존성

```
Phase 1 (Protocol 파일 이식 — CRITICAL)   ← 즉시 실행 가능, 최우선
  └─▶ Phase 2 (타입 확장)                ← Phase 1 완료 후
        └─▶ Phase 3 (스토리지 로직)       ← Phase 2 완료 후
              └─▶ Phase 4 (콘솔 인터페이스) ← Phase 3 완료 후
Phase 5 (기준 문서)                       ← 언제든 독립적으로 작업 가능
```

**MVP (최소 구현):** Phase 1 + Phase 2

---

## 기술 결정 사항

### 1. 오케스트레이터 INPUT VARIABLES ↔ 앱 연결 맵

| Orchestrator v2.0 INPUT | 앱 소스 |
|---|---|
| `user_message` | 사용자 현재 명령 (Agent 컨텍스트) |
| `conversation_history` | Agent 컨텍스트 (앱 외부) |
| `selected_artboards` | `selectedNodeIds` + `nodes` 배열 조합 |
| `verification_report` | `node.redTeamLastResult` (Phase 2에서 추가) |
| `cumulative_score_map` | LocalStorage `cai-canvas-score-map` (Phase 3에서 구현) |
| `node_cutoff_standard` | `NODE_CUTOFF_MAP` 상수 (Phase 2에서 추가) |

### 2. 오케스트레이터 OUTPUT → 앱 상태 반영 맵

| Orchestrator v2.0 OUTPUT | 앱 처리 |
|---|---|
| `target_artboard_status: "VOID → VERIFYING"` | `node.artboardStatus = 'VERIFYING'` |
| `target_artboard_status: "VERIFYING → REALIZED"` | `node.artboardStatus = 'REALIZED'` (guard 통과 시) |
| `target_artboard_status: "VERIFYING → RETRY"` | `artboardStatus = 'VERIFYING'` 유지 + 콘솔 RETRY 로그 |
| `verification_gate.is_loop_active: true` | `saveScoreMap()` 업데이트 |

### 3. REALIZED 상태 잠금 (오케스트레이터 CONSTRAINT 직접 구현)
```ts
function applyOrchestratorDecision(nodeId, report: RedTeamReport): ArtboardStatus {
  // CONSTRAINT: Red Team FAIL이면 REALIZED 불가
  if (!report.is_final_approved) return 'VERIFYING';
  const node = getNode(nodeId);
  const newScore = (node.cumulativeScore ?? 0) + 1;
  const cutoff = node.nodeCutoff ?? 1;
  return newScore >= cutoff ? 'REALIZED' : 'VERIFYING';
}
```

---

## 완료 기준 (Definition of Done)

- [x] Phase 1~5 체크리스트 전 항목 완료
- [ ] TypeScript 타입 에러 0
- [ ] `NODE_CUTOFF_MAP`과 `orchestrator-v2.md`의 Cut-off 테이블 1:1 일치
- [ ] `AGENTS.md`에서 Orchestrator v2.0을 메인 프로토콜로 명시, Red Team v2 산하 위치 확인
- [ ] `window.__cai_orchestrator.inspect(nodeId)` 콘솔 실행 시 상태 정상 출력
- [ ] `applyOrchestratorDecision()` guard — Red Team FAIL 상태에서 REALIZED 전환 차단 확인
