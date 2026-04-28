# 작업지시서: 3가지 UI 수정 v2

## 작업 개요
이전 세션에서 발생한 회귀 포함, 3가지 UI 버그 수정

---

## Issue 1: 썸네일 objectFit cover 복구
**파일**: `project_canvas/components/NodeCard.tsx`
**문제**: 이전 세션에서 contain으로 변경한 것을 cover로 복구
**수정 위치**: 
- line 271 (image 아트보드 케이스): `objectFit: 'contain'` → `'cover'`
- line 282 (hasThumbnail 케이스): `objectFit: 'contain'` → `'cover'`
**ExpandedView**: SketchCanvas reference image는 이미 `height: '100%', width: 'auto'` (높이 맞추기) 유지 — 별도 수정 없음

**체크리스트**:
- [ ] NodeCard.tsx line 271 cover 복구
- [ ] NodeCard.tsx line 282 cover 복구

---

## Issue 2: ExpandedView 줌 시 reference image 함께 확대
**파일**: `project_canvas/components/SketchCanvas.tsx`
**문제**: referenceImageUrl 오버레이가 internalZoom/internalOffset과 연동 안 됨 → 스케치 캔버스 줌 시 배경 이미지 고정
**수정**: img element에 캔버스와 동일한 좌표 변환 적용
- 캔버스 수식: `zs = internalZoom/100`, origin = center, translate = internalOffset
- CSS: `transform: translate(${internalOffset.x}px, ${internalOffset.y}px) scale(${internalZoom/100})`
- `transformOrigin: 'center center'`

**체크리스트**:
- [ ] SketchCanvas.tsx reference image img에 transform 추가

---

## Issue 3: 모든 노드 선택 시 PLANNERS 버튼 활성화
**원인**: `ARTBOARD_COMPATIBLE_NODES`에서 sketch/image 아트보드에 planners 미포함 → isTabDisabled = true

**파일 1**: `project_canvas/components/RightSidebar.tsx`
- `isTabDisabled` 함수에 예외: `if (type === 'planners') return false;`

**파일 2**: `project_canvas/app/page.tsx`
- `handleNodeTabSelect`의 selectedNode 분기에서 planners 처리 추가
- 선택 노드가 planners 타입이면 expand, 그 외에는 `createAndExpandNode('planners')`

**체크리스트**:
- [ ] RightSidebar.tsx isTabDisabled planners 예외처리
- [ ] page.tsx handleNodeTabSelect planners 분기 추가
