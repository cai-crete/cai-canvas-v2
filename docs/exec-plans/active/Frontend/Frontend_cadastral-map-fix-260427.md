# Frontend Plan — 지적도 맵 타일 미표시 + passive event 오류 + 경계 형태 불일치 수정

> 생성일: 2026-04-27
> 고도화: 2026-04-28 (실측 검증 반영)
> 상태: **ACTIVE**
> 우선순위: **CRITICAL** (지적도 기능 전체 불능)

---

## 0. 검증 기록 — 초기 가설 vs 실측 결과

### 기각된 가설: "TMS y좌표 반전이 필요하다"

| 항목 | 결과 |
|------|------|
| 현재 코드 URL (XYZ y=203128) | `curl -sI` → **HTTP 200** (정상 이미지) |
| TMS 반전 URL (y=321159) | `curl -sI` → **HTTP 404** (존재하지 않음) |
| **결론** | VWorld `xdworld.vworld.kr` TMS는 **XYZ 좌표계 사용**. y좌표 반전 불필요. |

### 확인된 사실

| 항목 | 결과 |
|------|------|
| VWorld TMS CORS | `Access-Control-Allow-Origin: *` → 제한 없음 |
| Referer 제한 | 없음 (localhost, vercel.app 모두 200) |
| CSP 헤더 | Next.js 설정에 CSP 없음 → 차단 아님 |
| Mixed Content | HTTPS → HTTPS 요청 → 문제 없음 |
| 타일 URL 정확성 | URL 자체는 정상. 이미지 응답 확인됨. |

### 진짜 원인 분석

**타일 URL은 정상이나 화면에 안 보이는 이유:**

1. **타일 수량 폭발**: zoom 19 + padding 2.5배 = **196장** 동시 로딩
   - 브라우저 도메인당 동시 연결 6개 → 나머지 190개 대기
   - VWorld 서버 부하 → 일부 또는 전체 타임아웃 → `onError` → `display:none`
   - **해결**: zoom 낮추거나 타일 수 제한 (3×3 ~ 5×5 = 최대 25장)

2. **SVG 부동소수점 정밀도**: viewBox 원점이 1억+(114,468,428)
   - Float32 정밀도에서 114468428 + 256 → 114468688 (260으로 왜곡)
   - 폴리곤은 보이지만 이미지 rect 배치가 미세하게 어긋날 수 있음
   - **해결**: 좌표를 원점 기준으로 오프셋하여 0 근처로 정규화

3. **SVG `<image>` onError 숨김**: 한 장이라도 로드 실패 시 영구히 `display:none`
   - 네트워크 일시 장애에도 복구 불가
   - **해결**: onError에서 숨기지 말고 fallback 처리

---

## 1. 현상 (Bug Report)

### 버그 A — 배경 지도 타일 미표시
- Base, Satellite, Hybrid **모든 레이어**에서 배경 지도가 표시되지 않음
- 폴리곤(빨간 경계선)만 회색 배경 위에 떠 있음
- **원인**: 196장 동시 로딩 + SVG 좌표 정밀도 + onError 숨김 복합 문제

### 버그 B — "Unable to preventDefault inside passive event listener invocation"
- `CadastralMapView.tsx:220`에서 발생
- React `onWheel`이 passive로 등록됨 → `e.preventDefault()` 호출 불가
- 줌인/줌아웃 시 반복적으로 대량 발생

### 버그 C — 지적 경계 형태 불일치
- 토지이음(eum.go.kr)의 같은 필지와 비교 시 폴리곤 형태가 다름
- `lp_pa_cbnd_bubun` (연속지적도)은 편집지적도보다 간소화된 경계

---

## 2. 수정 계획

### TASK 1 — 타일 로딩 아키텍처 전면 개편 (버그 A 수정)

**파일**: `project_canvas/components/CadastralMapView.tsx`

**변경 1-1: 좌표 정규화 — 원점 오프셋 적용**

```typescript
// 현재: Mercator 픽셀 좌표를 절대값으로 사용 (1억+)
// viewBox: "114468428 51999409 3355 3266"

// 수정: 중심점을 원점(0,0)으로 이동
const centerPx = lngLatToPixel(centerLng, centerLat);
const offsetX = centerPx.x;
const offsetY = centerPx.y;

// 모든 좌표에서 offset 차감
const relX = px.x - offsetX;  // → 0 근처 값
const relY = px.y - offsetY;  // → 0 근처 값

// 타일도 동일 오프셋 적용
tile.x = tx * TILE_SIZE - offsetX;
tile.y = ty * TILE_SIZE - offsetY;

// viewBox: "-1600 -1600 3355 3266" → 부동소수점 안전 범위
```

**변경 1-2: 타일 수량 제한**

```typescript
// 현재: padding 2.5배 → 196장
// 수정: 필지 bbox를 1.5배 확장 후 커버하는 타일만 로드 (최대 ~30장)
const PAD_FACTOR = 1.5;
const padX = (maxX - minX) * PAD_FACTOR;
const padY = (maxY - minY) * PAD_FACTOR;

// viewBox용 padding은 별도 (더 넓게)
// 타일 로딩용 padding은 제한적으로
```

**변경 1-3: onError 처리 개선**

```typescript
// 현재: display:none (영구 숨김)
onError={e => {
  (e.target as SVGImageElement).style.display = 'none';
}}

// 수정: opacity 0으로 변경 (레이아웃 유지) + 콘솔 진단 로그
onError={e => {
  const img = e.target as SVGImageElement;
  img.style.opacity = '0';
  console.warn('[MAP] 타일 로드 실패:', img.getAttribute('href'));
}}
```

**변경 1-4: 디버그 진단 로그 추가 (임시)**

```typescript
// useMemo 결과에 로그 추가
console.log('[MAP DIAG] tiles:', tilesList.length, '장');
console.log('[MAP DIAG] viewBox:', vb);
console.log('[MAP DIAG] 샘플 타일 URL:', tilesList[0]?.href);
```

- [ ] 1-1 좌표 정규화 완료
- [ ] 1-2 타일 수량 제한 완료
- [ ] 1-3 onError 개선 완료
- [ ] 1-4 디버그 로그 추가 완료

### TASK 2 — passive event listener 오류 수정 (버그 B 수정)

**파일**: `project_canvas/components/CadastralMapView.tsx`

**변경 내용**:

```typescript
// 1. handleWheel 함수를 일반 함수로 유지 (useCallback 불필요)
// 2. JSX에서 onWheel={handleWheel} 제거
// 3. useEffect에서 네이티브 리스너로 등록

useEffect(() => {
  const el = containerRef.current;
  if (!el || hideControls) return;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

    setView(prev => {
      const nextScale = Math.min(Math.max(MIN_SCALE, prev.scale * factor), MAX_SCALE);
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, [hideControls]);
```

- [ ] 완료

### TASK 3 — Planners CadastralMiniMap 동일 수정 (버그 A 동일)

**파일**: `N01.Planners/src/components/CadastralMiniMap.tsx`

**변경 내용**:
Planners 미니맵은 코사인 투영 + zoom 17 + 3×3 그리드(9장)로 비교적 안전하나,
타일 URL의 XYZ 좌표는 이미 정상 확인됨. 동일하게:

1. onError 처리 개선 (display:none → opacity:0 + 로그)
2. 디버그 진단 로그 추가

- [ ] 완료

### TASK 4 — 경계 형태 정밀도 조사 (버그 C 조사)

**파일**: `project_canvas/app/api/vworld-map/route.ts`

**방법**:
1. 실제 WFS 응답의 좌표를 GeoJSON.io 등에서 시각화하여 토지이음과 비교
2. `lp_pa_cbnd_bubun` (연속지적도) vs 대안 레이어 비교:
   - `lp_pa_cbnd_bonbun` (연속지적도 본번)
   - `lt_c_lhblot` (개별공시지가 필지)
3. 결과에 따라 레이어 변경 또는 현재 유지

> **주의**: VWorld WFS 무료 레이어 변경은 API 키 권한 범위에 따라 제한될 수 있음.

- [ ] 조사 완료
- [ ] (조건부) 레이어 변경 적용

### TASK 5 — 통합 검증

1. **타일 표시 검증**
   - [ ] 브라우저 콘솔에서 `[MAP DIAG]` 로그로 타일 URL 및 수량 확인
   - [ ] Network 탭에서 타일 이미지 요청의 HTTP 상태 확인
   - [ ] Base 지도 타일이 폴리곤 뒤에 배경으로 표시되는가
   - [ ] Satellite 위성 타일이 정상 표시되는가
   - [ ] Hybrid 하이브리드 타일이 정상 표시되는가
   - [ ] 타일과 폴리곤 경계가 위치적으로 정합(align)하는가

2. **이벤트 오류 검증**
   - [ ] 줌인/줌아웃 시 "Unable to preventDefault" 경고 미발생
   - [ ] 줌 동작이 부드럽게 작동
   - [ ] 드래그 팬 동작 정상

3. **경계 형태 검증**
   - [ ] 토지이음 지적도와 비교하여 형태 유사도 확인

---

## 3. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `project_canvas/components/CadastralMapView.tsx` | MODIFY | **중간** — 좌표계 + 이벤트 핸들러 변경 |
| `project_canvas/app/api/vworld-map/route.ts` | MODIFY (조건부) | 낮음 — 레이어명 변경만 |
| `N01.Planners/src/components/CadastralMiniMap.tsx` | MODIFY | 낮음 — onError 개선만 |

---

## 4. 참고 자료

- **VWorld TMS 좌표 체계**: 실측 결과 **XYZ 좌표계 사용** (y=0이 상단). TMS 반전 불필요.
- **React wheel event**: React 17+ `onWheel`은 passive 기본 등록. `{ passive: false }`로 네이티브 리스너 필요.
- **SVG 부동소수점**: viewBox 원점이 클수록 정밀도 손실 증가. 0 근처로 정규화 권장.
- **브라우저 동시 연결**: 도메인당 6개 제한 (HTTP/1.1). HTTP/2에서는 멀티플렉싱으로 완화.

---

COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
