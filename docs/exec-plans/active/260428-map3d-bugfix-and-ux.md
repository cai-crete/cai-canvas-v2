# 작업지시서: Map3D 버그 수정 및 UX 개선

**작성일**: 2026-04-28  
**우선순위**: HIGH  
**대상 파일**:
- `project_canvas/components/Map3DView.tsx`
- `project_canvas/components/ExpandedView.tsx`
- `project_canvas/components/ExpandedSidebar/Map3DPanel.tsx` (신규)
- `project_canvas/types/canvas.ts` (map3dShowLabels 필드 추가)

---

## 문제 목록 및 원인 분석

### [BUG-1] 재진입 시 "지도 초기화 실패" (Cannot redefine property: viewer)

**증상**: 3D Map 진입 → 캔버스로 나옴 → 재진입 시 `TypeError: Cannot redefine property: viewer` 발생  
**원인**: V-World SDK(`WSViewerStartup.js`)가 컨테이너 DOM에 `viewer` 프로퍼티를 `Object.defineProperty`로 등록 (non-configurable). `destroy()` 호출 후에도 이 프로퍼티는 DOM 노드에 잔존. 같은 `containerId`의 div를 재사용하면 SDK가 동일 프로퍼티를 재정의 시도 → TypeError.  
**해결 방안**: Map3DView에 `mountKey` state를 두고 cleanup 시 increment → 새 suffix로 containerId 변경 → 새 div 엘리먼트 생성으로 SDK 재정의 충돌 회피.

---

### [BUG-2] 캡처 → Image Node 내보내기 미작동

**증상**: 버튼 클릭 시 thumbnailData만 업데이트, 새 Image Node가 캔버스에 생성되지 않음  
**원인**: 현재 capture 핸들러는 `updateNode(node.id, { thumbnailData: base64 })`만 실행. CadastralPanel의 `onExportCadastralImage` → page.tsx에서 새 이미지 노드 생성 패턴과 달리, Map3D에는 해당 콜백 prop이 없음  
**해결 방안**:
1. ExpandedView Props에 `onExportMap3dImage?: (base64: string) => void` 추가
2. Map3DPanel의 버튼 클릭 → capture → onExportMap3dImage 호출
3. page.tsx에서 해당 콜백 연결 (기존 cadastral export 패턴 동일하게)

---

### [BUG-3] 3D View 썸네일 실패

**증상**: 캡처 시 빈 이미지(검정/투명) 반환  
**원인**: WebGL context는 기본 `preserveDrawingBuffer: false`. `render()` 후 다음 프레임에서 버퍼가 초기화되어 `toDataURL()`이 빈 이미지 반환  
**해결 방안**:
- `map.start()` 호출 전 SDK의 WebGL 옵션에 `preserveDrawingBuffer: true` 설정 (SDK 지원 시)
- 또는 capture 시 `requestAnimationFrame` 내에서 render 후 즉시 toDataURL 시도
- 자동 썸네일: map 초기화 완료 후 2-3초 뒤 자동 캡처하여 `thumbnailData` 저장

---

### [FEAT-4] 텍스트(지명/POI 레이블) 토글

**요구사항**: 3D View 내 지명/POI 텍스트를 켜고 끌 수 있는 토글  
**구현**:
- `node.map3dShowLabels` (boolean, 기본 true) 필드 추가 (types/canvas.ts)
- V-World SDK API: `map.getLayerList()`로 레이어 목록 조회 후 label/poi 레이어 `setVisible(bool)` 호출
- SDK에서 직접 레이어 접근 불가 시: SDK의 `vw.ol.control.Attribution` 또는 widget 레이어 visible 제어
- Map3DPanel에서 CadastralPanel 스타일 토글 스위치로 노출

---

### [UX-5] 사이드바 디자인 통일 (2D Map 기준)

**요구사항**: Map3D 사이드바를 CadastralPanel과 동일한 디자인 패턴으로  
**변경**:
- 인라인 style 제거 → Tailwind 클래스로 교체
- 섹션 구조: Header / 조작 안내 / 표시 옵션(텍스트 토글) / 내보내기 버튼
- 버튼 스타일: `bg-black text-white text-[0.75rem] font-bold tracking-wider rounded-lg hover:bg-gray-800`
- 레이블 스타일: `text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider`
- 토글 스위치: CadastralPanel 동일 패턴 (`w-8 h-4 rounded-full bg-black/bg-gray-200`)
- 컴포넌트 분리: `components/ExpandedSidebar/Map3DPanel.tsx` 신규 파일로 추출

---

### [UX-6] 첫 진입 시점: 정입면 + 45도 대각선 Bird's Eye

**요구사항**: 현재 '2.png' (너무 근접/가파름) → '1.png' (도로 정면 기준 45도 대각선, 넓은 시야)  
**분석**:
- 현재: `Direction(heading, -45, 0)`, height=500m
- 목표: 도로에서 45도 대각선 방향 + 더 넓은 시야
- 변경:
  - `height`: 500 → **800** (더 높은 고도)
  - `tilt`: -45 → **-40** (덜 가파르게, 더 넓은 시야)
  - `heading` 오프셋: `heading + 45` (도로 정면 기준 45도 비틀기)
  - → `Direction(heading + 45, -40, 0)`

---

## 구현 체크리스트

- [ ] **[BUG-1]** `Map3DView.tsx` — mountKey state 추가, cleanup 시 increment, containerId에 mountKey suffix 적용
- [ ] **[BUG-2]** `ExpandedView.tsx` — `onExportMap3dImage` prop 추가, Map3D 섹션에서 연결
- [ ] **[BUG-2]** `Map3DPanel.tsx` — 캡처 버튼 → onExportMap3dImage 콜백 호출로 변경
- [ ] **[BUG-3]** `Map3DView.tsx` — capture 함수 개선 (rAF 기반 render+capture), 초기화 후 자동 썸네일 저장
- [ ] **[FEAT-4]** `types/canvas.ts` — `map3dShowLabels?: boolean` 필드 추가
- [ ] **[FEAT-4]** `Map3DView.tsx` — `showLabels` prop 추가, SDK 레이어 toggle 연동
- [ ] **[FEAT-4]** `Map3DPanel.tsx` — 텍스트 표시 토글 스위치 UI 추가
- [ ] **[UX-5]** `Map3DPanel.tsx` 신규 생성 — CadastralPanel 디자인 패턴으로 전체 구현
- [ ] **[UX-5]** `ExpandedView.tsx` — 인라인 Map3D 사이드바 → Map3DPanel 컴포넌트로 교체
- [ ] **[UX-6]** `Map3DView.tsx` — initPosition Direction: `heading+45`, tilt `-40`, height `800`
- [ ] **전체 검증** — 개발 서버에서 진입/나가기/재진입 테스트, 캡처 테스트, 텍스트 토글 테스트

---

## 구현 순서 (의존성 기준)

1. `types/canvas.ts` — 필드 추가 (FEAT-4)
2. `Map3DView.tsx` — BUG-1, BUG-3, FEAT-4, UX-6 통합 수정
3. `Map3DPanel.tsx` — 신규 파일 (UX-5, FEAT-4, BUG-2)
4. `ExpandedView.tsx` — prop 추가, Map3DPanel 연결 (BUG-2, UX-5)
5. page.tsx 확인 — `onExportMap3dImage` 콜백 연결 (BUG-2)

---

## 완료 기준

- 3D Map 재진입 시 콘솔 에러 없음
- 캡처 버튼 → 새 Image Node가 캔버스에 생성됨
- 썸네일이 노드 카드에 정상 표시됨
- 텍스트 토글이 3D View 내 레이블을 켜고 끔
- 사이드바 디자인이 2D Map(지적도)과 시각적으로 통일됨
- 첫 진입 시 '1.png'와 유사한 Bird's Eye 45도 대각선 시점으로 시작
