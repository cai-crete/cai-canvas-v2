# 작업지시서: ExpandedView 3가지 수정

**날짜**: 2026-04-28  
**담당**: Claude

---

## 문제 정의

### Issue 1 — 스케치 획 수정 불가 (stroke 개별 편집 불가)
ExpandedView에서 스케치 후 복귀 시 `exportAsBase64()`로 획을 flat PNG로 저장,
재진입 시 `loadImage(sketchData)`로 `uploadedImageData`에 로드 → 개별 획 정보 소실.
지우개/undo가 기존 획에 작동하지 않음.

### Issue 2 — Plan 생성 시 원본 이미지 소실
캔버스 업로드 이미지 or Plan ExpandedView 업로드 이미지 위에 평면도 스케치 후 Generate 시
원본 이미지가 결과 노드에서 사라짐.
**기대**: 원본 이미지(배경) + 생성 평면도 흰색 제거 후 선만 합성한 결과 이미지 저장.

### Issue 3 — ExpandedSidebar 복귀 버튼 아이콘
현재 ← 화살표. NodeCard Expand 아이콘의 반대인 축소(Minimize) 아이콘으로 교체 필요.

---

## 해결 방안

### Issue 1 — 스트로크 직렬화/복원
- `SketchCanvas`에 `exportPathsJSON()` / `loadPathsJSON()` 추가
- 복귀 시 paths JSON을 `strokeData`로 저장, 재진입 시 paths 복원
- `CanvasNode`에 `strokeData?: string` 필드 추가

### Issue 2 — 이미지 + 플랜 합성
- sketch-to-plan ExpandedView에서 업로드/참조 이미지를 `planBaseImage` state로 분리 관리
- 캔버스 업로드 이미지 / node.thumbnailData → refImage로만 표시 (canvas에 로드 X)
- Generate 완료 후 page.tsx에서 클라이언트 합성:
  - planBaseImage → 배경 (불투명)
  - generatedPlanBase64 → 흰색 픽셀 제거 → 오버레이
  - 합성 결과를 결과 노드에 저장

### Issue 3 — 아이콘 교체
- `ExpandedSidebar.tsx` `IconCollapse` → 4방향 화살표가 중심으로 향하는 Minimize 아이콘

---

## 변경 파일

1. **`project_canvas/components/SketchCanvas.tsx`**
   - `SketchCanvasHandle` 인터페이스에 `exportPathsJSON`, `loadPathsJSON` 추가
   - `useImperativeHandle`에 구현 추가

2. **`project_canvas/types/canvas.ts`**
   - `CanvasNode`에 `strokeData?: string` 필드 추가

3. **`project_canvas/sketch-to-image/ExpandedView.tsx`**
   - `handleSketchCollapse`: `exportPathsJSON()` 호출, 4번째 인자로 전달
   - `onCollapseWithSketch` prop 타입 업데이트
   - `useEffect`: `node.strokeData` 있으면 `loadPathsJSON` 사용

4. **`project_canvas/sketch-to-plan/ExpandedView.tsx`**
   - Issue 1과 동일한 strokeData 처리
   - `planBaseImage` state 추가
   - 업로드/thumbnailData → refImage + planBaseImage 처리 (canvas에 직접 로드 X)
   - `onGeneratePlanComplete` 호출 시 `planBaseImage` 포함

5. **`project_canvas/app/page.tsx`**
   - `handleCollapseWithSketch`: strokeData 4번째 인자 수신 → node.strokeData 저장
   - `handleCollapseWithPlanSketch`: 동일
   - `handleGeneratePlanComplete`: planBaseImage 수신 → 합성 함수 실행
   - `compositeImages()` 유틸 함수 추가

6. **`project_canvas/components/ExpandedSidebar.tsx`**
   - `IconCollapse` SVG → Minimize 아이콘으로 교체

7. **`project_canvas/components/ExpandedView.tsx`**
   - `onCollapseWithSketch` prop 타입 업데이트 (strokeData 포함)

---

## 체크리스트

- [x] SketchCanvas: exportPathsJSON / loadPathsJSON 구현
- [x] canvas.ts: CanvasNode에 strokeData 필드 추가
- [x] sketch-to-image ExpandedView: strokeData 저장/복원
- [x] sketch-to-plan ExpandedView: strokeData + planBaseImage 처리
- [x] page.tsx: handlers 업데이트 + compositeImages 구현
- [x] ExpandedSidebar: IconCollapse → Minimize 아이콘
- [x] ExpandedView (router): onCollapseWithSketch 타입 업데이트
- [ ] 브라우저 검증: 스케치 복귀 후 지우개/undo 동작 확인
- [ ] 브라우저 검증: 이미지 위 플랜 생성 시 합성 결과 확인
- [ ] 브라우저 검증: ExpandedSidebar 축소 아이콘 표시 확인
