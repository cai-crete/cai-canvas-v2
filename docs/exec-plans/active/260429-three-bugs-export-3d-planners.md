# 3건 버그 수정: 이미지 내보내기 비율 / 3D Map 미작동 / Planners 대화창 정렬

- 일시: 2026-04-29
- 분류: bugfix

---

## 체크리스트

- [x] Bug 1: CadastralMapView exportToImage — SVG clone에 명시적 width/height 설정
  - 원인: SVG `width="100%"` `height="100%"`가 독립 이미지 로드 시 참조할 부모 없어 비율 왜곡
  - 수정: `clone.setAttribute('width'/'height', rect pixel값)` 추가
  - 파일: `components/CadastralMapView.tsx`

- [x] Bug 2: Map3DView — VWorld 3D SDK 스크립트 동적 로딩
  - 원인: VWorld 3D SDK (`window.vw.Map`) 스크립트가 어디에서도 로드되지 않음
  - 수정: `loadSDKScript()` 함수 추가 + `waitForSDK`가 동적 로드 사용
  - 파일: `components/Map3DView.tsx`

- [x] Bug 3: Planners 대화창 — 우측 사이드바 고려한 캔버스 영역 정렬
  - 원인: PlannersPanel 컨테이너가 `inset: 0`으로 전체 너비 차지 → 대화창이 화면 중심에 위치
  - 수정: `right: 'calc(var(--sidebar-w) + 2rem)'` 추가 (3D View와 동일 패턴)
  - 파일: `components/ExpandedView.tsx`

- [x] 빌드 확인 통과
