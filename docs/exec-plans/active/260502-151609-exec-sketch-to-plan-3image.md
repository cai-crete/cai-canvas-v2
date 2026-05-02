# 작업지시서: Sketch-to-Plan 3-이미지 모드 수정

**생성일시**: 260502-151609  
**목적**: 롤백 원인(composite 모드에서 지적도 단독 이미지 제거로 인한 대지 경계 인식 실패) 수정

---

## 문제 요약

| | v3.9 (잘 됨) | 63c9ea8 (롤백됨) |
|---|---|---|
| IMAGE_1 | 지적도 원본 (대지 경계 절대 기준) | composite (지적도+스트로크) |
| IMAGE_2 | 스트로크만 (Room Topology) | 스트로크만 |
| 결과 | 대지 형상 반영 | 대지 무시, 사각형 평면 생성 |

**핵심 원인**: composite 모드에서 `cadastralPart`가 `imageParts`에서 제거됨 → AI가 대지 경계를 인식하지 못함

---

## 수정 방향: Option A (3-이미지 모드)

지적도가 있을 때 항상 3장 전송:
- **IMAGE_1**: 지적도 원본 → 대지 경계·방향의 절대 기준 (Immutable Site Anchor)
- **IMAGE_2**: composite (지적도+스트로크) → 스케치의 대지 내 위치·크기 비율 파악
- **IMAGE_3**: 스트로크만 → Room Topology 분석 전용

composite 없이 지적도만 있으면 기존 2-이미지 유지 (v3.9 동작).

---

## 체크리스트

### Task 1: render-server imageParts 3-이미지로 수정
**파일**: `render-server/src/routes/sketchToPlan.ts`

- [ ] `imageParts` 분기 변경:
  ```
  현재: compositePart ? [compositePart, sketchPart] : cadastralPart ? [cadastralPart, sketchPart] : [sketchPart]
  수정: (compositePart && cadastralPart) ? [cadastralPart, compositePart, sketchPart]
         : cadastralPart ? [cadastralPart, sketchPart]
         : [sketchPart]
  ```

### Task 2: cadastralContext 프롬프트 3-이미지 모드 업데이트
**파일**: `render-server/src/routes/sketchToPlan.ts`

- [ ] composite + cadastral 모두 있을 때 프롬프트를 3-이미지 기준으로 재작성:
  - IMAGE_1: 지적도/위성사진 원본 — 대지 경계·스케일·방향의 절대 기준
  - IMAGE_2: 합성 이미지 — 스케치가 대지 내 차지하는 위치·크기 비율 파악용
  - IMAGE_3: 스트로크만 — Room Topology 분석 전용
  - 절대 규칙: IMAGE_1 대지 경계 불변, IMAGE_2의 스트로크 위치 비율 반영

### Task 3: composite export 뷰포트 정규화
**파일**: `project_canvas/components/SketchCanvas.tsx`

- [ ] `exportComposite()` 메서드 추가 (SketchCanvasHandle 인터페이스 포함):
  - 현재 `exportAsBase64()`는 사용자 현재 zoom/pan 기준 → 확대 상태면 지적도가 잘릴 수 있음
  - `exportComposite()`는 업로드된 이미지(지적도)가 캔버스 전체에 fit되는 zoom/offset을 계산하여 export
  - 배경(지적도) + 스트로크 모두 포함, 흰색 배경

### Task 4: ExpandedView에서 exportComposite() 사용
**파일**: `project_canvas/sketch-to-plan/ExpandedView.tsx`

- [ ] `handleGenerate()`에서 composite용 export를 `canvas.exportAsBase64()` → `canvas.exportComposite()`로 교체

### Task 5: render-server 재배포
- [ ] render-server 빌드 및 배포 확인

---

## 변경 대상 파일 목록

1. `render-server/src/routes/sketchToPlan.ts` — imageParts 분기 + 프롬프트
2. `project_canvas/components/SketchCanvas.tsx` — exportComposite() 추가
3. `project_canvas/sketch-to-plan/ExpandedView.tsx` — exportComposite() 호출

---

## 검증 시나리오

1. **지적도 배경 있는 스케치**: 3장 전송, 생성된 평면이 대지 형상 + 스케치 위치 반영하는지 확인
2. **지적도 없는 스케치**: 기존 단일 이미지 모드 동작 유지 확인
3. **zoom 확대 상태에서 Generate**: composite에 지적도 전체가 포함되는지 확인
