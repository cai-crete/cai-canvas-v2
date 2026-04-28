# Planners 연결 정렬 — CAI-main 참조 기반 이식 작업

> 작성일: 2026-04-27
> 참조 프로젝트: `C:\Users\크리트\Downloads\CAI-main` (정상 동작 확인됨)
> 대상 프로젝트: `cai-canvas-v2-main` (현재 작업물)

---

## Phase 1: RightSidebar 정렬 (최우선)

- [ ] **1-1.** `RightSidebar.tsx` — `parseShortFinal()` 함수를 CAI-main 참조 버전으로 교체
  - 문자열 `shortFinalOutput` → `[카테고리] 내용` bullet 배열 파싱
- [ ] **1-2.** `RightSidebar.tsx` — `extractFirstLine()` 함수를 CAI-main 참조 버전으로 교체
  - 마크다운 헤더/볼드/인용/CITE_REF 제거 후 첫 줄 추출
- [ ] **1-3.** `RightSidebar.tsx` — `PlannerReportPanel`을 CAI-main 참조 버전으로 교체
  - 마지막 질문(Q) 표시
  - shortFinal bullet 4개 카드 UI
  - fallbackLine (shortFinal 없을 때 finalOutput 첫 줄)
  - **OPEN 버튼** → `onGenerate()` 호출
- [ ] **1-4.** `RightSidebar.tsx` — `NodePanel`에서 `type === 'planners'` 분기 수정
  - 현재: 무조건 "API 연동 후 활성화" 고정
  - 변경: `plannerMessages` 유무에 따라 PlannerReportPanel / 기본 안내 분기
  - `plannerMessages` prop 전달 복원
- [ ] **1-5.** Planners 탭 활성화 조건 확인 — `isTabDisabled` 로직에서 thumbnail 선택 시 정상 동작 확인

## Phase 2: NodeCard 썸네일 복원

- [ ] **2-1.** `NodeCard.tsx` — `parseShortFinal()` 헬퍼 함수 이식
- [ ] **2-2.** `NodeCard.tsx` — `PlannersThumbnail` 컴포넌트 이식 (CAI-main에서 복사)
  - 헤더: Planners 아이콘 + 라벨
  - 바디: 마지막 질문(Q) + shortFinal bullet 4개
- [ ] **2-3.** `NodeCard.tsx` — props에 `plannerMessages` 추가 + 렌더링 분기
- [ ] **2-4.** NodeCard 호출부 (`InfiniteCanvas.tsx` 또는 `page.tsx`)에서 `plannerMessages` prop 전달

## Phase 3-1: 아이콘 크기 정렬

- [ ] **3-1.** `PlannersPanel.tsx` — WandSparkles, Loader2, Send 아이콘 `w-4 h-4` → `w-4.5 h-4.5`

## Phase 4: page.tsx Planners 상태 관리 검증

- [ ] **4-1.** `plannerMessagesRef` / `plannerInsightDataRef` 초기화 로직 확인
- [ ] **4-2.** `handleReturnFromExpand`에서 Planners ref 플러시 로직 확인
- [ ] **4-3.** `handleCadastralDataReceived` 콜백 연결 확인
- [ ] **4-4.** ExpandedView에 전달되는 Planners props 4개 확인

---

## 작업 원칙

- Planners 분기만 수정, 다른 노드(viewpoint, elevation, print 등) 코드는 건드리지 않음
- v2 고유 props(`hasSelectedArtboard`, `onShowToast` 등)는 유지
- 참조를 그대로 베끼되, v2 구조와 충돌 시 v2 기준으로 조정

---

COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
