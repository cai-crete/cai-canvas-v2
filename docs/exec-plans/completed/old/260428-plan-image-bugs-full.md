# 작업지시서: Plan/Image ExpandedView 버그 4종 수정

**날짜**: 2026-04-28  
**담당**: Claude

---

## 문제 정의

### I1 — Image artboard 썸네일 미저장
Image ExpandedView minimize 시 스케치 획이 노드 카드에서 사라짐.  
**원인**: `page.tsx` collapse 핸들러에서 `artboardType !== 'image'` 조건이 thumbnailData 저장을 막음.  
**수정**: image artboard도 composite thumbnail(원본+스케치)을 저장.

### I2 — 재진입 시 원본 이미지 비율 변경
Image artboard 재진입 시 이미지 비율이 바뀌고 스케치 정렬이 틀어짐.  
**원인**: `loadPathsJSON` → `setUploadedImageData` → useEffect → transform 재계산 → 저장된 transform 덮어씀.  
**수정**: `pendingImageTransformRef`로 loadPathsJSON의 transform 보호.

### P1 — Plan collapse 후 위성사진 배경 사라짐
Plan ExpandedView minimize 시 노드 카드 썸네일에서 위성사진 배경이 사라짐.  
**원인**: `planBaseImage`가 ExpandedView 로컬 상태로만 존재, CanvasNode에 저장 안 됨.  
**수정**: `planBaseImageData`를 CanvasNode에 저장, thumbnail은 위성사진+스케치 합성본.

### P2 — Plan 생성 결과가 스케치와 다른 위치 (수정A + 수정B 모두 필요)

**수정A (코드)**: `compositeSketchOnBackground()` 좌표 버그  
- 현재: bgImg natural dimensions을 캔버스 크기로 사용 → CSS 레이아웃 불일치  
- 수정: sketchBase64 이미지 크기 기준, bgImg를 CSS `height:100% centered`와 동일하게 배치  

**수정B (프로토콜)**: AI에 지리적 위치 기반 평면도 생성 지시 추가  
- 현재: 위성사진이 포함된 스케치에 대한 위치 기반 지시 없음  
- 수정: `protocol-sketch-to-plan-v3.8.txt` 섹션 3.1.A 추가

---

## 변경 파일

1. **`project_canvas/types/canvas.ts`** — `planBaseImageData?` 필드 추가
2. **`project_canvas/components/SketchCanvas.tsx`** — `pendingImageTransformRef` + loadPathsJSON + useEffect 수정
3. **`project_canvas/app/page.tsx`** — 두 collapse 핸들러 수정 (I1 + P1)
4. **`project_canvas/sketch-to-plan/ExpandedView.tsx`** — compositeSketchOnBackground 좌표 + P1 퍼시스트
5. **`project_canvas/sketch-to-plan/_context/protocol-sketch-to-plan-v3.8.txt`** — 섹션 3.1.A 추가

---

## 체크리스트

- [x] types/canvas.ts: planBaseImageData 필드 추가
- [x] SketchCanvas.tsx: pendingImageTransformRef + loadPathsJSON + useEffect 수정 (I2)
- [x] page.tsx: handleCollapseWithSketch — image artboard 썸네일 허용 (I1)
- [x] page.tsx: handleCollapseWithPlanSketch — image artboard 썸네일 허용 + planBaseImageData 저장 (I1+P1)
- [x] ExpandedView.tsx: compositeSketchOnBackground 좌표 수정 (P2-A)
- [x] ExpandedView.tsx: planBaseImage 퍼시스트 전체 (시그니처·collapse·useEffect) (P1)
- [x] protocol-sketch-to-plan-v3.8.txt: 섹션 3.1.A 추가 (P2-B)
- [ ] 브라우저 검증
