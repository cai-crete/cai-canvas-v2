# 작업지시서: Zoom 동기화 & 스케치 영속성 수정

- **작성일**: 2026-04-29
- **대상**: SketchCanvas.tsx, InfiniteGrid.tsx, types/canvas.ts, sketch-to-image/ExpandedView.tsx, sketch-to-plan/ExpandedView.tsx, app/page.tsx

---

## Bug A: Zoom >150% 에서 grid/image/sketch 비율 불일치

**원인**: reference image가 explicit pixel 좌표로 따로 계산됨 / InfiniteGrid의 Math.round 오차  
**해결**:
1. reference image → CSS transform wrapper 방식으로 교체 (canvas drawing과 동일한 ox/oy/zs 기반 transform)
2. InfiniteGrid에서 Math.round 제거 (sub-pixel 정밀도 확보)

### 체크리스트
- [ ] SketchCanvas.tsx: reference image를 CSS transform wrapper 방식으로 교체
  - wrapper: `position: absolute, left:0, top:0, transformOrigin:'0 0', transform: translate(${ox}px,${oy}px) scale(${zs})`
  - image 내부: `position: absolute, left: -cw/2, top: -ch/2, width: cw, height: ch`
- [ ] InfiniteGrid.tsx: `Math.round` 제거 (bpx, bpy, minor 모두)
- [ ] TypeScript 오류 없음 확인

---

## Bug B: minimize → re-expand 시 스케치가 이미지로 저장되어 편집 불가

**원인**: collapse 시 `exportAsBase64()`(flat PNG)로 저장, re-expand 시 `loadImage()`로 불러와 벡터 아닌 raster됨  
**해결**: SketchCanvasHandle에 `exportState/loadState` 추가, CanvasNode에 `sketchPaths` 필드 추가

### 체크리스트
- [ ] SketchCanvas.tsx: `SketchState` 타입 export 추가
- [ ] SketchCanvas.tsx: `SketchCanvasHandle`에 `exportState(): SketchState`, `loadState(s: SketchState): void` 추가
- [ ] SketchCanvas.tsx: `exportState`, `loadState` 구현 (useImperativeHandle에 추가)
- [ ] types/canvas.ts: `CanvasNode`에 `sketchPaths?: SketchState` 필드 추가
- [ ] sketch-to-image/ExpandedView.tsx: expand 시 `sketchPaths` 있으면 `loadState()` 우선 사용, collapse 시 `exportState()` 저장
- [ ] sketch-to-plan/ExpandedView.tsx: 동일 처리
- [ ] app/page.tsx: `handleCollapseWithSketch`, `handleCollapseWithPlanSketch`에 `sketchPaths` 저장
- [ ] TypeScript 오류 없음 확인
