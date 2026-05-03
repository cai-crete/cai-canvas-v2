# 작업지시서: Sketch-to-Plan 3개 이슈 수정

## 배경
스크린샷 분석 결과 3개 이슈 확인:
1. 지적도 site boundary → 건물 외곽으로 잘못 작동 (지적도가 왜곡/변경되면 안 됨)
2. 스케치 외곽이 건축 외벽 기준이 되어야 함 (현재는 지적도 경계 = 건물 외벽)
3. ExpandedView 그리드가 gridModule과 연동 안 됨 (모눈 1칸 = gridModule mm 이어야 함)

## 우선순위
1. 지적도 불변 (항상 고정 배경)
2. 스케치 기준 건축 외곽선
3. 단위 명확화 (그리드 레이블 = gridModule)

---

## 체크리스트

### Issue 1+2: 프로토콜 수정

#### `protocol-sketch-to-plan-v3.9.txt`

- [ ] **Section 0.3 항목 1** — 대지 경계 정의 변경
  - 현재: "이것이 건물이 위치해야 할 영역의 절대 외곽입니다."
  - 변경: "이것은 건물이 배치될 수 있는 최대 허용 영역의 경계입니다. ⚠️ 대지 경계 ≠ 건물 외곽선. 건물 외벽은 반드시 스케치 스트로크에서 결정되어야 합니다."

- [ ] **Section 0.3 항목 5 신규 추가** — 건축 외곽선(Building Footprint) 규칙
  - 스케치에 닫힌 폴리곤 → 그 폴리곤 = 건물 외벽
  - 방 버블만 있으면 → 버블 합집합 외곽(Union Boundary) = 건물 외벽
  - 대지 경계(IMAGE_1)가 건물 외벽 형태를 결정해서는 안 됨

- [ ] **Section 0.4 HARD-STOP-4 신규 추가**
  - IMAGE_1(지적도)의 대지 경계 형태를 건물 외벽으로 사용 금지
  - 건물 외벽은 반드시 IMAGE_2/IMAGE_3 스케치 스트로크 외곽에서 결정

- [ ] **Section 5.1 Site Fidelity 재정의**
  - 현재: "IMAGE_1 대지 경계가 결과물의 외곽 경계를 지배합니다."
  - 변경: 지적도는 배치 최대 허용 영역 + 방향/스케일 기준만. 건물 외곽은 스케치가 결정.

- [ ] **Section 6.1 Site Boundary Check 추가**
  - "건물 외벽이 IMAGE_1 대지 경계 형태를 따라가고 있지 않은가?" 자가 검증 항목 추가

#### `render-server/src/routes/sketchToPlan.ts`

- [ ] **cadastralContext 3-이미지 모드**
  - IMAGE_3 설명에 "스트로크 최외곽 = 건물 외벽" 명시
  - 절대 규칙 재정의: 대지경계 ≠ 건물외벽, 건물외벽 = 스케치 외곽
  - 절대 규칙 3 추가: 평면도는 대지 경계 안에 위치

- [ ] **cadastralContext 2-이미지 모드**
  - IMAGE_2 설명에 "스트로크 최외곽 = 건물 외벽" 명시
  - 절대 규칙 1+2+3으로 분리 명확화

- [ ] **analysisPrompt 그리드 스케일 추가**
  - `구조 그리드 모듈: ${grid_module}mm (스케치 캔버스의 메이저 그리드 1셀 = ${grid_module}mm)` 으로 변경

---

### Issue 3: 그리드 스케일 연동

#### `components/InfiniteGrid.tsx`
- [ ] `gridModule?: number` prop 추가
- [ ] major 교차점에 gridModule 레이블 표시 (8000mm → "8m", 1000mm → "1m")
- [ ] 줌 레벨이 낮아 major 셀이 좁으면 레이블 숨김 (major >= 80px 일 때만 표시)

#### `components/SketchCanvas.tsx`
- [ ] `gridModule?: number` prop 추가
- [ ] InfiniteGrid에 gridModule 전달

#### `sketch-to-plan/ExpandedView.tsx`
- [ ] SketchCanvas에 `gridModule={GRID_MODULES[gridModIdx]}` 전달

---

## 예상 결과
- PLAN 아트보드에서 건물 외벽이 지적도 필지 경계를 따라가는 현상 해소
- 스케치 스트로크 외곽이 건물 외벽으로 생성
- ExpandedView 그리드에 "8m" 등 레이블 표시 (gridModule 연동)
