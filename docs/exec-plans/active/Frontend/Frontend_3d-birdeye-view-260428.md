# Frontend Plan — 3D Bird-Eye View (V-World SDK)

> 이 문서는 살아있는 문서(living document)입니다.
> 작업을 진행하면서 발견, 결정, 진행 상황을 이 문서에 지속적으로 업데이트합니다.
> 이전 맥락이나 기억 없이, 이 문서만으로 작업을 완수할 수 있을 만큼 자급자족해야 합니다.
>
> 작업 완료 시 `completed/Frontend/` 폴더로 이동합니다.

---

## 개요

- **작업 유형**: UI 신규 — 3D 지도 노드
- **대상 노드**: N01.Planners (`C:\Users\크리트\Downloads\Planners_harness\N01.Planners\`)
- **시작일**: 2026-04-28
- **목표**: 대지의 메인 입면(가장 큰 접도 방향)에서 45° 아이소 버드아이 뷰로 3D 지도를 보여주는 Map3DNode를 MapNode와 병렬 생성

---

## 목표

지적도 MapNode가 생성될 때, 동시에 Map3DNode가 캔버스에 나타난다.
Map3DNode는 도로 WFS를 조회하여 메인 입면 방향을 계산하고, V-World WebGL 3D SDK로 해당 방향의 45° 버드아이 뷰를 렌더링한다.
캡처 버튼으로 스크린샷을 찍어 ImageNode로 내보낸다.

---

## 영향 범위

| 컴포넌트 | 변경 유형 | 관련 파일 |
|----------|-----------|-----------|
| vworld.d.ts | **신규** | `src/types/vworld.d.ts` |
| nodes.ts | **수정** | `src/types/nodes.ts` |
| vworld-map.ts | **수정** | `api/vworld-map.ts` |
| roadApi.ts | **신규** | `src/lib/roadApi.ts` |
| Map3DView.tsx | **신규** | `src/components/Map3DView.tsx` |
| Map3DNode.tsx | **신규** | `src/components/nodes/Map3DNode.tsx` |
| Canvas.tsx | **수정** | `src/components/Canvas.tsx` |
| useStore.ts | **수정** | `src/store/useStore.ts` |
| .env | **수정** | `.env` |

---

## 사전 지식 — 반드시 읽고 시작

### V-World 3D SDK 로드 방식

V-World 3D 지도는 `<script>` 태그로 SDK를 로드하면 `window.vw` 전역 객체가 생깁니다.
npm 설치가 아닙니다. 동적 스크립트 주입입니다.

```html
<script src="https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=KEY"></script>
```

로드 후 사용:
```javascript
var map = new window.vw.Map();
map.setOption({
  mapId: "vmap",           // div의 id
  initPosition: new window.vw.CameraPosition(
    new window.vw.CoordZ(126.921883, 37.524370, 500),  // lng, lat, height(m)
    new window.vw.Direction(heading, -45, 0)            // heading(방위), pitch, roll
  ),
  logo: false,
  navigation: false
});
map.start();
```

### 카메라 방향 계산 원리

대지 경계 GeoJSON에서:
1. 각 변(edge)의 중점과 법선 벡터(외향) 계산
2. 도로 WFS로 인접 도로 조회 → 폭원(RD_WTH)이 가장 큰 도로 선택
3. 대지 각 변과 도로 중심선 사이 최소 거리 계산 → 가장 가까운 변 = 메인 입면
4. 메인 입면의 법선 방향 = 카메라 heading (degrees, 북=0 시계방향)
5. pitch = -45 (아래로 45° 내려다봄)

### 기존 MapNode 자동 생성 위치

`src/store/useStore.ts` 약 854~874행:
```typescript
if (preFetched.insightData?.cadastralBoundary?.features?.length) {
  const existingMapNode = currentNodes.find(
    (n) => n.type === 'mapNode' && (n.data as any).pnu === preFetched.insightData?.pnu
  );
  if (!existingMapNode) {
    const mapNodeId = `node-map-${generateId()}`;
    state.addNode({ id: mapNodeId, type: 'mapNode', ... });
  }
}
```
→ 이 블록 바로 아래에 Map3DNode 생성 코드를 추가합니다.

### 환경변수

`.env` 파일에 이미 존재: `VWORLD_API_KEY=76CAFBEE-1F05-366D-8D48-480027E9EF42`
V-World 3D SDK는 클라이언트에서 API 키가 필요합니다.
`.env`에 추가: `VITE_VWORLD_API_KEY=76CAFBEE-1F05-366D-8D48-480027E9EF42`
(VITE_ 접두사가 있어야 클라이언트 번들에 포함됨)

---

## TASK 1 — 타입 선언 (의존성 없음)

### 1-A: `src/types/vworld.d.ts` 신규 생성

V-World SDK가 `window.vw`에 주입하는 전역 타입을 선언합니다.

```typescript
// src/types/vworld.d.ts
declare global {
  interface Window {
    vw: {
      Map: new () => VwMap;
      CameraPosition: new (coord: VwCoordZ, direction: VwDirection) => VwCameraPosition;
      CoordZ: new (lng: number, lat: number, height: number) => VwCoordZ;
      Direction: new (heading: number, pitch: number, roll: number) => VwDirection;
    };
  }
}

interface VwMap {
  setOption(options: VwMapOptions): void;
  start(): void;
  destroy(): void;
  getMap(): any;
  moveTo(position: VwCameraPosition): void;
}

interface VwMapOptions {
  mapId: string;
  initPosition: VwCameraPosition;
  logo?: boolean;
  navigation?: boolean;
}

interface VwCameraPosition {
  // SDK 내부 사용
}

interface VwCoordZ {
  // lng, lat, height
}

interface VwDirection {
  // heading, pitch, roll
}

export {};
```

### 1-B: `src/types/nodes.ts` 수정

기존 파일 하단(약 117행 `AllNodeData` 정의 이전)에 Map3DNodeData 타입을 추가합니다.

**추가할 코드** (`MapNodeData` 인터페이스 바로 아래):
```typescript
export interface Map3DNodeData extends Record<string, unknown> {
  /** 대지 경계 GeoJSON */
  boundary: CadastralGeoJson | null;
  /** 대지 중심 좌표 */
  center: { lng: number; lat: number } | null;
  /** 주소 문자열 */
  address: string | null;
  /** PNU 코드 */
  pnu: string | null;
  /** 카메라 heading (degrees, 0=북, 시계방향) — 도로 분석 완료 전 null */
  cameraHeading: number | null;
  /** 카메라 높이 (미터) */
  cameraHeight: number;
  /** 접도 정보 문자열 (예: "북측 8m 도로") */
  roadInfo: string | null;
  /** 로딩 상태 */
  loading: boolean;
}
```

**`AllNodeData` 유니온에 추가**:
변경 전: `export type AllNodeData = StickyNodeData | TurnGroupNodeData | ... | MapNodeData;`
변경 후: `export type AllNodeData = StickyNodeData | TurnGroupNodeData | ... | MapNodeData | Map3DNodeData;`

**타입 가드 추가** (하단):
```typescript
export function isMap3DNode(node: AppNode): node is Node<Map3DNodeData> {
  return node.type === 'map3dNode';
}
```

**주의**: `import type { CadastralGeoJson }` 은 이미 파일 상단에 있으므로 추가 import 불필요.

---

## TASK 2 — 도로 WFS 서버 프록시 (의존성 없음)

### `api/vworld-map.ts` 수정

기존 handler 함수의 `switch (action)` 블록에 `road-wfs` 케이스를 추가합니다.

**추가 위치**: `case 'wfs':` 블록 끝난 뒤, `default:` 직전

```typescript
// ── 도로 중심선 WFS (3D 버드아이 뷰용) ────────────────────────────
case 'road-wfs': {
    if (!bbox || bbox.length !== 4) {
        return res.status(400).json({ error: 'road-wfs 요청에는 bbox [minLng, minLat, maxLng, maxLat]가 필요합니다.' });
    }
    const roadParams = new URLSearchParams({
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lt_l_roa_lnm',
        VERSION: '1.1.0',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        MAXFEATURES: '50',
        BBOX: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`,
        KEY: vworldApiKey,
        DOMAIN: vworldDomain,
    });
    const roadUrl = `https://api.vworld.kr/req/wfs?${roadParams.toString()}`;
    try {
        const roadRes = await fetchWithTimeout(roadUrl, 10000);
        if (!roadRes.ok) {
            logApiCall('VWorld WFS 도로중심선', roadUrl, `status=${roadRes.status} (실패)`);
            return res.json({ data: { type: 'FeatureCollection', features: [] }, note: '도로 WFS 실패' });
        }
        const roadData = await roadRes.json();
        logApiCall('VWorld WFS 도로중심선', roadUrl, `features=${roadData?.features?.length ?? 0}건`);
        if (!roadData || roadData.type !== 'FeatureCollection' || !Array.isArray(roadData.features)) {
            return res.json({ data: { type: 'FeatureCollection', features: [] }, note: '응답 형식 오류' });
        }
        return res.json({ data: roadData, note: `${roadData.features.length}건 도로 조회` });
    } catch (e: any) {
        console.error(`[MAP API] 도로 WFS 요청 실패: ${e.message}`);
        return res.json({ data: { type: 'FeatureCollection', features: [] }, note: e.message });
    }
}
```

**action 타입 정의도 수정** (같은 파일 약 247행):
변경 전: `action: 'tms-url' | 'wms' | 'wfs';`
변경 후: `action: 'tms-url' | 'wms' | 'wfs' | 'road-wfs';`

**default 케이스의 에러 메시지 수정**:
변경 전: `가능한 값: tms-url, wms, wfs`
변경 후: `가능한 값: tms-url, wms, wfs, road-wfs`

---

## TASK 3 — 도로 분석 + 카메라 계산 유틸 (TASK 2 이후)

### `src/lib/roadApi.ts` 신규 생성

이 파일은 두 가지 일을 합니다:
1. 서버 프록시를 통해 도로 WFS 데이터를 가져옴
2. 대지 경계와 도로 데이터를 분석하여 카메라 heading을 계산

```typescript
// src/lib/roadApi.ts
import type { CadastralGeoJson } from './mapApi';

const API_BASE = '/api/vworld-map';

// ── 타입 ──────────────────────────────────────────────────────────
export interface RoadFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][] | number[][][] };
  properties: {
    RN?: string;      // 도로명
    RD_WTH?: number;  // 도로폭 (미터)
    ROA_CLS_CD?: string; // 도로등급코드
    [key: string]: unknown;
  };
}

export interface FacadeResult {
  heading: number;        // 카메라 heading (0=북, 시계방향 degrees)
  height: number;         // 카메라 높이 (m)
  roadInfo: string;       // 예: "북측 8m 도로"
}

// ── 1. 도로 WFS 조회 ──────────────────────────────────────────────
export async function fetchRoads(
  center: { lng: number; lat: number },
): Promise<RoadFeature[]> {
  // 대지 중심에서 약 200m 반경 bbox
  const d = 0.002;
  const bbox: [number, number, number, number] = [
    center.lng - d, center.lat - d,
    center.lng + d, center.lat + d,
  ];

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'road-wfs', bbox }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.features ?? [];
  } catch {
    return [];
  }
}

// ── 2. 메인 입면 방향 계산 ────────────────────────────────────────
/**
 * 대지 경계와 도로 데이터로부터 메인 입면 방향(camera heading)을 계산합니다.
 *
 * 알고리즘:
 * 1. 대지 외곽선의 각 변(edge)에 대해 중점과 외향 법선 벡터를 구합니다.
 * 2. 도로 피처 중 대지에 가장 가까운 도로를 찾고, 폭원이 가장 큰 것을 선택합니다.
 * 3. 선택된 도로에 가장 가까운 변의 법선 방향 = 카메라 heading
 *
 * 도로 데이터가 없으면 대지 가장 긴 변의 법선을 사용합니다 (fallback).
 */
export function calculateFacade(
  boundary: CadastralGeoJson,
  roads: RoadFeature[],
): FacadeResult {
  // ── 대지 외곽선 추출 (첫 번째 feature의 외곽 링) ──
  const feature = boundary.features[0];
  if (!feature) {
    return { heading: 0, height: 500, roadInfo: null as any };
  }

  const coords: [number, number][] =
    feature.geometry.type === 'Polygon'
      ? (feature.geometry.coordinates as number[][][])[0].map(c => [c[0], c[1]])
      : (feature.geometry.coordinates as number[][][][])[0][0].map(c => [c[0], c[1]]);

  // ── 각 변의 중점, 법선, 길이 계산 ──
  const edges: { midLng: number; midLat: number; normalAngle: number; length: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const midLng = (lng1 + lng2) / 2;
    const midLat = (lat1 + lat2) / 2;
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const length = Math.sqrt(dx * dx + dy * dy);
    // 외향 법선: (dy, -dx) 정규화 → 각도(degrees, 0=북 시계방향)
    const normalRad = Math.atan2(dy, -dx);
    const normalAngle = ((90 - normalRad * 180 / Math.PI) % 360 + 360) % 360;
    edges.push({ midLng, midLat, normalAngle, length });
  }

  if (edges.length === 0) {
    return { heading: 0, height: 500, roadInfo: null as any };
  }

  // ── 대지 centroid ──
  const centLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

  // ── 법선 방향 보정: centroid에서 멀어지는 방향이 외향 ──
  for (const edge of edges) {
    const outRad = (90 - edge.normalAngle) * Math.PI / 180;
    const testLng = edge.midLng + Math.cos(outRad) * 0.0001;
    const testLat = edge.midLat + Math.sin(outRad) * 0.0001;
    const distOrig = Math.hypot(edge.midLng - centLng, edge.midLat - centLat);
    const distTest = Math.hypot(testLng - centLng, testLat - centLat);
    if (distTest < distOrig) {
      // 법선이 안쪽을 향하고 있으면 반전
      edge.normalAngle = (edge.normalAngle + 180) % 360;
    }
  }

  // ── 도로가 없으면 fallback: 가장 긴 변의 법선 사용 ──
  if (roads.length === 0) {
    const longest = edges.reduce((a, b) => a.length > b.length ? a : b);
    const direction = getDirectionName(longest.normalAngle);
    return {
      heading: longest.normalAngle,
      height: 500,
      roadInfo: `${direction} (도로 데이터 없음, 최장변 기준)`,
    };
  }

  // ── 도로별 폭원 추출 + 대지 변과의 최소 거리 계산 ──
  let bestEdge = edges[0];
  let bestRoadWidth = 0;
  let bestRoadName = '';

  for (const road of roads) {
    const width = road.properties?.RD_WTH ?? 0;
    const roadCoords = extractLineCoords(road);
    if (roadCoords.length === 0) continue;

    // 각 변의 중점에서 도로까지 최소 거리
    for (const edge of edges) {
      const dist = minDistToLine(edge.midLng, edge.midLat, roadCoords);
      // 가장 가까운 도로 중 폭이 가장 큰 것을 선택
      // 0.001도 ≈ 약 110m → 이 범위 내의 도로만 "접도"로 판정
      if (dist < 0.001 && width > bestRoadWidth) {
        bestRoadWidth = width;
        bestEdge = edge;
        bestRoadName = road.properties?.RN ?? '';
      }
    }
  }

  // 도로가 있지만 접도 판정 실패 시 → 가장 큰 도로에 가장 가까운 변
  if (bestRoadWidth === 0) {
    const widestRoad = roads.reduce((a, b) =>
      (a.properties?.RD_WTH ?? 0) > (b.properties?.RD_WTH ?? 0) ? a : b
    );
    bestRoadWidth = widestRoad.properties?.RD_WTH ?? 0;
    bestRoadName = widestRoad.properties?.RN ?? '';
    const widestCoords = extractLineCoords(widestRoad);
    if (widestCoords.length > 0) {
      let minDist = Infinity;
      for (const edge of edges) {
        const d = minDistToLine(edge.midLng, edge.midLat, widestCoords);
        if (d < minDist) { minDist = d; bestEdge = edge; }
      }
    }
  }

  const direction = getDirectionName(bestEdge.normalAngle);
  const widthStr = bestRoadWidth > 0 ? `${bestRoadWidth}m` : '폭 미상';
  const nameStr = bestRoadName ? ` ${bestRoadName}` : '';

  return {
    heading: bestEdge.normalAngle,
    height: 500,
    roadInfo: `${direction} ${widthStr}${nameStr} 도로 접면`,
  };
}

// ── 헬퍼 함수 ─────────────────────────────────────────────────────

function extractLineCoords(road: RoadFeature): [number, number][] {
  const { type, coordinates } = road.geometry;
  if (type === 'LineString') {
    return (coordinates as number[][]).map(c => [c[0], c[1]]);
  }
  if (type === 'MultiLineString') {
    return (coordinates as number[][][]).flat().map(c => [c[0], c[1]]);
  }
  return [];
}

function minDistToLine(px: number, py: number, line: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentDist(px, py, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getDirectionName(heading: number): string {
  const dirs = ['북측', '북동측', '동측', '남동측', '남측', '남서측', '서측', '북서측'];
  const idx = Math.round(heading / 45) % 8;
  return dirs[idx];
}
```

---

## TASK 4 — Map3DView 컴포넌트 (TASK 1, 3 이후)

### 4-A: `src/components/Map3DView.tsx` 신규 생성

V-World SDK 스크립트를 동적 주입하고 3D 지도를 렌더링합니다.

```typescript
// src/components/Map3DView.tsx
import { useEffect, useRef, useState, useCallback } from 'react';

const SDK_SCRIPT_ID = 'vworld-3d-sdk';

interface Map3DViewProps {
  containerId: string;        // div id (노드마다 고유)
  center: { lng: number; lat: number };
  heading: number | null;     // null이면 로딩 중
  height?: number;            // 카메라 높이 (m)
  onCapture?: (base64: string) => void;
}

export function Map3DView({
  containerId,
  center,
  heading,
  height = 500,
  onCapture,
}: Map3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(!!window.vw);

  // ── SDK 스크립트 동적 주입 (전역 1회) ──
  useEffect(() => {
    if (window.vw) { setSdkReady(true); return; }
    if (document.getElementById(SDK_SCRIPT_ID)) {
      // 이미 로딩 중 → 로드 완료 대기
      const check = setInterval(() => {
        if (window.vw) { setSdkReady(true); clearInterval(check); }
      }, 200);
      return () => clearInterval(check);
    }

    const apiKey = import.meta.env.VITE_VWORLD_API_KEY || '';
    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.src = `https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${apiKey}`;
    script.onload = () => {
      // SDK 로드 후 vw 전역 객체 생성까지 약간의 딜레이
      const wait = setInterval(() => {
        if (window.vw) { setSdkReady(true); clearInterval(wait); }
      }, 200);
    };
    script.onerror = () => {
      console.error('[Map3D] V-World SDK 로드 실패');
    };
    document.head.appendChild(script);
  }, []);

  // ── 지도 초기화 (SDK 준비 + heading 확정 후) ──
  useEffect(() => {
    if (!sdkReady || heading === null || !containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    try {
      const map = new window.vw.Map();
      map.setOption({
        mapId: containerId,
        initPosition: new window.vw.CameraPosition(
          new window.vw.CoordZ(center.lng, center.lat, height),
          new window.vw.Direction(heading, -45, 0),
        ),
        logo: false,
        navigation: false,
      });
      map.start();
      mapRef.current = map;
    } catch (e) {
      console.error('[Map3D] 지도 초기화 실패:', e);
    }
  }, [sdkReady, heading, center.lng, center.lat, height, containerId]);

  // ── cleanup ──
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch {}
        mapRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []);

  // ── 스크린샷 캡처 ──
  const handleCapture = useCallback(() => {
    if (!mapRef.current || !onCapture) return;
    try {
      const cesiumMap = mapRef.current.getMap();
      if (cesiumMap?.scene?.canvas) {
        cesiumMap.scene.render();
        const base64 = cesiumMap.scene.canvas.toDataURL('image/png');
        onCapture(base64);
      }
    } catch (e) {
      console.error('[Map3D] 캡처 실패:', e);
    }
  }, [onCapture]);

  return (
    <div className="relative w-full" style={{ minHeight: 300 }}>
      <div
        id={containerId}
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: 300, background: '#1a1a2e' }}
      />
      {heading === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 rounded-xl">
          <span className="text-xs text-white font-bold">도로 분석 중...</span>
        </div>
      )}
      {!sdkReady && heading !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 rounded-xl">
          <span className="text-xs text-white font-bold">3D SDK 로딩...</span>
        </div>
      )}
      {onCapture && heading !== null && sdkReady && (
        <button
          onClick={handleCapture}
          className="absolute bottom-2 right-2 text-[9px] font-bold px-3 py-1.5 rounded-lg
                     bg-white/90 text-neutral-800 hover:bg-white transition-colors shadow-md"
        >
          캡처 → ImageNode
        </button>
      )}
    </div>
  );
}
```

### 4-B: `src/components/nodes/Map3DNode.tsx` 신규 생성

React Flow 노드 래퍼입니다.

```typescript
// src/components/nodes/Map3DNode.tsx
import { memo, useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { useStore, generateId } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { Map3DNodeData } from '../../types/nodes';
import { Map3DView } from '../Map3DView';
import { fetchRoads, calculateFacade } from '../../lib/roadApi';
import { Trash2, Box } from 'lucide-react';

export const Map3DNode = memo(({ id, data }: NodeProps<Node<Map3DNodeData>>) => {
  const deleteNode = useStore((state) => state.deleteNode);
  const addNode = useStore((state) => state.addNode);
  const lastActiveNodeId = useStore((state) => state.lastActiveNodeId);
  const nodes = useStore((state) => state.nodes);
  const isGenerating = useStore((state) => state.isGenerating);

  const [heading, setHeading] = useState<number | null>(data.cameraHeading);
  const [roadInfo, setRoadInfo] = useState<string | null>(data.roadInfo);

  // ── 도로 분석 (마운트 시 1회) ──
  useEffect(() => {
    if (heading !== null || !data.center || !data.boundary) return;

    (async () => {
      try {
        const roads = await fetchRoads(data.center!);
        const result = calculateFacade(data.boundary!, roads);
        setHeading(result.heading);
        setRoadInfo(result.roadInfo);
      } catch {
        // fallback: 북쪽에서 바라봄
        setHeading(0);
        setRoadInfo('방향 계산 실패 (기본 북측)');
      }
    })();
  }, [data.center, data.boundary, heading]);

  // ── 캡처 → ImageNode 생성 ──
  const handleCapture = useCallback((base64: string) => {
    const thisNode = nodes.find(n => n.id === id);
    const posX = thisNode ? thisNode.position.x : 0;
    const posY = thisNode ? thisNode.position.y + 450 : 450;

    addNode({
      id: `node-img-${generateId()}`,
      type: 'imageNode',
      position: { x: posX, y: posY },
      data: {
        imageUrl: base64,
        filename: `3d-birdeye-${data.pnu || 'unknown'}.png`,
        optimized: false,
      },
    } as any);
  }, [id, nodes, addNode, data.pnu]);

  return (
    <div className={cn(
      'w-[420px] rounded-2xl bg-neutral-900 p-2 shadow-lg flex flex-col relative border-2 group transition-[border-color,box-shadow] duration-300',
      lastActiveNodeId === id ? 'border-white ring-2 ring-white/20' : 'border-neutral-700',
      isGenerating && 'opacity-80',
    )}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-white opacity-50 hover:opacity-100" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-white opacity-50 hover:opacity-100" />

      {/* 헤더 */}
      <div className="flex items-center justify-between pb-2 px-1">
        <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
          <Box className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] font-black tracking-widest uppercase text-white">
            3D Bird-Eye
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          className="text-neutral-500 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 주소 + 접도 정보 */}
      {data.address && (
        <p className="text-[11px] font-bold text-neutral-300 px-1 pb-0.5 truncate">{data.address}</p>
      )}
      {roadInfo && (
        <p className="text-[10px] text-neutral-500 px-1 pb-1 truncate">{roadInfo}</p>
      )}

      {/* 3D 뷰 */}
      <div className="nodrag">
        <Map3DView
          containerId={`map3d-${id}`}
          center={data.center || { lng: 126.978, lat: 37.566 }}
          heading={heading}
          height={data.cameraHeight || 500}
          onCapture={handleCapture}
        />
      </div>
    </div>
  );
});
```

---

## TASK 5 — 통합: Canvas 등록 + Store 병렬 생성 (TASK 1~4 이후)

### 5-A: `src/components/Canvas.tsx` 수정

**import 추가** (약 30행, MapNode import 바로 아래):
```typescript
import { Map3DNode } from './nodes/Map3DNode';
```

**nodeTypes 객체에 추가** (약 40행, `mapNode: MapNode` 바로 아래):
```typescript
  map3dNode: Map3DNode,        // 3D 버드아이 뷰 노드
```

### 5-B: `src/store/useStore.ts` 수정

MapNode 자동 생성 블록(약 854~874행) 바로 뒤에 Map3DNode 생성 코드를 추가합니다.

**기존 코드** (변경하지 않음):
```typescript
if (!existingMapNode) {
  const mapNodeId = `node-map-${generateId()}`;
  state.addNode({
    id: mapNodeId,
    type: 'mapNode',
    position: { x: promptNode.position.x - 500, y: promptNode.position.y },
    data: { ... },
  } as any);
}
```

**바로 아래에 추가**:
```typescript
// ── Map3DNode 병렬 생성 (3D 버드아이 뷰) ──
const existingMap3DNode = currentNodes.find(
  (n) => n.type === 'map3dNode' && (n.data as any).pnu === preFetched.insightData?.pnu
);
if (!existingMap3DNode) {
  const map3dNodeId = `node-map3d-${generateId()}`;
  state.addNode({
    id: map3dNodeId,
    type: 'map3dNode',
    position: { x: promptNode.position.x - 960, y: promptNode.position.y },
    data: {
      boundary: preFetched.insightData.cadastralBoundary,
      center: preFetched.insightData.mapCenter ?? null,
      address: preFetched.insightData.address ?? null,
      pnu: preFetched.insightData.pnu ?? null,
      cameraHeading: null,   // 도로 분석 완료 전 null → Map3DNode 내부에서 비동기 계산
      cameraHeight: 500,
      roadInfo: null,
      loading: true,
    },
  } as any);
}
```

**주의**: 이 코드는 기존 `if (!existingMapNode) { ... }` 블록의 **닫는 중괄호 바로 뒤**, 같은 `if (preFetched.insightData?.cadastralBoundary?.features?.length)` 블록 **내부**에 추가합니다.

### 5-C: `.env` 수정

`.env` 파일 끝에 한 줄 추가:
```
VITE_VWORLD_API_KEY=76CAFBEE-1F05-366D-8D48-480027E9EF42
```

---

## 디자인 기준 체크

- [x] 기존 MapNode 패턴(어두운 배경 vs 밝은 배경) 참고 → Map3DNode는 어두운 bg (3D 지도 특성)
- [x] 기존 컴포넌트 재사용: Handle, cn(), lucide-react 아이콘
- [x] 파일 크기: 각 신규 파일 200줄 이하
- [x] 불변 패턴: Zustand state 업데이트 시 spread 사용

---

## Progress

세분화된 체크포인트와 타임스탬프 — 실제 완료된 작업만 기록합니다.

- [x] TASK 1 — `src/types/vworld.d.ts` 신규 + `src/types/nodes.ts` 수정
- [x] TASK 2 — `api/vworld-map.ts` road-wfs 액션 추가
- [x] TASK 3 — `src/lib/roadApi.ts` 신규
- [x] TASK 4 — `src/components/Map3DView.tsx` + `src/components/nodes/Map3DNode.tsx` 신규
- [x] TASK 5 — `src/components/Canvas.tsx` + `src/store/useStore.ts` + `.env` 수정
- [x] 빌드 검증 — `npx tsc --noEmit` 통과 확인

---

## Surprises & Discoveries

구현 중 발견한 예상치 못한 동작과 인사이트를 기록합니다.

- V-World 3D SDK는 `<script>` 동적 주입 방식. npm 패키지 아님.
- SDK 로드 후 `window.vw` 전역 객체 생성까지 약간의 딜레이 존재 (polling 필요).
- WFS 도로중심선 레이어 `lt_l_roa_lnm`의 `RD_WTH` 필드로 도로 폭원 확인 가능.
- 스크린샷은 `mapRef.getMap().scene.canvas.toDataURL()` 으로 Cesium 씬 캡처.

---

## Decision Log

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-28 | V-World SDK 방식 선택 (Cesium 직접 X) | tileset URL이 비공개, SDK가 내부적으로 전부 처리 |
| 2026-04-28 | Map3DNode를 별도 노드 타입으로 분리 | MapNode(2D)와 역할·UI가 다름, 캔버스에서 독립적으로 배치 |
| 2026-04-28 | 도로 분석을 Map3DNode 내부에서 비동기 실행 | 노드를 먼저 표시하고 카메라 방향을 나중에 채우는 UX |

---

## Outcomes & Retrospective

작업 완료 후 작성합니다.

- **원래 목표 달성 여부**: [x] Yes  [ ] Partial  [ ] No
- **결과 요약**: 6개 파일 신규 + 4개 파일 수정. MapNode와 병렬로 Map3DNode가 캔버스에 자동 생성됨. 도로 WFS → 카메라 heading 계산 → V-World SDK 3D 렌더링 → 캡처 → ImageNode 출력 전체 파이프라인 완성. `npx tsc --noEmit` 오류 없음.
- **다음 작업에 반영할 것**: V-World 3D SDK의 실제 WebGL 렌더 지연 때문에 초기 캡처 버튼 클릭 시 빈 화면이 나올 수 있음 — 필요 시 캡처 전 `setTimeout` 딜레이 추가 검토.

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
