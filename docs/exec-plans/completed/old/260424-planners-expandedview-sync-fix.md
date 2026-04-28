# 작업지시서: PLANNERS ExpandedView → Thumbnail/RightSidebar 연동 수정

**작성일:** 2026-04-24  
**작업자:** AGENT C  
**우선순위:** HIGH

---

## 문제 요약

PLANNERS ExpandedView에서 대화 수행 후 닫을 때:
1. 캔버스 카드 썸네일에 내용이 반영되지 않음
2. 우측 사이드바 PLANNERS 패널에 메시지가 표시되지 않음

## 근본 원인

`page.tsx`에 planners 상태 관리 코드가 미구현 상태임.
이전 세션에서 ExpandedView.tsx / RightSidebar.tsx 인터페이스는 추가했으나,
page.tsx에서 실제 연결(props 전달 + 상태 관리)이 빠짐.

## 수정 대상

**파일 1개:** `project_canvas/app/page.tsx`

## 체크리스트

- [ ] 1. `PlannerMessage, SavedInsightData` import 추가
- [ ] 2. `plannerMessagesRef`, `plannerInsightDataRef` ref 선언
- [ ] 3. `expandedNodeId` 변경 시 ref 초기화 `useEffect` 추가
- [ ] 4. `handleCadastralDataReceived` 함수 구현
- [ ] 5. `handleReturnFromExpand`에 planners flush 로직 추가
- [ ] 6. `<ExpandedView>`에 4개 prop 연결
- [ ] 7. `<RightSidebar>`에 `plannerMessages` prop 연결
- [ ] 8. 빌드 확인 (npm run build)
