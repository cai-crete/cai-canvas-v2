# 작업지시서: ExpandedView 이미지 업로드 꽉채움 + Grid z-index 조정

**날짜:** 2026-04-28  
**대상 파일:**
- `project_canvas/components/SketchCanvas.tsx`
- `project_canvas/sketch-to-image/ExpandedView.tsx`
- `project_canvas/sketch-to-plan/ExpandedView.tsx`

---

## Task 1: 업로드 이미지 꽉채움 (fitOnUpload)

### 배경
- `loadImage(base64, false, fitCanvas=true)` 경로: `coverScale = Math.max(...)` → 뷰 전체 꽉 참
- `handleUpload` 경로(+버튼): `imgScale = Math.min(...) * 0.8` → 80% 크기로 배치
- 목표: +버튼 업로드 시에도 cover scale 적용

### 변경 내용

#### SketchCanvas.tsx
- `Props` 인터페이스에 `fitOnUpload?: boolean` 추가
- `handleUpload` 함수 내에서 `reader.onload` 실행 전
  `fitCanvasNextLoadRef.current = fitOnUpload ?? false` 설정

#### sketch-to-image/ExpandedView.tsx
- `<SketchCanvas ... fitOnUpload />` prop 추가

#### sketch-to-plan/ExpandedView.tsx
- `<SketchCanvas ... fitOnUpload />` prop 추가

---

## Task 2: z-index 순서 변경 (image < grid < sketch)

### 배경
현재: `grid(z=1) < image(z=2) < sketch(z=3)`  
목표: `image(z=1) < grid(z=2) < sketch(z=3)`

### 변경 내용

#### SketchCanvas.tsx
- 업로드 이미지 DOM 레이어: `zIndex: 2` → `zIndex: 1`
- InfiniteGrid 래퍼: `zIndex: 1` → `zIndex: 2`

---

## 체크리스트

- [ ] SketchCanvas.tsx: `fitOnUpload` prop 추가
- [ ] SketchCanvas.tsx: `handleUpload`에 `fitCanvasNextLoadRef.current` 설정
- [ ] SketchCanvas.tsx: image z=1, grid z=2 swap
- [ ] sketch-to-image ExpandedView: `fitOnUpload` prop 전달
- [ ] sketch-to-plan ExpandedView: `fitOnUpload` prop 전달
