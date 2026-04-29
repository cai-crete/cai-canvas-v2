# 작업지시서: ExpandedView 줌 분리 & 태블릿 Palm 드래그 버그 수정

## 날짜: 2026-04-29

## 버그 1 — ExpandedView 줌 시 배경 이미지와 스케치 분리
- **원인**: `referenceImageUrl` img의 CSS transform이 `transformOrigin: 'center center'` 고정 → 마우스 위치 기준으로 줌하는 스케치 캔버스와 기준점 불일치
- **수정 파일**: `project_canvas/components/SketchCanvas.tsx`
- **수정 내용**: referenceImageUrl img의 transform을 스케치와 동일한 ox/oy 기반 `translate + scale` matrix로 변경 (컨테이너 중앙에 이미지를 고정하되 internalOffset/internalZoom과 연동)

## 버그 2 — Apple Pencil 스케치 중 손바닥 닿을 때 웹 드래그/선택 발생
- **원인**: `penActiveRef.current = true`일 때 touch pointerdown/move에서 `return`만 하고 `e.preventDefault()`를 호출하지 않아 브라우저가 palm touch를 웹 드래그로 처리
- **수정 파일**: `project_canvas/components/SketchCanvas.tsx`, `project_canvas/components/InfiniteCanvas.tsx`, `project_canvas/components/LeftToolbar.tsx`
- **수정 내용**:
  - SketchCanvas: pen 활성 시 touch pointerdown/move에 `e.preventDefault()` 추가
  - InfiniteCanvas: pen pointerType 감지 후 touch 이벤트 preventDefault
  - LeftToolbar: `-webkit-user-select: none`, `onContextMenu={e=>e.preventDefault()}` 추가

## 체크리스트
- [x] Bug 1: SketchCanvas referenceImage transform 수정
- [x] Bug 2: SketchCanvas palm touch preventDefault
- [x] Bug 2: InfiniteCanvas palm touch preventDefault
- [x] Bug 2: LeftToolbar 드래그 방지
