# GENERATE 없이 복귀 시 빈 캔버스 썸네일 생성 로직 제거

> **이번 수행 내용:** 비GENERATE 복귀 시 캔버스에 내용이 없을 때만 `exportThumbnail()` 호출을 건너뛰어 빈 썸네일 저장을 차단.

## 배경
각 노드에서 GENERATE 없이 `[<-]` 버튼 또는 ESC로 캔버스로 복귀할 때,
스케치 내용이 없는 빈 캔버스에서도 `exportThumbnail()`이 호출되어 빈 썸네일이 저장되고 있음.

## 빈 캔버스 판별 방법
`SketchCanvas.exportState()`가 반환하는 `SketchState`의 세 필드로 판별:
```typescript
const hasContent = !!(
  sketchPaths?.paths.length ||
  sketchPaths?.uploadedImageData ||
  sketchPaths?.textItems?.length
);
```

## 수정 대상 파일 및 변경 내용

### 1. `project_canvas/sketch-to-image/ExpandedView.tsx`
- **위치:** `handleSketchCollapse` (line ~181)
- **변경:** `hasContent`가 true일 때만 `exportThumbnail()` 호출

```typescript
// Before
const handleSketchCollapse = useCallback(() => {
  const sketchBase64    = sketchCanvasRef.current?.exportAsBase64()  ?? '';
  const thumbnailBase64 = sketchCanvasRef.current?.exportThumbnail() ?? '';
  const sketchPaths     = sketchCanvasRef.current?.exportState();
  onCollapseWithSketch?.(sketchBase64, thumbnailBase64, collectPanelSettings(), sketchPaths);
  onCollapse();
}, [...]);

// After
const handleSketchCollapse = useCallback(() => {
  const sketchBase64 = sketchCanvasRef.current?.exportAsBase64() ?? '';
  const sketchPaths  = sketchCanvasRef.current?.exportState();
  const hasContent   = !!(sketchPaths?.paths.length || sketchPaths?.uploadedImageData || sketchPaths?.textItems?.length);
  const thumbnailBase64 = hasContent ? (sketchCanvasRef.current?.exportThumbnail() ?? '') : '';
  onCollapseWithSketch?.(sketchBase64, thumbnailBase64, collectPanelSettings(), sketchPaths);
  onCollapse();
}, [...]);
```

### 2. `project_canvas/sketch-to-plan/ExpandedView.tsx`
- **위치:** `handlePlanCollapse` (line ~212)
- **변경:** 동일 패턴

```typescript
// Before
const handlePlanCollapse = useCallback(() => {
  const sketchBase64    = sketchCanvasRef.current?.exportAsBase64()  ?? '';
  const thumbnailBase64 = sketchCanvasRef.current?.exportThumbnail() ?? '';
  const sketchPaths     = sketchCanvasRef.current?.exportState();
  onCollapseWithPlanSketch?.(sketchBase64, thumbnailBase64, collectPlanSettings(), sketchPaths);
  onCollapse();
}, [...]);

// After
const handlePlanCollapse = useCallback(() => {
  const sketchBase64 = sketchCanvasRef.current?.exportAsBase64() ?? '';
  const sketchPaths  = sketchCanvasRef.current?.exportState();
  const hasContent   = !!(sketchPaths?.paths.length || sketchPaths?.uploadedImageData || sketchPaths?.textItems?.length);
  const thumbnailBase64 = hasContent ? (sketchCanvasRef.current?.exportThumbnail() ?? '') : '';
  onCollapseWithPlanSketch?.(sketchBase64, thumbnailBase64, collectPlanSettings(), sketchPaths);
  onCollapse();
}, [...]);
```

### 3. `project_canvas/app/page.tsx` — `handleCollapseWithSketch` / `handleCollapseWithPlanSketch`
- **위치:** line ~501, ~522
- **변경:** `thumbnailBase64`가 truthy일 때만 `hasThumbnail`/`thumbnailData` 저장
  (빈 캔버스에서 `sketchBase64`가 truthy여도 `hasThumbnail: true`가 저장되는 것을 차단)

```typescript
// Before (두 함수 공통)
if (sketchBase64) {
  updates.hasThumbnail  = true;
  updates.thumbnailData = thumbnailBase64;
  updates.sketchData    = sketchBase64;
  ...
}

// After
if (sketchBase64) {
  if (thumbnailBase64) {
    updates.hasThumbnail  = true;
    updates.thumbnailData = thumbnailBase64;
  }
  updates.sketchData  = sketchBase64;
  updates.sketchPaths = sketchPaths;
  ...
}
```

### 4. `project_canvas/app/page.tsx` — `handleReturnFromExpand`
- **위치:** line ~465 (Planners, Elevation, Print, Change Viewpoint 공통 복귀 처리)
- **원인:** `hasThumbnail: true`를 무조건 설정 → NodeCard에서 `thumbnailData`가 없으면 gray gradient 빈 카드 표시
- **변경:** 노드에 `thumbnailData`가 있을 때만 `hasThumbnail: true` 설정

```typescript
// Before
const updates: Partial<CanvasNode> = { hasThumbnail: true, artboardType: targetArtboardType };

// After
const updates: Partial<CanvasNode> = { artboardType: targetArtboardType };
if (n.thumbnailData) updates.hasThumbnail = true;
```

## 영향 범위

| 경로 | 변경 전 | 변경 후 |
|------|---------|---------|
| sketch-to-image / sketch-to-plan — 빈 캔버스 비GENERATE 복귀 | 빈 썸네일 생성·저장 | 썸네일 미생성 |
| Elevation / Planners / Print / Viewpoint — 비GENERATE 복귀 | gray gradient 빈 카드 표시 | "썸네일 없음" 플레이스홀더 표시 |

## 체크리스트
- [x] `sketch-to-image/ExpandedView.tsx` - `handleSketchCollapse` 수정
- [x] `sketch-to-plan/ExpandedView.tsx` - `handlePlanCollapse` 수정
- [x] `app/page.tsx` - `handleCollapseWithSketch` 수정
- [x] `app/page.tsx` - `handleCollapseWithPlanSketch` 수정
- [x] `app/page.tsx` - `handleReturnFromExpand` 수정
- [ ] 동작 확인: sketch-to-image/plan 빈 캔버스 비GENERATE 복귀 시 썸네일 미생성
- [ ] 동작 확인: Elevation / Planners / Print / Viewpoint 비GENERATE 복귀 시 빈 카드 미생성
