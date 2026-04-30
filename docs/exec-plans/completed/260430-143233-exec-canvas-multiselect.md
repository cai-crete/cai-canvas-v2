# 작업지시서: 캔버스 다중 선택 로직 추가

**생성일시:** 260430-143233  
**담당 에이전트:** AGENT C (프론트엔드)

---

## 목표

1. 노드 선택된 상태에서 다른 노드 클릭 → 다중 선택에 추가
2. 이미 선택된 노드 클릭 → 선택 취소 (토글)
3. 배경 클릭 → 전체 선택 해제 (기존 동작 유지)
4. 러버밴드 선택 → 기존 동작 유지 (이미 다중 선택)

---

## 분석 결과

### 이중 호출 버그 (수정 필수)
`handleNodeCardSelect`가 매 클릭마다 2번 호출됨:
1. `NodeCard.handleArtboardPointerUp` → `onSelect(id)` (React 합성 이벤트)
2. `InfiniteCanvas.onUp (window pointerup)` → `onNodeSelect(pendingNodeId.current)` (네이티브 이벤트)

현재는 `setSelectedNodeIds([id])` 멱등이라 무해하지만, 토글 로직 시 1번 추가→2번 취소 = 무효화됨.

---

## 체크리스트

- [ ] **[InfiniteCanvas.tsx:247]** `onNodeSelect(pendingNodeId.current)` 제거 — NodeCard onPointerUp에 위임
- [ ] **[page.tsx:1089-1099]** `handleNodeCardSelect` 3-way 분기 로직 구현
  - 이미 선택된 노드 → filter 제거 + 사이드바 닫기
  - 다른 노드 선택 중 → 배열에 추가 + 사이드바 닫기
  - 첫 선택 → 단일 선택 + thumbnail이면 사이드바 열기
- [ ] `selectedNodeIds`를 `useCallback` deps에 추가
- [ ] 동작 검증

---

## 확정 동작 명세

| 상황 | 결과 | 사이드바 |
|------|------|---------|
| 아무것도 없을 때 노드 클릭 | 단일 선택 | thumbnail → 열기 |
| 선택 중 다른 노드 클릭 | 다중 선택에 추가 | 닫기 |
| 선택된 노드 재클릭 | 해당 노드 제거 | 닫기 |
| 1개→0개로 토글 제거 | 전체 해제 | 닫기 |
| 배경 클릭 | 전체 해제 | 닫기 (기존 유지) |
| 러버밴드 | 다중 선택 | 닫기 (기존 유지) |
