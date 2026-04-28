# 작업지시서: Map3D 잔여 5건 수정 (BUG-1 제외)

**작성일**: 2026-04-28  
**우선순위**: CRITICAL  
**선행 완료**: BUG-1 (재진입 에러) 해결 확인됨

---

## 수정 내역

### [BUG-2/3] 캡처 → Image Node 내보내기 + 빈 썸네일

**원인 분석**:
- 콜백 체인 (Map3DPanel → ExpandedView → page.tsx) 정상 연결 확인됨
- 근본 원인: `captureCanvas()` 가 null/빈 데이터 반환 → `base64.length > 1000` 실패 → 콜백 미호출
- 이전 코드: `postRender.addEventListener` + `requestRender()` 사용 → V-World SDK 호환 미확인

**수정 내용** (`Map3DView.tsx`):
- 방법1: 동기 `scene.render()` → 즉시 `toDataURL()` (같은 동기 블록이면 WebGL 버퍼 미클리어)
- 방법2 (폴백): `readPixels()` → 2D canvas에 그려서 export (preserveDrawingBuffer 무관)
- 브라우저 콘솔에 `[Map3D capture]` 로그 출력 → 어디서 실패하는지 즉시 확인 가능
- Map3DPanel.tsx에도 디버그 로그 추가

### [FEAT-4] 레이블/POI 토글

**현 상태**: 코드 구현됨, SDK 실제 동작 미확인
**수정 내용** (`Map3DView.tsx`):
- `applyLabelsVisible()` 에 상세 디버그 로그 추가
- `getLayerList()` 존재 여부, 레이어 목록, Cesium primitives/entities 수 콘솔 출력
- 브라우저에서 토글 시 `[Map3D labels]` 로그로 SDK 지원 범위 즉시 파악 가능

### [UX-5] 사이드바 디자인 통일

**현 상태**: Map3DPanel.tsx 이미 CadastralPanel 패턴으로 구현 완료
- Header / 표시 옵션(토글) / 지도 조작 안내 / 내보내기 버튼 구조
- Tailwind 클래스, 동일 폰트 크기/색상 적용됨
- 추가 수정 불필요

### [UX-6] 초기 시점 Bird's Eye

**수정 내용**:
- `Map3DView.tsx`: 기본 height 600 → **800**
- `ExpandedView.tsx`: 기본 height 600 → **800**
- heading+45, tilt=45 유지 (V-World 기준 0=top-down, 45=bird's eye 맞음)

---

## 수정 파일

| 파일 | 변경 |
|------|------|
| `components/Map3DView.tsx` | captureCanvas 전면 교체, labels 디버그 로그, height 기본값 |
| `components/ExpandedSidebar/Map3DPanel.tsx` | capture 디버그 로그 |
| `components/ExpandedView.tsx` | height 기본값 동기화 |

---

## 체크리스트

- [x] BUG-2/3: captureCanvas 동기 render+toDataURL + readPixels 폴백
- [x] FEAT-4: 레이블 토글 디버그 로그 추가
- [x] UX-5: Map3DPanel 디자인 확인 (이미 완료)
- [x] UX-6: height 600→800 변경
- [x] tsc --noEmit 에러 없음
- [ ] **브라우저 실제 테스트 필요**:
  - [ ] "Image Node로 내보내기" → 새 노드 생성 확인
  - [ ] 썸네일 자동 표시 확인
  - [ ] 레이블 토글 동작 확인 (콘솔 로그 확인)
  - [ ] 첫 진입 시 시야 넓어졌는지 확인

---

## 핵심 원칙 (260428-failures.md 반영)

1. 디버그 로그 먼저 — 원인 확인 후 코드 수정
2. "될 것 같다" 금지 — 브라우저에서 동작 확인 후 완료 처리
3. SDK 추측 금지 — 콘솔 로그로 실제 API 존재 여부 확인
