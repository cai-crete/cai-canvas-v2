# 캔버스 5개 버그 수정 작업지시서

## 개요
ExpandedView, SketchCanvas, NodeCard 관련 5개 버그 수정

---

## 이슈 목록

### Issue 1 — 흰 배경 제거는 Plan ExpandedView 업로드에서만
원인: SketchCanvas `handleUpload`가 항상 `removeWhiteBackground` 적용
- [ ] `SketchCanvas.tsx` Props에 `removeWhiteOnUpload?: boolean` 추가
- [ ] `handleUpload`에서 `removeWhiteOnUpload` 값에 따라 조건부 적용
- [ ] `sketch-to-plan/ExpandedView.tsx` SketchCanvas에 `removeWhiteOnUpload={true}` 전달

### Issue 2 — GENERATE 없이 닫을 때 스케치 스트로크 보존
원인: Image ExpandedView가 `generatedImageData`를 `sketchData`보다 우선 로드 / 새 노드에 `sketchData` 세팅
- [ ] `sketch-to-image/ExpandedView.tsx` 로드 순서: `sketchData ?? generatedImageData ?? thumbnailData`
- [ ] `sketch-to-image/ExpandedView.tsx` sketchData 로드 시 `removeBackground=true` (Issue 4 겸용)
- [ ] `sketch-to-plan/ExpandedView.tsx` 로드 순서: `sketchData ?? generatedImageData` (둘 다 removeBackground=true)
- [ ] `page.tsx handleGenerateComplete` 새 이미지 노드에서 `sketchData` 필드 제거
- [ ] `page.tsx handleGeneratePlanComplete` 새 플랜 노드에서 `sketchData` 필드 제거

### Issue 3 — 태블릿 핀치 줌 시 이미지 찌그러짐
원인: 핀치 줌 핸들러가 zoom만 변경하고 pinch 중심점 기준 offset 보정을 하지 않음
- [ ] `SketchCanvas.tsx` 핀치 줌 핸들러에 pinch midpoint 기반 offset 보정 추가

### Issue 4 — ExpandedView 진입 시 흰색 배경 나타나는 현상
원인: `exportAsBase64()`가 `fillRect(white)`로 흰 배경을 bake-in하여 `loadImage(sketchData)` 시 흰 배경 표시
- Issue 2의 `removeBackground=true` 로드로 함께 처리됨

### Issue 5 — Generate 후 원본 노드 썸네일에 이미지가 가득 차지 않는 현상
원인: `handleGenerateComplete/PlanComplete`에서 원본 노드 `thumbnailData`를 zoom=1 캔버스 스냅샷(흰 배경, 스케치 작게)으로 업데이트
- [ ] `page.tsx handleGenerateComplete` 원본 노드: `thumbnailData = generatedBase64`, `generatedImageData = generatedBase64` 추가
- [ ] `page.tsx handleGeneratePlanComplete` 원본 노드: `thumbnailData = generatedPlanBase64`, `generatedImageData = generatedPlanBase64` 추가

---

## 수정 파일
- `project_canvas/components/SketchCanvas.tsx`
- `project_canvas/sketch-to-image/ExpandedView.tsx`
- `project_canvas/sketch-to-plan/ExpandedView.tsx`
- `project_canvas/app/page.tsx`
