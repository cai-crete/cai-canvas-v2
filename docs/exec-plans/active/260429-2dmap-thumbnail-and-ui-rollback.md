# 작업지시서: 2D Map 썸네일 줌 조정 및 UI 롤백

**작성일**: 2026-04-29  
**우선순위**: HIGH  
**대상 파일**:
- `project_canvas/components/CadastralMapView.tsx` (viewBox 패딩 조정)
- `project_canvas/components/NodeCard.tsx` (썸네일 렌더링)
- `project_canvas/components/ExpandedSidebar/CadastralPanel.tsx` (UI 롤백)
- `project_canvas/components/ExpandedSidebar/Map3DPanel.tsx` (UI 통일)

---

## 작업 1: 썸네일 줌 레벨 조정 — 대지 주변 2-3건물만 보이게

### 현재 상태
- `CadastralMapView.tsx:393` — viewBox 패딩이 `extentPx * 2.5`로 설정
- 필지 크기 대비 5배 영역이 보여서 너무 멀리서 찍힌 것처럼 보임
- ExpandedView와 NodeCard(썸네일) 모두 동일한 CadastralMapView 사용

### 변경 방안
- CadastralMapView에 `zoomPadding` prop 추가 (기본값: 2.5 — 기존 동작 유지)
- NodeCard에서 CadastralMapView 호출 시 `zoomPadding={0.5}` 전달 (대지 크기의 0.5배 여백 → 주변 2-3필지만 보임)
- ExpandedView는 기존 2.5배 유지 (사용자가 줌/팬으로 조절 가능)

### 수정 파일
1. `CadastralMapView.tsx` — `zoomPadding` prop 추가, viewBox 패딩 계산에 적용
2. `NodeCard.tsx` — 썸네일용 CadastralMapView에 `zoomPadding={0.5}` 전달

---

## 작업 2: 썸네일 고정 설정값 적용

### 현재 상태
- NodeCard의 CadastralMapView가 node의 설정값(tmsType, showLotNumbers 등)을 그대로 전달
- 사용자가 ExpandedView에서 변경한 설정이 썸네일에도 반영됨

### 변경 내용
썸네일은 ExpandedView 설정과 독립적으로 항상 아래 고정값 사용:
| 옵션 | 썸네일 고정값 | 설명 |
|------|------------|------|
| `tmsType` | `'Vector'` | 벡터 지도 배경 |
| `showSurrounding` | `true` | 주변 지적선 표시 ON |
| `showLotNumbers` | `false` | 지번 표시 OFF |
| `fillSelected` | `false` | 선택 대지 내부 색칠 OFF |

### 수정 파일
1. `NodeCard.tsx` — CadastralMapView 호출 시 고정 prop 전달 (node 설정값 무시)

---

## 작업 3: UI 디자인 롤백 — Sketch to Image/Plan 패턴으로 통일

### 기준 디자인 (Sketch to Image / Sketch to Plan 사이드바)
- **스타일링**: 인라인 `style={}` + CSS 커스텀 프로퍼티 (`var(--color-xxx)`, `var(--font-family-xxx)`)
- **섹션 라벨**: `fontFamily: 'var(--font-family-bebas)'`, `fontSize: '0.75rem'`, `color: 'var(--color-gray-400)'`, `letterSpacing: '0.1em'`
- **컨텐츠 영역**: `padding: '1rem'`, `gap: '1.25rem'`, scrollable
- **토글/버튼**: `borderRadius: '0.75rem'`, `border: '1px solid var(--color-gray-200)'`, Bebas 폰트
- **바닥 액션 버튼**: pill 형태 (`borderRadius: '9999px'`), Bebas 폰트, 검정 배경
- **푸터**: `© CRETE CO.,LTD. 2026`
- **헤더**: 별도 헤더 바 없음 (ExpandedSidebar 컴포넌트가 타이틀 처리)

### 현재 디자인 (Sonnet이 변경한 것 — 롤백 대상)
- **스타일링**: Tailwind 클래스 (`className="..."`)
- **섹션 라벨**: `text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider`
- **헤더**: 별도 헤더 바 (`h-[3.25rem] border-b` + "지적도 설정" / "3D VIEW 설정")
- **토글**: 커스텀 슬라이드 스위치 (`w-8 h-4 rounded-full`)
- **바닥 버튼**: `bg-black text-white rounded-lg` (pill 아님)
- **푸터**: 없음

### 변경 내용
CadastralPanel과 Map3DPanel 모두 아래 패턴으로 전환:

1. **별도 헤더 바 제거** — ExpandedSidebar가 타이틀 처리하므로 불필요
2. **Tailwind → 인라인 style + CSS 변수** — Sketch 패널과 동일한 스타일링 방식
3. **섹션 라벨** → Bebas 폰트 `sectionLabel` 스타일 객체 사용
4. **토글 버튼** → `borderRadius: '0.75rem'`, Bebas 폰트, `border: '1px solid var(--color-gray-200)'`
   - 활성: `background: 'rgba(0,0,0,0.05)'`, `color: 'var(--color-black)'`
   - 비활성: `background: 'transparent'`, `color: 'var(--color-gray-500)'`
5. **바닥 액션 버튼** → pill 형태 (`9999px`), Bebas 폰트, `Image Node로 내보내기` → `EXPORT TO IMAGE NODE`
6. **푸터 추가** → `© CRETE CO.,LTD. 2026`
7. **컨텐츠 래퍼** → `flex: 1, overflowY: 'auto', padding: '1rem', gap: '1.25rem'`

### 수정 파일
1. `CadastralPanel.tsx` — 전면 리라이트 (인라인 style 패턴)
2. `Map3DPanel.tsx` — 전면 리라이트 (인라인 style 패턴)

---

## 구현 체크리스트

### 작업 1 — 썸네일 줌
- [ ] `CadastralMapView.tsx` — `zoomPadding` prop 추가 (기본값 2.5)
- [ ] `CadastralMapView.tsx` — viewBox 패딩 계산에서 `pad = extentPx * zoomPadding` 적용
- [ ] `NodeCard.tsx` — 썸네일 CadastralMapView에 `zoomPadding={0.5}` 전달

### 작업 2 — 썸네일 고정 설정
- [ ] `NodeCard.tsx` — 썸네일 CadastralMapView에 고정값 전달: `tmsType="Vector"`, `showSurrounding={true}`, `showLotNumbers={false}`, `fillSelected={false}`
- [ ] 기존 `node.cadastralTmsType` 등 참조 제거 (썸네일 한정)

### 작업 3 — UI 롤백
- [ ] `CadastralPanel.tsx` — Tailwind → 인라인 style, Bebas 라벨, pill 버튼, 헤더 제거, 푸터 추가
- [ ] `Map3DPanel.tsx` — 동일 패턴으로 전환
- [ ] tsc 빌드 검증

---

## 구현 순서

1. `CadastralMapView.tsx` — zoomPadding prop 추가 (작업 1)
2. `NodeCard.tsx` — 썸네일 전용 줌 + 고정 설정값 적용 (작업 1 + 2)
3. `CadastralPanel.tsx` — Sketch 패널 디자인으로 리라이트 (작업 3)
4. `Map3DPanel.tsx` — Sketch 패널 디자인으로 리라이트 (작업 3)
5. tsc 빌드 검증
6. 브라우저에서 확인 (썸네일 줌, 고정 설정, 사이드바 디자인)

---

## 완료 기준

- 썸네일이 대지 주변 2-3건물만 보이는 줌 레벨로 표시
- 썸네일 배경: 벡터 지도 (그레이스케일)
- 썸네일: 주변 지적선 표시, 지번 숨김, 대지 내부 색칠 없음
- ExpandedView의 줌/설정은 기존과 동일하게 유지
- CadastralPanel, Map3DPanel 디자인이 SketchToImagePanel/SketchToPlanExpandedView와 시각적으로 통일
- tsc 빌드 에러 없음
