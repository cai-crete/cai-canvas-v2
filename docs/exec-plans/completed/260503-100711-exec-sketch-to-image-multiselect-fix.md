# 작업지시서: Sketch-to-Image 다중선택 구동 로직 수정

**생성일시**: 260503-100711  
**작업 유형**: 버그 수정 + UX 변경 + Protocol 강화

---

## 문제 요약

1. **UX 문제**: 다중 선택 후 [IMAGE] 클릭 시 ExpandedView(스케치 캔버스) 진입 → 캔버스가 완전히 무관하여 사용자 혼란
2. **슬롯 배정 문제**: 평면도/입면도 분류 휴리스틱이 노드 타입을 충분히 활용하지 못함
3. **Protocol 문제**: 입면도(Formal Authority) 분석 결과가 평면도(Spatial Authority) 수평 공간에 영향을 줌

---

## 작업 범위

### Task 1: UX — 다중 소스 IMAGE 모드를 ExpandedView → 사이드바 전용으로 변경

**파일**: `project_canvas/app/page.tsx`, `project_canvas/components/RightSidebar.tsx`

**변경 전**: 2개 노드 선택 → [IMAGE] → `setExpandedNodeId(newId)` → SketchCanvas ExpandedView 열림  
**변경 후**: 2개 노드 선택 → [IMAGE] → Image 노드 생성(isPendingGeneration) + **사이드바만 열림**

**구현 방식**: Viewpoint 패턴 동일 적용
- `page.tsx`: Image 노드 생성 후 `setExpandedNodeId` 대신 `setActiveSidebarNodeType('image')` + 선택 처리
- `page.tsx`: Image 패널 설정 상태 추가 (prompt, mode, style, aspectRatio)
- `page.tsx`: `handleGenerateSketchToImage()` 핸들러 추가 (handleGenerateViewpoint 패턴)
- `RightSidebar.tsx`: `isImage` 분기 추가 → `SketchToImagePanel` 렌더링
- `RightSidebar.tsx`: Props 확장 (inputImages, panelSettings, 핸들러들)
- 생성 완료 시: `isPendingGeneration` 제거, `generatedImageData` 업데이트, `multiSourceAnalysisReport` 저장

**체크리스트**:
- [x] page.tsx: 다중 소스 Image 노드 생성 후 사이드바 모드 진입 (ExpandedView 제거)
- [x] page.tsx: image 패널 설정 상태 관리 추가 (imageMultiSourceSettings 등)
- [x] page.tsx: handleGenerateSketchToImage 핸들러 구현
- [x] RightSidebar.tsx: SketchToImagePanel 렌더링 분기 추가 (isImageMultiSource)
- [x] RightSidebar.tsx: Props 타입 확장
- [x] 생성 완료 후 새 Image 노드 생성 + 엣지 연결
- [x] 기존 단일 소스 ExpandedView 흐름은 유지 (영향 없음 확인)

---

### Task 2: 슬롯 배정 개선 — 노드 타입 기반 평면도/입면도 분류 강화

**파일**: `project_canvas/app/page.tsx` (L907-916)

**현재 로직**:
```typescript
const isSketchArtboard = (n) => n.artboardType === 'sketch' || !!n.sketchPaths || !!n.sketchData;
// 스케치 → 입면도, 비스케치 → 평면도
```

**개선 로직**:
```
노드 타입 무관 — 선택 순서대로 배정
sketchInputNodes[0] → slot0 (평면도)
sketchInputNodes[1] → slot1 (입면도)
사용자가 Swap 버튼으로 조정 가능
```

**체크리스트**:
- [x] 기존 isSketchArtboard 휴리스틱 코드 제거
- [x] slot0 = sketchInputNodes[0], slot1 = sketchInputNodes[1] 단순화

---

### Task 3: Protocol 강화 — 평면도 Spatial Authority 잠금 강화

**파일**: `project_canvas/sketch-to-image/_context/protocol-sketch-to-image-v2.3-multi.txt`

**문제**: 입면도(elevation) 분석 결과(Formal Authority)가 평면도의 수평 공간 배치(Spatial Authority)에 영향을 주고 있음

**강화 방향**:

**ROOM 2 강화**: `horizontal_constants` 추출을 더 구체적/강력하게
- 평면도에서 추출한 수평 상수를 "불변 잠금값(Spatial Lock)"으로 선언
- 각 항목에 수치 좌표계 기준 명시 요구

**ROOM 3 강화**: 입면도 분석 시 평면도 수평 영역 침범 금지 명시
- `conflict_flags`에 수평 침범 시도 감지 의무화
- 입면도가 수평 배치를 변경하려 할 경우 즉시 플래그

**ROOM 4 강화**: 충돌 해소 규칙 강화
- "수평 차원은 평면도의 완전한 독점 영역" → 절대 원칙으로 격상
- 입면도 데이터가 X-Z 평면에 영향 주는 모든 경우를 Failure Mode로 등록

**Phase 3 프롬프트 강화** (sketchToImage.ts):
- "평면도의 수평 상수(horizontal_constants)는 생성 이미지에서 픽셀 수준으로 보존되어야 함" 명시
- ROOM 6 검증 기준 강화: 수평 상수 위반 시 재생성 의무

**체크리스트**:
- [x] ROOM 2: horizontal_constants를 "Spatial Lock"으로 격상, 수치 좌표 요구
- [x] ROOM 3: HORIZONTAL EXCLUSION ZONE 추가 (수평 영역 침범 절대 금지)
- [x] ROOM 4: 충돌 해소 규칙 절대화 + [SLV] Spatial Lock Violation 조항
- [x] ROOM 5: Layer 1 Spatial Lock 적용 — 픽셀 수준 보존 명시
- [x] ROOM 6: [MFM-06] Elevation Spatial Bleed 실패 모드 추가
- [x] sketchToImage.ts Phase 3 프롬프트: SPATIAL LOCK 확인 + 재생성 조건 강화

---

## 작업 순서

1. Task 2 (슬롯 배정) → 가장 간단, 기반이 됨
2. Task 3 (Protocol 강화) → 백엔드 로직, 독립 작업 가능
3. Task 1 (UX 변경) → 가장 범위 큰 작업, 마지막에 수행

---

## 영향 범위

- **기존 단일 소스 Sketch-to-Image (ExpandedView)**: 영향 없음 — 단일 소드 흐름은 그대로 유지
- **Viewpoint 사이드바 패턴**: 영향 없음 — 참조만 함
- **Print 노드**: 영향 없음
