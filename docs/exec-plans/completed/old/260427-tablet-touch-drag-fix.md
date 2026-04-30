# 작업지시서: 태블릿 ExpandedView 스케치 시 웹 드래그 현상 수정

## 증상
iPad Safari에서 ExpandedView(SKETCH TO IMAGE 등) 스케치 시 Apple Pencil 또는 손가락으로 그릴 때 웹 페이지 자체가 드래그/스크롤되는 현상 발생.

## 근본 원인

Safari on iPadOS에서 터치/펜 이벤트가 발생할 때:
1. `<canvas>` 요소에는 `touchAction: 'none'`이 설정되어 있음 ✓  
2. BUT canvas를 감싸는 컨테이너 `<div>`에는 `touchAction: 'none'`이 없음 ✗
3. `SketchToImageExpandedView` 외부 wrapper div에도 없음 ✗
4. 툴바 영역에도 없음 ✗
5. `globals.css`의 `html, body`에 `overflow: hidden`은 있지만 `touch-action: none`이 없음 ✗

Safari의 네이티브 제스처 인식기는 JavaScript 포인터 이벤트보다 먼저 실행됨.
캔버스 밖 영역(툴바, wrapper 경계)에서 터치가 시작되면 `touch-action: none`이 없으므로
브라우저가 스크롤 제스처를 시작하고, 펜이 캔버스로 이동해도 제스처가 계속됨.

## 수정 계획

### 1. `project_canvas/app/globals.css`
- `html, body`에 `touch-action: none` 추가
- iPad Safari의 overscroll/bounce 동작 전역 차단

### 2. `project_canvas/components/SketchCanvas.tsx`
- `containerRef` div에 `touchAction: 'none'` 추가

### 3. `project_canvas/sketch-to-image/ExpandedView.tsx`
- 외부 wrapper div에 `touchAction: 'none'` 추가

### 4. `project_canvas/sketch-to-plan/ExpandedView.tsx`
- 외부 wrapper div에 `touchAction: 'none'` 추가

## 체크리스트

- [x] globals.css 수정
- [x] SketchCanvas.tsx 수정
- [x] sketch-to-image/ExpandedView.tsx 수정
- [x] sketch-to-plan/ExpandedView.tsx 수정
