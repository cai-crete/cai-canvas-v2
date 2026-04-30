# 작업지시서: 스케치 썸네일 반영 & ExpandedView 원본 크기 로드

## Issue A — 스케치 내용이 썸네일 노드에 반영

**문제**: ExpandedView에서 스케치 후 닫을 때, `generatedImageData`가 있으면 AI 이미지가 썸네일로 유지되어 스케치 내용이 반영되지 않음.

**수정**: `page.tsx` `handleCollapseWithSketch` / `handleCollapseWithPlanSketch`에서
- Before: `thumbnailData = n.generatedImageData ?? thumbnailBase64`
- After: `thumbnailData = thumbnailBase64` (항상 스케치 썸네일 사용)

## Issue B — ExpandedView 진입 시 이미지가 작아지는 현상

**문제**: `thumbnailData` / `sketchData`를 `loadImage`로 불러올 때 업로드 이미지 처리 로직(80% 축소)이 그대로 적용되어, 캔버스 크기와 동일한 이미지가 80%로 표시됨.

**수정**: `SketchCanvas.tsx`에 `fitCanvas?: boolean` 파라미터 추가
- `fitCanvas=true`이면 이미지 자연 크기(1:1)로 캔버스를 채우는 transform 적용
- `loadImage(sketchData, true, true)` — sketchData 로드 시
- `loadImage(thumbnailData, false, true)` — thumbnailData fallback 로드 시

## 체크리스트

- [x] `SketchCanvas.tsx`: `SketchCanvasHandle.loadImage` 타입에 `fitCanvas?: boolean` 추가
- [x] `SketchCanvas.tsx`: `fitCanvasNextLoadRef` ref 추가
- [x] `SketchCanvas.tsx`: `uploadedImageData` effect에서 fitCanvas 분기 처리
- [x] `SketchCanvas.tsx`: `loadImage` 구현에 `fitCanvas` 처리 추가
- [x] `sketch-to-image/ExpandedView.tsx`: sketchData, thumbnailData 로드에 `fitCanvas=true` 전달
- [x] `sketch-to-plan/ExpandedView.tsx`: sketchData 로드에 `fitCanvas=true` 전달
- [x] `page.tsx` `handleCollapseWithSketch`: `thumbnailBase64` 직접 사용
- [x] `page.tsx` `handleCollapseWithPlanSketch`: `thumbnailBase64` 직접 사용

## 수정 파일
- `project_canvas/components/SketchCanvas.tsx`
- `project_canvas/sketch-to-image/ExpandedView.tsx`
- `project_canvas/sketch-to-plan/ExpandedView.tsx`
- `project_canvas/app/page.tsx`
