# 작업지시서: ExpandedView 생성 이미지 높이 맞춤 + 원본 교체 버그 수정

**날짜**: 2026-04-28  
**담당**: Claude

---

## 문제 정의

### Issue 1 — 생성된 이미지 높이 맞춤 미적용
ExpandedView에서 `node.generatedImageData`가 있을 때 `loadImage(generatedImageData)` 호출 시
`fitCanvas=false`(기본값)로 80% contain 스케일이 적용되어 높이가 캔버스에 꽉 차지 않음.

### Issue 2 — 원본이 생성 이미지로 교체되는 현상
`sketchData`가 없고 `generatedImageData`만 있는 노드(생성된 이미지 자식 노드 등)를 ExpandedView로 열 때:
1. `loadImage(generatedImageData)` → 캔버스에 생성 이미지 로드
2. Generate 클릭 → `exportAsBase64()` → 생성 이미지가 포함된 캔버스 → `sketchBase64`
3. `handleCollapseWithSketch(sketchBase64, ...)` → `node.sketchData` = 생성 이미지
4. 다음 ExpandedView 진입 시: `sketchData` = 이전 생성 이미지 → AI가 자신의 출력물로 재생성

---

## 해결 방안

### 핵심 아이디어
`generatedImageData`를 캔버스 내부(uploadedImageData)에 로드하지 않고,
**SketchCanvas의 `referenceImageUrl` prop**으로 전달하여 시각적 참조 레이어만으로 표시.

- z=0 오버레이 (exportAsBase64에 포함되지 않음) → **Issue 2 해결**
- CSS `height: 100%`, `width: auto` → 높이 기준 맞춤 → **Issue 1 해결**
- `pointerEvents: none` → 드로잉 방해 없음

---

## 변경 파일

1. **`project_canvas/components/SketchCanvas.tsx`**
   - Props에 `referenceImageUrl?: string` 추가
   - 컨테이너 내 z=0 `<img>` 오버레이 렌더링 (opacity: 0.35, height: 100%)

2. **`project_canvas/sketch-to-image/ExpandedView.tsx`**
   - `refImage` state 추가
   - load effect: `generatedImageData` → `setRefImage()` (loadImage 대신)
   - `thumbnailData`: 이미 `fitCanvas=true` 적용 중, 유지
   - SketchCanvas에 `referenceImageUrl={refImage ?? undefined}` 전달

3. **`project_canvas/sketch-to-plan/ExpandedView.tsx`**
   - 동일 변경 + `thumbnailData` loadImage에 `fitCanvas=true` 추가 (누락)

---

## 체크리스트

- [ ] SketchCanvas referenceImageUrl prop 추가 및 렌더링
- [ ] sketch-to-image ExpandedView load effect 수정
- [ ] sketch-to-plan ExpandedView load effect 수정 + thumbnailData fitCanvas
- [ ] 브라우저 검증: 생성 이미지 높이 맞춤 확인
- [ ] 브라우저 검증: Generate 후 sketchData가 생성 이미지로 오염되지 않는지 확인
