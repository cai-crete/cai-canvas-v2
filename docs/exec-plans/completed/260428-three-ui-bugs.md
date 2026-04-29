# 작업지시서: ExpandedView 3가지 버그 수정

**날짜**: 2026-04-28  
**담당**: Claude

---

## 문제 정의

### Issue 1 — ExpandedView 생성 이미지 Z-index / 불투명 문제 (스크린샷 1, 4)
Plan/Image ExpandedView에서 생성된 이미지가 `referenceImageUrl`로 표시될 때 `opacity: 0.35`로 매우 희미하게 보임.  
원하는 레이어 순서: grid background < image < grid line < sketch  
현재 레이어는 이미 올바른 순서(z=0 이미지 → z=2 grid → z=3 sketch)이나 opacity가 너무 낮음.

**Fix**: `SketchCanvas.tsx`에서 `referenceImageUrl` 오버레이 opacity를 `0.35 → 1.0`으로 변경.

---

### Issue 2 — 썸네일 크롭 (스크린샷 2)
NodeCard 썸네일에서 `objectFit: 'cover'`로 인해 이미지가 카드에 맞게 크롭됨.  
썸네일에서는 항상 이미지 전체가 보여야 함.

**Fix**: `NodeCard.tsx`에서 `objectFit: 'cover'` → `objectFit: 'contain'` (2개소).

---

### Issue 3 — Generate 시 원본 노드 이미지 교체 (스크린샷 3) [치명적]
Generate 완료 후 원본 노드의 `thumbnailData`와 `generatedImageData`가 새로 생성된 이미지로 덮어씌워짐.  
원본은 변경하지 않은 채로, 생성된 이미지를 담은 새 자식 노드만 생성되어야 함.

**Root cause**:
1. `handleCollapseWithSketch`: image artboard 노드에서도 `thumbnailData = thumbnailBase64`로 업데이트 → 원본 이미지 손실
2. `handleGenerateComplete`: `updatedOrigin.thumbnailData = generatedBase64`로 재덮어쓰기
3. 동일 문제가 `handleCollapseWithPlanSketch` + `handleGeneratePlanComplete`에도 존재

**Fix**:
- `handleCollapseWithSketch`: `artboardType === 'image'` 노드는 thumbnailData/sketchData 업데이트 스킵
- `handleCollapseWithPlanSketch`: 동일
- `handleGenerateComplete`: `updatedOrigin` 제거 → 원본 노드 변경 없이 새 자식 노드만 추가
- `handleGeneratePlanComplete`: 동일

---

## 변경 파일

1. **`project_canvas/components/SketchCanvas.tsx`** — opacity 0.35 → 1.0
2. **`project_canvas/components/NodeCard.tsx`** — objectFit cover → contain (2개소)
3. **`project_canvas/app/page.tsx`** — handleCollapseWithSketch, handleCollapseWithPlanSketch, handleGenerateComplete, handleGeneratePlanComplete 수정

---

## 체크리스트

- [x] SketchCanvas.tsx: referenceImageUrl opacity 1.0
- [x] NodeCard.tsx: objectFit contain (artboardType=image 케이스)
- [x] NodeCard.tsx: objectFit contain (hasThumbnail 케이스)
- [x] page.tsx: handleCollapseWithSketch — artboardType=image 노드 스킵
- [x] page.tsx: handleCollapseWithPlanSketch — artboardType=image 노드 스킵
- [x] page.tsx: handleGenerateComplete — 원본 노드 업데이트 제거
- [x] page.tsx: handleGeneratePlanComplete — 원본 노드 업데이트 제거
