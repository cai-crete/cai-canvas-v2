# Frontend Plan — 지적도 맵 UX 종합 개선

> 생성일: 2026-04-28
> 상태: **ACTIVE**
> 우선순위: **HIGH**

---

## 0. 개요

지적도(Cadastral Map) 컴포넌트의 5개 이슈를 한 번에 처리하는 통합 계획서.

| # | 유형 | 요약 |
|---|------|------|
| A | BUG FIX | 줌아웃/이동이 무제한 → 맵이 컨테이너 밖으로 사라짐 |
| B | BUG FIX | 주변 지적 라인(회색 선)이 화면에 안 나타남 |
| C | FEATURE | 지번(lot number) 라벨 표시 + ON/OFF 토글 |
| D | BUG FIX | Expand → Canvas 복귀 시 썸네일 사라짐 |
| E | 질문/기술조사 | 최대 줌인 시 타일 픽셀 깨짐 — 개선 가능 여부 |

---

## 1. 이슈별 원인 분석 및 수정 계획

### TASK A — 줌아웃/이동 제한

**현상**: `MIN_SCALE=0.1`까지 축소 가능 → 맵이 점처럼 작아짐. 드래그로 맵 밖 이동 가능.

**파일**: `project_canvas/components/CadastralMapView.tsx`

**수정 내용**:

1. **동적 최소 스케일 계산**: 컨테이너 크기를 기반으로 맵 콘텐츠가 컨테이너보다 작아지지 않도록 제한

```typescript
// 컨테이너 크기 추적 (ResizeObserver)
const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    setContainerSize({ w: width, h: height });
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);

// viewBox에서 파싱한 SVG 콘텐츠 크기 기반으로 최소 스케일 계산
// SVG preserveAspectRatio="xMidYMid meet" → aspect ratio 유지
// 최소 스케일 = max(컨테이너W / SVG콘텐츠W, 컨테이너H / SVG콘텐츠H)가 아닌
// 원본 1:1에서의 스케일이므로 정밀 계산 필요
```

2. **팬(Pan) 클램핑**: translate 값에 경계 제한 적용

```typescript
// clampView 유틸 함수: scale에 따라 허용 가능한 x, y 범위 계산
function clampView(x: number, y: number, scale: number, containerW: number, containerH: number): { x: number; y: number } {
  // 스케일된 콘텐츠가 컨테이너보다 클 때: 가장자리가 컨테이너 밖으로 나가지 않도록
  // 스케일된 콘텐츠가 컨테이너보다 작을 때: 중앙 고정 (MIN_SCALE 이 이를 방지)
  const contentW = containerW * scale;
  const contentH = containerH * scale;
  const clampedX = Math.min(0, Math.max(containerW - contentW, x));
  const clampedY = Math.min(0, Math.max(containerH - contentH, y));
  return { x: clampedX, y: clampedY };
}
```

3. **적용 위치**: 휠 줌 핸들러, 드래그 핸들러 모두에 클램핑 적용

- [ ] ResizeObserver로 컨테이너 크기 추적
- [ ] 동적 최소 스케일 계산
- [ ] 팬 클램핑 함수 구현
- [ ] 줌 핸들러에 클램핑 적용
- [ ] 드래그 핸들러에 클램핑 적용

---

### TASK B — 주변 지적 라인 미표시 수정

**현상**: `surroundingFeatures` WFS bbox 요청은 코드에 있으나, 실제 화면에 회색 선이 안 보임.

**파일**: `project_canvas/components/CadastralMapView.tsx`

**원인 조사 포인트**:

1. **WFS 응답 확인**: `fetch('/api/vworld-map', { action: 'wfs-bbox', bbox })` 응답에 features가 실제로 있는지
   - 진단 로그 추가: `console.log('[MAP DIAG] 주변 필지:', surroundingFeatures.length, '건')`
   
2. **경로 생성 확인**: `surroundPaths` 배열이 비어있지 않은지
   - useMemo 내부에서 `console.log('[MAP DIAG] surroundPaths:', sPaths.length, '건')`

3. **렌더링 확인**: SVG `<path>` 요소가 DOM에 존재하는지 (viewBox 밖에 그려졌을 가능성)

**수정 내용**:

1. 진단 로그 추가하여 어디서 끊기는지 확인
2. WFS bbox 요청의 `d=0.0045` 값이 적절한지 확인 (약 500m 반경)
3. `surroundingFeatures`가 `useMemo` deps에 포함되어 있는지 확인 → **이미 포함됨** ✓
4. `showSurrounding` prop 추가하여 토글 가능하게 변경

- [ ] 진단 로그 추가
- [ ] 주변 필지 렌더링 조건에 `showSurrounding` prop 반영
- [ ] WFS 응답 디버그

---

### TASK C — 지번(Lot Number) 라벨 표시 + 토글

**현상**: 주변 필지 경계선만 있고 지번(예: "산1-2", "123-4") 라벨이 없음.

**파일**:
- `project_canvas/components/CadastralMapView.tsx` — 라벨 렌더링
- `project_canvas/components/ExpandedSidebar/CadastralPanel.tsx` — 토글 UI
- `project_canvas/components/ExpandedView.tsx` — props 전달
- `project_canvas/types/canvas.ts` — 타입 추가

**수정 내용**:

1. **타입 추가** (`canvas.ts`):
```typescript
cadastralShowSurrounding?: boolean;  // 주변 지적선 표시 여부
cadastralShowLotNumbers?: boolean;   // 지번 라벨 표시 여부
```

2. **CadastralMapView props 추가**:
```typescript
interface CadastralMapViewProps {
  // ... 기존 props
  showSurrounding?: boolean;  // 주변 지적선 표시
  showLotNumbers?: boolean;   // 지번 라벨 표시
}
```

3. **지번 라벨 렌더링** (SVG `<text>`):
```typescript
// 각 주변 필지의 centroid 계산 → 해당 위치에 지번 텍스트 배치
// WFS 응답의 feature.properties.pnu에서 지번 추출
// PNU 19자리: 시도(2) + 시군구(3) + 읍면동(3) + 리(2) + 대지구분(1) + 본번(4) + 부번(4)
// 대지구분: 1=일반, 2=산
// 표시 형식: "본번-부번" (예: "123-4") 또는 "산123-4"

function pnuToLotNumber(pnu: string): string {
  if (!pnu || pnu.length < 19) return '';
  const isDasan = pnu[10] === '2';
  const mainNum = parseInt(pnu.slice(11, 15), 10);
  const subNum = parseInt(pnu.slice(15, 19), 10);
  const prefix = isDasan ? '산' : '';
  return subNum > 0 ? `${prefix}${mainNum}-${subNum}` : `${prefix}${mainNum}`;
}
```

4. **사이드바 토글 UI** (`CadastralPanel.tsx`):
```
[주변 지적선] 토글 스위치 — ON/OFF
[지번 표시]   토글 스위치 — ON/OFF
```

5. **ExpandedView.tsx**: 새 props를 CadastralMapView에 전달

- [ ] 타입 추가 (canvas.ts) — ✅ 완료됨
- [ ] CadastralMapView에 props 추가 + 지번 라벨 렌더링
- [ ] CadastralPanel에 토글 UI 추가
- [ ] ExpandedView에서 props 연결

---

### TASK D — Expand → Canvas 복귀 시 썸네일 사라짐

**현상**: 지적도 노드를 Expand했다가 Canvas로 돌아오면 썸네일이 사라져 있음.

**파일**:
- `project_canvas/components/CadastralMapView.tsx` — 썸네일 캡처 로직
- `project_canvas/components/NodeCard.tsx` — 썸네일 표시 로직
- `project_canvas/components/ExpandedView.tsx` — Expand 시 캡처 로직

**원인 분석**:

썸네일 캡처 플로우:
```
[NodeCard] thumbnailData 없음
  → CadastralMapView 렌더 + onThumbnailCaptured 콜백
  → 1.5초 후 SVG serialize → data:image/svg+xml;... 생성
  → updateNode({ thumbnailData: base64Url })
  → NodeCard 재렌더 → <img src={thumbnailData}> 표시
```

**의심되는 원인들**:

1. **SVG data URI의 외부 이미지 참조 문제** (가장 유력):
   - 캡처된 SVG에 `<image href="https://xdworld.vworld.kr/...">` 포함
   - `<img src="data:image/svg+xml;...">` 안에서 외부 리소스 로딩 **브라우저 보안 정책상 차단**
   - 결과: 타일이 없는 빈 SVG → 겉보기에 투명/빈 상태

2. **ExpandedView의 onThumbnailCaptured가 매 렌더마다 새 함수 참조 생성**:
   - `onThumbnailCaptured` 콜백이 인라인 → 매 렌더시 새 참조
   - CadastralMapView의 useEffect deps에 포함 → 무한 재트리거 가능
   - `if (!node.thumbnailData)` 가드가 있어 덮어쓰기는 방지되지만 불필요한 timer 생성

3. **`surroundingFeatures` 변경으로 인한 재캡처**:
   - useEffect deps: `[boundary, surroundingFeatures, tmsType, onThumbnailCaptured]`
   - WFS 응답 도착 시 `surroundingFeatures` 변경 → 재캡처 → 덮어쓰기
   - ExpandedView에서는 `if (!node.thumbnailData)` 가드가 있지만
   - NodeCard에서는 **가드가 없음** → 빈 SVG로 덮어쓸 수 있음

**수정 계획**:

1. **SVG 캡처 시 타일 이미지를 canvas로 rasterize 후 dataURL로 임베드**
   (또는 더 간단하게: 폴리곤만 캡처하고 타일은 제외)

2. **onThumbnailCaptured를 useCallback으로 감싸서 불필요한 재트리거 방지**

3. **NodeCard의 onThumbnailCaptured에도 `if (!node.thumbnailData)` 가드 추가**

4. **캡처 useEffect의 deps에서 `surroundingFeatures` 제거**
   (주변 필지는 캡처 품질에 큰 영향 없음)

- [ ] 원인 확인 (브라우저 콘솔에서 img 로드 실패 확인)
- [ ] SVG 캡처 방식 개선 (외부 이미지 문제 해결)
- [ ] onThumbnailCaptured 안정화 (useCallback + 가드)
- [ ] 캡처 useEffect deps 최적화

---

### TASK E — 최대 줌인 시 타일 픽셀 깨짐 (기술 조사 — 질문 답변)

**현상**: 줌 19 타일을 CSS scale로 확대하면 래스터 이미지가 확대되어 픽셀이 깨짐.

**기술적 배경**:
- VWorld TMS 타일: 256×256px 래스터 이미지 (PNG/JPEG)
- Zoom 19: 약 0.3m/pixel (한국 위도 기준)
- CSS `transform: scale(N)` 적용 시: 브라우저가 래스터를 확대 → 보간(interpolation) 처리 → 흐릿하거나 픽셀 보임

**가능한 개선 방법**:

| 방법 | 효과 | 난이도 | 비고 |
|------|------|--------|------|
| ① 줌 20~21 타일 로드 | 높음 | 낮음 | VWorld가 zoom 20+ 제공 여부 확인 필요 |
| ② CSS image-rendering 속성 | 낮음 | 매우 낮음 | `image-rendering: auto` (기본값) → 보간 품질 변경 |
| ③ Retina 대응 (2x 타일) | 중간 | 중간 | VWorld가 512px 타일 지원하는지 확인 필요 |
| ④ 동적 줌 레벨 전환 | 높음 | 높음 | CSS scale 대신 타일 줌 레벨을 올려서 새 타일 로드 |
| ⑤ 벡터 타일 전환 | 최고 | 매우 높음 | Mapbox GL JS 등 별도 라이브러리 필요, 아키텍처 대폭 변경 |

**권장**: ①번 먼저 시도 (VWorld zoom 20 존재 여부 curl 확인) → 없으면 ④번 검토.
④번은 CSS scale을 2x 이상 확대할 때 자동으로 zoom+1 타일을 로드하는 방식.

**결론**: 현재 구조(고정 zoom 19 + CSS scale)에서는 근본적 한계가 있음.
가장 실용적인 해결책은 **줌인 시 동적으로 더 높은 줌 레벨의 타일을 로드**하는 것이나,
이는 타일 좌표 재계산 + viewBox 재조정이 필요하여 별도 이슈로 관리 권장.

- [ ] VWorld zoom 20 타일 존재 여부 확인 (curl 테스트)
- [ ] (조건부) 동적 줌 레벨 전환 구현

---

## 2. 영향 범위

| 파일 | 변경 유형 | 관련 TASK |
|------|----------|-----------|
| `project_canvas/components/CadastralMapView.tsx` | MODIFY | A, B, C, D |
| `project_canvas/components/ExpandedSidebar/CadastralPanel.tsx` | MODIFY | C |
| `project_canvas/components/ExpandedView.tsx` | MODIFY | C, D |
| `project_canvas/components/NodeCard.tsx` | MODIFY | D |
| `project_canvas/types/canvas.ts` | MODIFY | C (완료됨) |

---

## 3. 참고 — Planners 다중 필지 질의 동작

> 이전 대화에서 받은 질문에 대한 답변입니다.

**Q**: Planners에서 여러 대지를 한 번에 질문하면 어떻게 되나요?

**A**: Planners는 **단일 PNU 모드**로 동작합니다.

1. `extractAddress()`가 사용자 입력에서 **하나의 주소만 추출** (첫 번째 매칭)
2. 해당 주소의 PNU로 **하나의 MapNode** 생성
3. 자동으로 주변 ~150m 반경의 인접 필지를 WFS bbox로 검색
4. 인접 필지들을 **같은 MapNode의 GeoJSON FeatureCollection에 병합**
5. CadastralMiniMap이 병합된 features를 하나의 SVG로 렌더링

**결과**: 여러 필지를 명시적으로 요청해도 **첫 번째 주소만 처리**, 나머지는 무시됨.
별도 노드로 분리되거나 에러가 발생하지는 않으며, 단순히 첫 번째만 사용됩니다.

---

COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
