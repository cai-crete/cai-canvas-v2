# 작업지시서: 단순 이미지 뷰어 제거 → SketchToImageExpandedView 대체

**일시:** 2026-04-30  
**목적:** `ExpandedView.tsx`의 "단순 이미지 뷰어" 분기를 완전히 제거하고 `SketchToImageExpandedView`로 통합한다.

---

## 문제

- `artboardType === 'image'` 노드 중 `sketchData/sketchPaths` 없고 `generatedImageData` 있는 경우 → 단순 이미지 뷰어로 분기
- multi-source 결과 노드 포함 → 분석 리포트 패널을 볼 수 없음
- 라우팅 조건이 복잡하여 매번 충돌 발생

## 변경 계획

### [ ] Tier 1 — `project_canvas/components/ExpandedView.tsx`

1. `hasSketchContent` 조건 제거 → artboardType=image + image/default 모드이면 무조건 `SketchToImageExpandedView`로 라우팅
2. 단순 이미지 뷰어 블록(line 408~448) 완전 제거
3. 주석 업데이트

### [ ] Tier 2 — 타입 체크

- `tsc --noEmit` 오류 없음 확인

---

## 완료 기준

- 다중 선택 생성 이미지 Expand → SketchToImageExpandedView 진입 (분석 리포트 + 참조 이미지 표시)
- 단일 스케치 생성 이미지 Expand → SketchToImageExpandedView 진입 (기존 동일)
- tsc 오류 없음
