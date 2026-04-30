# 작업지시서: 펜슬 + 손바닥 동시 접촉 시 페이지 드래그 현상 수정

## 증상
iPad Safari에서 Apple Pencil로 스케치 중 손바닥이 화면에 동시에 닿을 때 캔버스 뷰포트 또는 웹 페이지 자체가 드래그되는 현상.

## 근본 원인 (4가지 복합)

### 원인 1 [Primary] — SketchCanvas.tsx: 타이밍 경쟁 조건
손바닥(touch)이 펜슬보다 먼저 닿으면:
1. `handlePointerDown(touch)` → `isPanning.current = true`
2. `handlePointerDown(pen)` → `penActiveRef.current = true` — 하지만 `isPanning`은 여전히 `true`
3. `handlePointerMove(pen)` → `isPanning.current` 체크가 touch 필터(line 488)보다 먼저 실행됨
   → 펜슬 이동이 `onInternalOffsetChange` 호출, 캔버스 뷰포트를 패닝

### 원인 2 — SketchCanvas.tsx: onPointerCancel 미구현
iOS가 palm rejection을 위해 touch 포인터를 취소(`pointercancel`)해도 `pointerPositions` map에 잔류 엔트리가 남아 이후 멀티터치 로직 오동작.

### 원인 3 — InfiniteCanvas.tsx: onPointerCancel 버그
```jsx
onPointerCancel={handleWrapperPointerDown}  // 취소 이벤트에서 패닝 재시작 버그
```

### 원인 4 — globals.css: overscroll-behavior 누락
`touch-action: none`은 있으나 `overscroll-behavior: none`이 없어 bounce/overscroll 잔여 가능성.

## 수정 계획

### 1. `project_canvas/components/SketchCanvas.tsx`
- `handlePointerDown`: pen pointerType 감지 시 `isPanning.current = false`, `pointerPositions.current.clear()`, `lastPinchDist.current = 0` 추가
- `handlePointerMove`: `isPanning.current` 블록 앞에 `penActiveRef.current` guard 추가
- canvas 엘리먼트에 `onPointerCancel={handlePointerCancel}` 추가
- `handlePointerCancel` 구현: touch/pen별 상태 정리

### 2. `project_canvas/components/InfiniteCanvas.tsx`
- `onPointerCancel={handleWrapperPointerDown}` 제거 또는 올바른 핸들러로 교체

### 3. `project_canvas/app/globals.css`
- `html, body`에 `overscroll-behavior: none` 추가

## 체크리스트

- [x] SketchCanvas.tsx: pen down 시 panning 상태 즉시 초기화
- [x] SketchCanvas.tsx: handlePointerMove pen guard 추가
- [x] SketchCanvas.tsx: onPointerCancel 핸들러 추가
- [x] InfiniteCanvas.tsx: onPointerCancel 버그 수정
- [x] globals.css: overscroll-behavior: none 추가
