# Frontend Plan — CAI CANVAS 지적도 아트보드 연동 (Server-to-Server)

> 이 문서는 살아있는 문서(living document)입니다.
> 작업을 진행하면서 발견, 결정, 진행 상황을 이 문서에 지속적으로 업데이트합니다.
> 이전 맥락이나 기억 없이, 이 문서만으로 작업을 완수할 수 있을 만큼 자급자족해야 합니다.
>
> 작업 완료 시 `completed/Frontend/` 폴더로 이동합니다.

---

## 개요

- **작업 유형**: 서버-투-서버 데이터 파이프라인 연결 + UI 교체
- **대상 프로젝트**: CAI CANVAS (`project_canvas/`)
- **의존 서버**: Planners 백엔드 (`https://cai-planners-v2.vercel.app`)
- **시작일**: 2026-04-27
- **검토**: Opus 검토 완료 (Sonnet 초안 → Opus 4건 수정 반영)

---

## 목표

CAI CANVAS 지적도 아트보드(`cadastral` 노드)가 현재 **eum.go.kr iframe**에 의존하고 있어
404 오류로 지도가 표시되지 않는 문제를 해결한다.

Planners 백엔드의 VWorld WFS 프록시(`/api/vworld-map`)를 통해 GeoJSON 지적 경계 데이터를
서버-투-서버로 수신하고, **순수 SVG** 방식으로 CAI CANVAS 지적도 아트보드에 렌더링한다.

---

## 아키텍처 (현재 → 목표)

### 현재 (broken)
```
[브라우저] → PlannersPanel.fetchRelevantLaws() → PNU만 추출
          → onCadastralDataReceived(pnu, landCount) → page.tsx → cadastral 노드 생성 (PNU만 저장)
          → ExpandedView: <iframe src="eum.go.kr?pnu=..."> → 404 에러
```

### 목표 (server-to-server)
```
[브라우저] → PlannersPanel.fetchRelevantLaws() → PNU 추출
          → fetch('/api/vworld-map', { action:'wfs', pnu }) ← CAI CANVAS 프록시 (신규)
          → Planners https://cai-planners-v2.vercel.app/api/vworld-map
          → VWorld WFS API → GeoJSON 반환
          → onCadastralDataReceived(pnu, geoJson, mapCenter) → page.tsx → cadastral 노드에 GeoJSON 저장
          → ExpandedView: <CadastralMapView boundary={geoJson} /> → SVG 렌더링 ✅
```

---

## 프로젝트 경로 (절대경로)

> **⚠️ Agent 필독 — 모든 파일 경로는 아래 BASE를 기준으로 합니다.**

```
BASE = c:/Users/크리트/Desktop/AI/01. CAI_CANVAS/cai-canvas-v2-main/project_canvas
```

- API 라우트: `{BASE}/app/api/`
- 컴포넌트: `{BASE}/components/`
- 타입: `{BASE}/types/canvas.ts`
- Planners 패널: `{BASE}/planners/PlannersPanel.tsx`
- 페이지: `{BASE}/app/page.tsx`
- ExpandedView: `{BASE}/components/ExpandedView.tsx`

> **Planners 백엔드** (`C:/Users/크리트/Downloads/Planners_harness/N01.Planners/`)는
> 이미 완료된 서버입니다. **이 작업에서 절대 수정하지 않습니다.**

---

## 건드리지 말아야 할 파일 (DO NOT MODIFY)

| 파일 | 이유 |
|------|------|
| `{BASE}/planners/lib/lawApi.ts` | 기존 법령 API 래퍼, 정상 동작 중 |
| `{BASE}/planners/lib/lawKeywords.ts` | 기존 키워드 추출, 정상 동작 중 |
| `{BASE}/planners/lib/parkingCalculator.ts` | 관련 없음 |
| `{BASE}/planners/lib/zoneLawMapping.ts` | 관련 없음 |
| `{BASE}/components/NodeCard.tsx` | 이번 작업 범위 외 (썸네일은 별도 작업) |
| `{BASE}/app/api/planners/route.ts` | 기존 Planners 프록시, 정상 동작 중 |
| Planners 백엔드 전체 | 이미 완료됨. 절대 건드리지 않는다 |

---

## 현재 상태 분석

### 이미 구현된 것 (재사용 — 수정 금지)

| 레이어 | 파일 | 상태 |
|--------|------|------|
| Planners 프록시 패턴 | `app/api/planners/route.ts` | ✅ `https://cai-planners-v2.vercel.app/api/planners`로 프록시 |
| Planners VWorld 서버 | Planners `/api/vworld-map` | ✅ WFS GeoJSON 반환 완료 (이전 작업에서 구현) |
| PNU 추출 | `PlannersPanel.tsx` L617-619 | ✅ PNU 확보 후 `onCadastralDataReceived` 콜백 호출 중 |
| 노드 생성 로직 | `page.tsx` L404-428 | ✅ `cadastral` 노드 생성은 동작하나 PNU만 저장 (GeoJSON 없음) |

### 끊어진 연결 (이번 작업에서 수정)

| 문제 | 파일 (BASE 기준) | 라인 | 상세 |
|------|-----------------|------|------|
| VWorld 프록시 없음 | `app/api/vworld-map/route.ts` | 미존재 | CAI CANVAS → Planners vworld-map 프록시 라우트가 없음 |
| GeoJSON 미수신 | `planners/PlannersPanel.tsx` | L616-619 | PNU 확보 후 WFS 호출 없이 PNU만 콜백으로 전달 |
| GeoJSON 타입/필드 없음 | `types/canvas.ts` | L163 | `CanvasNode`에 `cadastralGeoJson`, `cadastralMapCenter` 필드 없음 |
| GeoJSON 미저장 | `app/page.tsx` | L404-418 | `handleCadastralDataReceived`가 PNU만 저장 |
| iframe 렌더링 | `components/ExpandedView.tsx` | L277-300 | eum.go.kr iframe → SVG 교체 필요 |
| SVG 컴포넌트 없음 | `components/CadastralMapView.tsx` | 미존재 | 지적 경계 SVG 렌더링 컴포넌트 없음 |

---

## 영향 범위

| 파일 | 변경 유형 | BASE 기준 상대경로 |
|------|-----------|-------------------|
| vworld-map 프록시 | **신규** 파일 생성 | `app/api/vworld-map/route.ts` |
| CadastralMapView | **신규** 파일 생성 | `components/CadastralMapView.tsx` |
| CanvasNode 타입 | **수정** (타입 추가 + 필드 2개 추가) | `types/canvas.ts` |
| PlannersPanel | **수정** (import 1줄 + callback 시그니처 + WFS fetch 블록) | `planners/PlannersPanel.tsx` |
| page.tsx | **수정** (import 1개 + 함수 시그니처 + 노드 필드 2개) | `app/page.tsx` |
| ExpandedView | **수정** (import 2줄 + Props 타입 + iframe→SVG 블록 교체) | `components/ExpandedView.tsx` |

---

## TASK 분할

---

### TASK 1: VWorld 프록시 라우트 신규 생성

**목적**: CAI CANVAS → Planners vworld-map 서버-투-서버 통신 경로 확보

**신규 파일 1개**:
- `{BASE}/app/api/vworld-map/route.ts`

**건드리지 말 것**: `app/api/planners/route.ts`, 다른 모든 파일

**패턴 참조**: `app/api/planners/route.ts`와 완전히 동일한 구조. URL만 다름.

#### 정확한 파일 내용

```typescript
import { NextResponse } from 'next/server';

const PLANNERS_BACKEND_URL = 'https://cai-planners-v2.vercel.app';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const res = await fetch(`${PLANNERS_BACKEND_URL}/api/vworld-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[VWorld Proxy] 백엔드 오류:', res.status, text.slice(0, 200));
      return NextResponse.json(
        { error: `VWorld 백엔드 오류 (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[VWorld Proxy] 오류:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

#### 검증 방법
- `POST /api/vworld-map` with `{ "action": "wfs", "pnu": "11680108001021300012" }` 호출 시 GeoJSON 반환되는지 확인

---

### TASK 2: types/canvas.ts에 GeoJSON 타입 + CanvasNode 필드 추가

**목적**: 지적 경계 데이터를 저장할 타입과 필드를 먼저 선언 (이후 TASK들이 모두 이 타입에 의존)

**수정 파일 1개**:
- `{BASE}/types/canvas.ts`

**건드리지 말 것**: 다른 모든 파일

> **⚠️ 이 TASK가 TASK 3~6보다 반드시 먼저 완료되어야 합니다.** 모든 후속 파일이 여기서 정의한 `CadastralGeoJson` 타입을 import합니다.

#### 변경 1: 파일 상단에 타입 추가

**삽입 위치**: L5 (`export interface CanvasEdge {`) 바로 위에 삽입

```typescript
// ── 지적도 GeoJSON 타입 (Planners 백엔드 WFS 응답 구조) ──────────
export interface CadastralFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: Record<string, unknown>;
}

export interface CadastralGeoJson {
  type: 'FeatureCollection';
  features: CadastralFeature[];
}
```

#### 변경 2: CanvasNode 인터페이스에 필드 추가

**파일 위치**: `CanvasNode` 인터페이스 내부, 현재 L163 (`cadastralPnu`) 바로 아래에 2줄 추가

현재:
```typescript
  cadastralPnu?: string;                 // 지적도 노드 전용 — VWorld PNU 코드
  elevationPanelSettings?: ElevationPanelSettings;
```

변경 후:
```typescript
  cadastralPnu?: string;                 // 지적도 노드 전용 — VWorld PNU 코드
  cadastralGeoJson?: CadastralGeoJson | null;              // 지적 경계 GeoJSON
  cadastralMapCenter?: { lng: number; lat: number } | null; // 지도 중심 좌표 (centroid)
  elevationPanelSettings?: ElevationPanelSettings;
```

**중요**: 기존 필드 순서를 바꾸지 마세요. `cadastralPnu` 바로 아래, `elevationPanelSettings` 바로 위에 2줄만 삽입합니다.

#### 검증 방법
- TypeScript 컴파일 에러 없음 확인

---

### TASK 3: CadastralMapView.tsx 신규 생성

**목적**: GeoJSON 지적 경계를 순수 SVG로 렌더링하는 재사용 가능한 컴포넌트

**신규 파일 1개**:
- `{BASE}/components/CadastralMapView.tsx`

**건드리지 말 것**: 다른 모든 파일

**참조**: Planners `src/components/CadastralMiniMap.tsx`와 동일 로직이지만, 타입은 `@/types/canvas`에서 import

> **⚠️ 타입 중복 금지**: `CadastralFeature`/`CadastralGeoJson`을 이 파일 안에 다시 정의하지 마세요. 반드시 `import type { CadastralGeoJson } from '@/types/canvas'`를 사용합니다.

#### 필수 사항

1. **파일 첫 줄**: `'use client';` — Next.js App Router에서 `useState`, `useMemo`, `memo`를 사용하므로 반드시 필요
2. **타입 import**: `import type { CadastralGeoJson } from '@/types/canvas';`
3. **외부 라이브러리 금지**: Leaflet, OpenLayers, MapLibre 등 설치하지 마세요
4. **export**: `export const CadastralMapView = memo(...)` 형태 (named export)

#### 컴포넌트 Props

```typescript
interface CadastralMapViewProps {
  boundary: CadastralGeoJson;
  center: { lng: number; lat: number };
  width?: number;    // 기본값 800
  height?: number;   // 기본값 600
  className?: string;
  tmsType?: 'Base' | 'Satellite' | 'Hybrid';  // 기본값 'Base'
}
```

#### 렌더링 로직

1. **GeoJSON 좌표 → SVG path 변환**:
   - `boundary.features` 배열의 모든 Polygon/MultiPolygon을 순회
   - 각 좌표 `[lng, lat]`를 SVG 좌표로 변환: `x = lng`, `y = -lat` (위도 y축 반전)
   - 모든 좌표의 min/max로 bbox 계산 → SVG `viewBox` 설정
   - bbox에 10% padding 추가 (여백)

2. **배경 TMS 타일**:
   - `center`와 줌레벨(17)로 TMS 타일 좌표 계산
   - URL 형식: `https://xdworld.vworld.kr/2d/{type}/service/{z}/{x}/{y}.{ext}`
     - ext: Base→`png`, Satellite→`jpeg`, Hybrid→`png`
   - `<image>` 요소로 SVG 배경에 삽입
   - 타일 로드 실패 시 `onError`로 `display:none` → 회색 배경 fallback

3. **폴리곤 렌더링**:
   - `<path>` 요소 사용
   - 스타일: `stroke="#EF4444"`, `strokeWidth={2}`, `fill="rgba(239,68,68,0.15)"`
   - `vectorEffect="non-scaling-stroke"` (줌 무관 일정 두께)
   - `d` 속성: `M x1,-y1 L x2,-y2 ... Z` 형식

4. **하단 레이어 컨트롤** (컴포넌트 내부 `useState`):
   - Base / Satellite / Hybrid 버튼 3개
   - 선택된 레이어: `bg-black text-white`
   - 미선택: `bg-neutral-100 text-neutral-500 hover:bg-neutral-200`

5. **SVG 속성**:
   - `preserveAspectRatio="xMidYMid meet"`
   - `aria-label="지적 경계 지도"`
   - `role="img"`
   - `style={{ display: 'block', background: '#e5e7eb' }}`

#### 검증 방법
- TypeScript 컴파일 에러 없음 확인

---

### TASK 4: PlannersPanel.tsx 수정

**목적**: PNU 확보 후 `/api/vworld-map`을 호출해 GeoJSON을 수신하고 callback에 전달

**수정 파일 1개**:
- `{BASE}/planners/PlannersPanel.tsx`

**건드리지 말 것**: `planners/lib/*.ts`, 다른 모든 파일

#### 변경 1: 파일 상단 import 추가

**위치**: 기존 import 블록의 마지막 줄 아래 (L19 `import { fetchRelevantLaws, ... }` 이후)

```typescript
import type { CadastralGeoJson } from '@/types/canvas';
```

#### 변경 2: `PlannersPanelProps` 콜백 시그니처 변경

**위치**: L560

현재 코드 (L560):
```typescript
  onCadastralDataReceived?: (pnu: string | null, landCount: number) => void;
```

변경 후:
```typescript
  onCadastralDataReceived?: (
    pnu: string | null,
    geoJson: CadastralGeoJson | null,
    mapCenter: { lng: number; lat: number } | null,
  ) => void;
```

#### 변경 3: `handleChatSubmit` 내부 — 지적도 블록 교체

**위치**: L616-620 (4줄 블록)

현재 코드 (L616-620):
```typescript
      // 브이월드 결과 1건 이상 수신 시 지적도 아트보드 생성 요청
      if (insightData.categorized.land.length > 0) {
        console.log(`[지적도] 아트보드 생성 시작 — PNU: ${insightData.pnu ?? '없음'}, 브이월드 ${insightData.categorized.land.length}건 반환`);
        onCadastralDataReceived?.(insightData.pnu, insightData.categorized.land.length);
      }
```

변경 후 (위 4줄을 아래 블록으로 교체):
```typescript
      // 브이월드 결과 1건 이상 + PNU 존재 시 → WFS 지적 경계 GeoJSON 조회 후 아트보드 생성
      if (insightData.categorized.land.length > 0 && insightData.pnu) {
        let cadastralGeoJson: CadastralGeoJson | null = null;
        let mapCenter: { lng: number; lat: number } | null = null;

        try {
          const wfsRes = await fetch('/api/vworld-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'wfs', pnu: insightData.pnu }),
          });
          if (wfsRes.ok) {
            const wfsJson = await wfsRes.json();
            cadastralGeoJson = wfsJson?.data ?? null;

            // GeoJSON 첫 번째 feature 좌표에서 centroid 계산
            if (cadastralGeoJson?.features?.[0]?.geometry?.coordinates) {
              const geom = cadastralGeoJson.features[0].geometry;
              const flatCoords: number[][] = geom.type === 'Polygon'
                ? (geom.coordinates as number[][][])[0]
                : (geom.coordinates as number[][][][])[0][0];
              if (flatCoords.length > 0) {
                const sumLng = flatCoords.reduce((s, c) => s + c[0], 0);
                const sumLat = flatCoords.reduce((s, c) => s + c[1], 0);
                mapCenter = { lng: sumLng / flatCoords.length, lat: sumLat / flatCoords.length };
              }
            }
          }
        } catch {
          // WFS 실패해도 토론 생성에는 영향 없음 — geoJson = null 유지
        }

        console.log(`[지적도] 아트보드 생성 — PNU: ${insightData.pnu}, 피처: ${cadastralGeoJson?.features?.length ?? 0}건`);
        onCadastralDataReceived?.(insightData.pnu, cadastralGeoJson, mapCenter);
      }
```

**중요**:
- `handleChatSubmit` 함수의 다른 부분(법령 조회, `/api/planners` 호출 등)은 **절대 수정하지 마세요**
- 위 블록은 기존 L616-620의 4줄을 **교체**하는 것입니다. 앞뒤 코드는 그대로 둡니다
- `insightData.pnu`가 null이면 블록 자체를 건너뜁니다 (기존에는 null PNU도 콜백을 호출했으나, page.tsx에서 이미 `!pnu` 가드가 있으므로 동작 변화 없음)

#### 검증 방법
- TypeScript 컴파일 에러 없음 확인

---

### TASK 5: app/page.tsx 수정

**목적**: `handleCadastralDataReceived`에서 GeoJSON을 `CanvasNode`에 저장

**수정 파일 1개**:
- `{BASE}/app/page.tsx`

**건드리지 말 것**: 다른 모든 파일

#### 변경 1: 파일 상단 import에 `CadastralGeoJson` 추가

**위치**: L6 (기존 `@/types/canvas` import)

현재 코드 (L5-11):
```typescript
import {
  CanvasNode, CanvasEdge, NodeType,
  ArtboardType, NODE_TO_ARTBOARD_TYPE, NODES_THAT_EXPAND,
  NODE_DEFINITIONS, COL_GAP_PX, SketchPanelSettings, PlanPanelSettings, ViewpointPanelSettings,
  NODES_NAVIGATE_DISABLED, NODE_TARGET_ARTBOARD_TYPE,
  PlannerMessage, SavedInsightData, ElevationImages,
} from '@/types/canvas';
```

변경 후 — `CadastralGeoJson`을 추가:
```typescript
import {
  CanvasNode, CanvasEdge, NodeType,
  ArtboardType, NODE_TO_ARTBOARD_TYPE, NODES_THAT_EXPAND,
  NODE_DEFINITIONS, COL_GAP_PX, SketchPanelSettings, PlanPanelSettings, ViewpointPanelSettings,
  NODES_NAVIGATE_DISABLED, NODE_TARGET_ARTBOARD_TYPE,
  PlannerMessage, SavedInsightData, ElevationImages,
  CadastralGeoJson,
} from '@/types/canvas';
```

#### 변경 2: `handleCadastralDataReceived` 함수 수정

**위치**: L404-428 (함수 전체)

현재 코드 (L404-428):
```typescript
  const handleCadastralDataReceived = useCallback((pnu: string | null, _landCount: number) => {
    if (!expandedNodeId || !pnu) return;
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === 'cadastral');
    const num = existing.length + 1;
    const newId = generateId();
    const { position, pushdowns } = placeNewChild(expandedNodeId, currentNodes, currentEdges);
    const newNode: CanvasNode = {
      id: newId, type: 'cadastral',
      title: `지적도 #${num}`,
      position, instanceNumber: num, hasThumbnail: false, artboardType: 'image',
      parentId: expandedNodeId, autoPlaced: true,
      cadastralPnu: pnu,
    };
    let nextNodes = [...currentNodes, newNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }
    const newEdge: CanvasEdge = { id: generateId(), sourceId: expandedNodeId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
  }, [expandedNodeId, nodes, pushHistory]);
```

변경 후 (함수 시그니처 + newNode 객체만 변경, 나머지 로직 동일):
```typescript
  const handleCadastralDataReceived = useCallback((
    pnu: string | null,
    geoJson: CadastralGeoJson | null,
    mapCenter: { lng: number; lat: number } | null,
  ) => {
    if (!expandedNodeId || !pnu) return;
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;
    const existing = currentNodes.filter(n => n.type === 'cadastral');
    const num = existing.length + 1;
    const newId = generateId();
    const { position, pushdowns } = placeNewChild(expandedNodeId, currentNodes, currentEdges);
    const newNode: CanvasNode = {
      id: newId, type: 'cadastral',
      title: `지적도 #${num}`,
      position, instanceNumber: num, hasThumbnail: false, artboardType: 'image',
      parentId: expandedNodeId, autoPlaced: true,
      cadastralPnu: pnu,
      cadastralGeoJson: geoJson,
      cadastralMapCenter: mapCenter,
    };
    let nextNodes = [...currentNodes, newNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }
    const newEdge: CanvasEdge = { id: generateId(), sourceId: expandedNodeId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
  }, [expandedNodeId, nodes, pushHistory]);
```

**변경 포인트 3곳만**:
1. 함수 시그니처: `(pnu, _landCount)` → `(pnu, geoJson, mapCenter)`
2. newNode에 `cadastralGeoJson: geoJson,` 추가
3. newNode에 `cadastralMapCenter: mapCenter,` 추가

나머지(existing 필터, placeNewChild, pushdowns, pushHistory 등)는 **한 글자도 바꾸지 마세요**.

#### 검증 방법
- TypeScript 컴파일 에러 없음 확인
- `onCadastralDataReceived={handleCadastralDataReceived}` prop 타입 자동 일치 확인

---

### TASK 6: ExpandedView.tsx 수정

**목적**: `cadastral` 노드의 eum.go.kr iframe을 SVG 렌더링으로 교체

**수정 파일 1개**:
- `{BASE}/components/ExpandedView.tsx`

**건드리지 말 것**: planners 전용 뷰, sketch 전용 뷰, print 전용 뷰 등 다른 모든 블록

#### 변경 1: import 추가

**위치**: L14 (마지막 import 줄) 아래에 추가

```typescript
import { CadastralMapView } from '@/components/CadastralMapView';
import type { CadastralGeoJson } from '@/types/canvas';
```

#### 변경 2: Props 인터페이스의 콜백 타입 변경

**위치**: L43

현재 코드 (L43):
```typescript
  onCadastralDataReceived?: (pnu: string | null, landCount: number) => void;
```

변경 후:
```typescript
  onCadastralDataReceived?: (
    pnu: string | null,
    geoJson: CadastralGeoJson | null,
    mapCenter: { lng: number; lat: number } | null,
  ) => void;
```

#### 변경 3: 지적도 전용 뷰 블록 교체

**위치**: L276-300 (블록 전체를 교체)

현재 코드 (L276-300):
```tsx
  /* ── 지적도 전용 뷰 ─────────────────────────────────────────────── */
  if (node.type === 'cadastral') {
    const pnu = node.cadastralPnu ?? null;
    const iframeSrc = pnu
      ? `https://www.eum.go.kr/web/ar/lu/luLandUseIndex.jsp?pnu=${pnu}`
      : null;
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)' }}>
          {iframeSrc ? (
            <iframe
              src={iframeSrc}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="토지이음 지적도"
            />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>PNU 코드가 없습니다</span>
            </div>
          )}
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse} />
      </div>
    );
  }
```

변경 후:
```tsx
  /* ── 지적도 전용 뷰 (VWorld WFS SVG 렌더링) ────────────────────── */
  if (node.type === 'cadastral') {
    const boundary = node.cadastralGeoJson ?? null;
    const center   = node.cadastralMapCenter ?? null;

    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-app-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, right: 'calc(var(--sidebar-w) + 2rem)', display: 'flex', flexDirection: 'column' }}>
          {boundary && center && boundary.features.length > 0 ? (
            <CadastralMapView
              boundary={boundary}
              center={center}
              className="w-full h-full"
            />
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <span className="text-body-3" style={{ color: 'var(--color-gray-300)' }}>
                {node.cadastralPnu ? '지적 경계 데이터를 불러올 수 없습니다' : 'PNU 코드가 없습니다'}
              </span>
            </div>
          )}
        </div>
        <ExpandedSidebar currentNodeType={node.type} onCollapse={onCollapse} />
      </div>
    );
  }
```

**변경 포인트**:
- `pnu` / `iframeSrc` 변수 → `boundary` / `center` 변수
- `<iframe>` → `<CadastralMapView>` 교체
- GeoJSON 없음 fallback 문구: `'지적 경계 데이터를 불러올 수 없습니다'` (로딩 중 아님, fetch 실패 상태)
- `boundary.features.length > 0` 가드 추가 (빈 FeatureCollection 방어)
- 외부 `<div>` 구조와 `<ExpandedSidebar>`는 그대로 유지

---

### TASK 7: TypeScript 컴파일 검증

**파일 수정 없음** — 검증만 수행

```bash
cd {BASE}
node node_modules/typescript/bin/tsc --noEmit
```

에러 없음 확인 후 커밋.

---

## 실행 순서 (엄격한 순서 — 건너뛰기 금지)

```
TASK 1 → TASK 2 → TASK 3 → TASK 4 → TASK 5 → TASK 6 → TASK 7
```

> **의존 관계**:
> - TASK 2가 반드시 TASK 3보다 먼저 (타입 정의 → 타입 사용)
> - TASK 4, 5, 6은 모두 TASK 2의 `CadastralGeoJson` 타입에 의존
> - TASK 1은 독립적이나 순서대로 진행이 안전

각 TASK 완료 후 TypeScript 컴파일 에러 없음을 확인한 뒤 다음 TASK로 진행합니다.

---

## 검증 체크리스트

1. **정상 케이스**: 주소 포함 안건 입력 (예: "서울특별시 강남구 논현로128길 24-1 오피스 빌딩 신축")
   - [ ] `planners` 노드에서 토론 생성 후 `cadastral` 노드가 캔버스에 자동 생성됨
   - [ ] `cadastral` 노드 expand 시 SVG 지적 경계 폴리곤(빨간선) 표시됨
   - [ ] Base / Satellite / Hybrid 버튼 클릭 시 배경 타일 전환됨

2. **PNU 없는 안건**: 주소 없는 입력 (예: "건축법 제44조에 대해 분석해주세요")
   - [ ] `cadastral` 노드 미생성
   - [ ] 기존 Planners 토론 생성 정상 동작

3. **VWorld API 실패** (API 키 미설정 또는 네트워크 오류):
   - [ ] `cadastral` 노드는 생성되되 GeoJSON=null
   - [ ] expand 시 "지적 경계 데이터를 불러올 수 없습니다" 문구 표시
   - [ ] 토론 생성에 영향 없음

4. **TypeScript 컴파일**:
   - [ ] `tsc --noEmit` 에러 없음

---

## Progress

- [x] 2026-04-27 — TASK 1: `app/api/vworld-map/route.ts` 신규 생성
- [x] 2026-04-27 — TASK 2: `types/canvas.ts` CadastralGeoJson 타입 + CanvasNode 필드 추가
- [x] 2026-04-27 — TASK 3: `components/CadastralMapView.tsx` 신규 생성
- [x] 2026-04-27 — TASK 4: `planners/PlannersPanel.tsx` WFS fetch + callback 변경
- [x] 2026-04-27 — TASK 5: `app/page.tsx` handleCadastralDataReceived GeoJSON 저장
- [x] 2026-04-27 — TASK 6: `components/ExpandedView.tsx` iframe → SVG 교체
- [x] 2026-04-27 — TASK 7: TypeScript 컴파일 검증 (에러 없음)
- [ ] 2026-04-27 — git commit & push

---

## Surprises & Discoveries

- CAI CANVAS 지적도 구현이 eum.go.kr iframe에 의존하고 있었음 (404 근본 원인)
- Planners `/api/vworld-map`은 이미 완성되어 있고 WFS 7건 반환 확인됨
- CAI CANVAS에 Planners 프록시(`/api/planners/route.ts`) 패턴이 이미 존재 → 동일 패턴으로 vworld-map 프록시 추가 가능
- TMS 배경 타일(`xdworld.vworld.kr`)은 정적 CDN이므로 프록시 불필요, 클라이언트에서 직접 URL 조합
- Sonnet 초안에서 타입 중복 정의(canvas.ts + CadastralMapView.tsx), `'use client'` 누락, 실패 문구 오해 소지 등 4건 발견 → Opus 검토 후 수정 반영

---

## Decision Log

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-27 | eum.go.kr iframe 완전 제거, WFS SVG로 교체 | 외부 서비스 의존 → 404 빈번. 자체 VWorld WFS 렌더링이 안정적 |
| 2026-04-27 | `CadastralGeoJson` 타입을 `types/canvas.ts`에 단일 정의 | 타입 중복 방지. 모든 소비자가 여기서 import |
| 2026-04-27 | TMS 타일은 프록시 없이 클라이언트에서 직접 호출 | 정적 CDN URL, API 키 불필요, CORS 제한 없음 |
| 2026-04-27 | WFS fetch를 PlannersPanel 내에서 처리 | 법령 데이터 조회 직후 PNU 확보 → 동일 흐름에서 연속 처리가 자연스러움 |
| 2026-04-27 | TASK 실행 순서를 타입(TASK 2) → 소비자(TASK 3~6)로 재배치 | Sonnet 초안은 TASK 2(컴포넌트)→TASK 3(타입) 순서였으나, 타입이 먼저 존재해야 import 가능 |

---

## Outcomes & Retrospective

작업 완료 후 작성합니다.

- **원래 목표 달성 여부**: [ ] Yes  [ ] Partial  [ ] No
- **결과 요약**:
- **다음 작업에 반영할 것**: 썸네일 생성 (NodeCard.tsx에 지적도 SVG 미리보기 — 별도 작업)

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
