# Frontend Plan — 지적도 아트보드 통합 (2D Cadastral Map Artboard)

> 이 문서는 살아있는 문서(living document)입니다.
> 작업을 진행하면서 발견, 결정, 진행 상황을 이 문서에 지속적으로 업데이트합니다.
> 이전 맥락이나 기억 없이, 이 문서만으로 작업을 완수할 수 있을 만큼 자급자족해야 합니다.
>
> 작업 완료 시 `completed/Frontend/` 폴더로 이동합니다.

---

## 개요

- **작업 유형**: UI 신규 / 데이터 파이프라인 연결
- **대상 노드**: N01.Planners (기획자들)
- **관련 디자인 기준**: InsightPanel 기존 스타일 계승 + Canvas nodeTypes 패턴 준수
- **시작일**: 2026-04-27

---

## 목표

브이월드 2D 지적도(WFS 경계 폴리곤 + TMS 배경지도)를 Planners 앱에 통합한다.
InsightPanel에 미니 지적도 시각화를 추가하고, React Flow 캔버스에 독립 MapNode 아트보드를 배치하여
사용자가 대지 경계와 주변 맥락을 인터랙티브하게 확인할 수 있도록 한다.

---

## 프로젝트 경로 (절대경로)

> **⚠️ Agent 필독 — 모든 파일 경로는 아래 BASE를 기준으로 합니다.**

```
BASE = C:/Users/크리트/Downloads/Planners_harness/N01.Planners
```

- 서버 API: `{BASE}/api/`
- 프론트 소스: `{BASE}/src/`
- 컴포넌트: `{BASE}/src/components/`
- 노드 컴포넌트: `{BASE}/src/components/nodes/`
- 라이브러리: `{BASE}/src/lib/`
- 스토어: `{BASE}/src/store/`
- 타입: `{BASE}/src/types/`

> **CAI_CANVAS 프로젝트** (`c:/Users/크리트/Desktop/AI/01. CAI_CANVAS/cai-canvas-v2-main/`)는
> exec-plan 문서만 보관하는 곳입니다. **코드 변경은 절대 이 프로젝트에 하지 않습니다.**

---

## 건드리지 말아야 할 파일 (DO NOT MODIFY)

| 파일 | 이유 |
|------|------|
| `{BASE}/api/vworld-map.ts` | 이미 완성됨. WMS/WFS/TMS 3종 프록시 동작 확인 완료 |
| `{BASE}/src/lib/mapApi.ts` | 이미 완성됨. `fetchCadastralBoundary()`, `getTmsUrl()` 등 구현 완료 |
| `{BASE}/api/planners.ts` | 관련 없음. Gemini AI 토론 생성 로직 |
| `{BASE}/api/law.ts` | 관련 없음. 법령 API 프록시 |
| `{BASE}/src/components/nodes/StickyNode.tsx` | 관련 없음 |
| `{BASE}/src/components/nodes/TurnGroupNode.tsx` | 관련 없음 |
| `{BASE}/src/components/nodes/DiscussionNode.tsx` | 관련 없음 |
| `{BASE}/src/components/nodes/SynapseNode.tsx` | 관련 없음 |

---

## 현재 상태 분석

### 이미 구현된 것 (재사용 — 수정 금지)

| 레이어 | 파일 | 상태 |
|--------|------|------|
| 서버 프록시 | `api/vworld-map.ts` | ✅ WMS/WFS/TMS 3종 액션 모두 구현 완료 |
| 클라이언트 래퍼 | `src/lib/mapApi.ts` | ✅ `fetchCadastralImage()`, `fetchCadastralBoundary()`, `getTmsUrl()`, `getTmsUrlTemplate()` 구현 완료 |
| 스토어 필드 | `src/store/useStore.ts` L125-141 | ⚠️ `cadastralBoundary`, `mapCenter` 타입 정의만 존재, 값은 항상 undefined |

### 끊어진 연결 (이번 작업에서 수정)

| 문제 | 파일 (절대경로) | 라인 | 상세 |
|------|----------------|------|------|
| mapApi 미호출 | `src/lib/gemini.ts` | L391-449 (`prefetchApiData` 함수) | PNU 확보 후에도 `fetchCadastralBoundary()` 를 호출하지 않음 |
| InsightPanel 지도 UI 없음 | `src/components/InsightPanel.tsx` | L132-140 (`SiteInfoSection` 렌더링) | 대지위치 섹션에 텍스트만 존재, 지도 시각화 컴포넌트 없음 |
| MapNode 미존재 | `src/components/Canvas.tsx` | L31-38 (`nodeTypes` 객체) | 지도 전용 노드 타입이 등록되어 있지 않음 |

---

## 영향 범위

| 컴포넌트 | 변경 유형 | 파일 (BASE 기준 상대경로) |
|----------|-----------|--------------------------|
| prefetchApiData | **수정** (5줄 추가) | `src/lib/gemini.ts` |
| CadastralMiniMap | **신규** 파일 생성 | `src/components/CadastralMiniMap.tsx` |
| InsightPanel (SiteInfoSection) | **수정** (props 추가 + 컴포넌트 삽입) | `src/components/InsightPanel.tsx` |
| MapNode | **신규** 파일 생성 | `src/components/nodes/MapNode.tsx` |
| Canvas nodeTypes | **수정** (1줄 import + 1줄 등록) | `src/components/Canvas.tsx` |
| useStore (reGenerateFromPrompt) | **수정** (15줄 추가) | `src/store/useStore.ts` |
| 노드 타입 정의 | **수정** (타입 + 타입가드 추가) | `src/types/nodes.ts` |

---

## 디자인 기준 체크

- [ ] InsightPanel 기존 카드 스타일(rounded-xl, border-neutral-100, SectionHeader) 계승
- [ ] Canvas 노드 기존 패턴(ImageNode 참조) 준수 — Handle top/bottom, 선택 시 border 강조
- [ ] 반응형: InsightPanel 미니맵은 고정 높이 160px, MapNode는 400x300 기본 크기
- [ ] 접근성: 지도 영역에 aria-label, 키보드 포커스 가능

---

## TASK 분할

---

### TASK 1: 데이터 파이프라인 연결

**목적**: PNU 확보 시 지적 경계 데이터를 자동으로 fetch하여 `insightData`에 포함

**수정 파일 1개만**:
- `{BASE}/src/lib/gemini.ts`

**건드리지 말 것**: `mapApi.ts`, `useStore.ts`, `api/vworld-map.ts`

#### 정확한 변경 위치와 내용

**파일**: `src/lib/gemini.ts`

**Step 1**: 파일 상단(L0 부근) import 영역에 추가
```typescript
// 기존 import 끝나는 곳(L18 이후) 아래에 추가:
import { fetchCadastralBoundary } from './mapApi';
import type { CadastralGeoJson } from './mapApi';
```

**Step 2**: `PreFetchedApiData` 인터페이스(L370 부근)에 필드 추가
```typescript
// 기존 인터페이스에 아래 2개 필드 추가:
export interface PreFetchedApiData {
  relevantLaws: string;
  insightPnu: string | null;
  insightData: {
    law: LawEntry[];
    building: LawEntry[];
    land: LawEntry[];
    pnu: string | null;
    address: string | null;
    landCharacteristics?: { ... };  // 기존 유지
    parkingOrdinance?: LawEntry[];  // 기존 유지
    cadastralBoundary?: CadastralGeoJson | null;  // ← 신규 추가
    mapCenter?: { lng: number; lat: number } | null;  // ← 신규 추가
  } | null;
}
```

**Step 3**: `prefetchApiData()` 함수 내부(L436~449) — `return` 문 직전에 지적도 fetch 추가

현재 코드 (L426-449):
```typescript
  const lawResult = await fetchRelevantLaws(...);

  return {
    relevantLaws: lawResult.formatted,
    insightPnu: lawResult.pnu ?? null,
    insightData: {
      law: lawResult.categorized.law,
      building: lawResult.categorized.building,
      land: lawResult.categorized.land,
      pnu: lawResult.pnu,
      address: resolvedAddress,
      landCharacteristics: lawResult.landCharacteristics ?? undefined,
      parkingOrdinance: lawResult.parkingOrdinance,
    },
  };
```

변경 후 (L436 `const lawResult` 이후, `return` 이전에 삽입):
```typescript
  const lawResult = await fetchRelevantLaws(...);

  // ── 지적 경계 데이터 조회 (PNU 존재 시) ──
  let cadastralBoundary: CadastralGeoJson | null = null;
  let mapCenter: { lng: number; lat: number } | null = null;

  if (lawResult.pnu) {
    try {
      cadastralBoundary = await fetchCadastralBoundary(undefined, lawResult.pnu);
      // GeoJSON 첫 번째 feature의 좌표에서 centroid 계산
      if (cadastralBoundary?.features?.[0]?.geometry?.coordinates) {
        const coords = cadastralBoundary.features[0].geometry.coordinates;
        const flatCoords: number[][] = cadastralBoundary.features[0].geometry.type === 'Polygon'
          ? (coords as number[][][])[0]
          : (coords as number[][][][])[0][0];
        if (flatCoords.length > 0) {
          const sumLng = flatCoords.reduce((s, c) => s + c[0], 0);
          const sumLat = flatCoords.reduce((s, c) => s + c[1], 0);
          mapCenter = { lng: sumLng / flatCoords.length, lat: sumLat / flatCoords.length };
        }
      }
    } catch (e) {
      console.error('[prefetchApiData] 지적 경계 조회 실패 (무시):', e);
      // 실패해도 토론 생성에 영향 없음 — cadastralBoundary = null 유지
    }
  }

  return {
    relevantLaws: lawResult.formatted,
    insightPnu: lawResult.pnu ?? null,
    insightData: {
      law: lawResult.categorized.law,
      building: lawResult.categorized.building,
      land: lawResult.categorized.land,
      pnu: lawResult.pnu,
      address: resolvedAddress,
      landCharacteristics: lawResult.landCharacteristics ?? undefined,
      parkingOrdinance: lawResult.parkingOrdinance,
      cadastralBoundary,   // ← 신규 추가
      mapCenter,           // ← 신규 추가
    },
  };
```

**중요**: `prefetchApiData()` 함수 내부만 수정합니다. 다른 함수(`generateDiscussion`, `regenerateDiscussion`, `analyzePromptMode` 등)는 절대 건드리지 마세요.

#### 검증 방법
- TypeScript 컴파일 에러 없음 확인
- `lawResult.pnu`가 존재하는 입력으로 테스트 시 `insightData.cadastralBoundary`에 GeoJSON 데이터 존재
- `lawResult.pnu`가 없는 입력에서도 기존 기능 정상 동작 확인

---

### TASK 2: GeoJSON → SVG 렌더링 컴포넌트 (CadastralMiniMap)

**목적**: 지적 경계 폴리곤을 순수 SVG로 시각화하는 재사용 가능한 컴포넌트

**신규 파일 1개**:
- `{BASE}/src/components/CadastralMiniMap.tsx`

**건드리지 말 것**: 다른 모든 파일

#### 컴포넌트 명세

```typescript
// 파일: src/components/CadastralMiniMap.tsx

import { memo, useMemo } from 'react';
import type { CadastralGeoJson } from '../lib/mapApi';
import { getTmsUrl } from '../lib/mapApi';

interface CadastralMiniMapProps {
  boundary: CadastralGeoJson;
  center: { lng: number; lat: number };
  width?: number;    // 기본값 400
  height?: number;   // 기본값 300
  className?: string;
  tmsType?: 'Base' | 'Satellite' | 'Hybrid';  // 기본값 'Base'
  showControls?: boolean;  // 기본값 false
}
```

#### 렌더링 로직

1. **GeoJSON 좌표 → SVG path 변환**:
   - `boundary.features` 배열의 모든 Polygon/MultiPolygon을 순회
   - 각 좌표 `[lng, lat]`를 SVG 좌표로 변환: `x = lng`, `y = -lat` (위도는 y축 반전)
   - 모든 좌표의 min/max로 bbox 계산 → SVG `viewBox` 설정
   - bbox에 10% padding 추가 (여백)

2. **배경 TMS 타일** (선택적):
   - `center`와 줌레벨로 TMS 타일 좌표 계산
   - `getTmsUrl(tmsType, z, x, y)`로 URL 생성
   - `<image>` 요소로 SVG 배경에 삽입
   - 타일 로드 실패 시 회색 배경 fallback

3. **폴리곤 렌더링**:
   - `<path>` 요소 사용
   - 스타일: `stroke="#EF4444"` (빨간색), `strokeWidth="2"`, `fill="rgba(239,68,68,0.15)"` (반투명 빨강)
   - `d` 속성: `M x1,y1 L x2,y2 ... Z` 형식

4. **export**: `export const CadastralMiniMap = memo(...)` 형태로 export

#### 주의사항
- **외부 라이브러리 금지**: Leaflet, OpenLayers, MapLibre 등 설치하지 마세요
- **순수 React + SVG만 사용**
- `mapApi.ts`에서 타입(`CadastralGeoJson`)과 함수(`getTmsUrl`)만 import
- 컴포넌트는 **boundary가 null이면 렌더링하지 않음** — 호출 측에서 조건부 렌더링

---

### TASK 3: InsightPanel에 미니 지적도 삽입

**목적**: 대지위치 섹션 상단에 지적 경계 미니맵 표시

**수정 파일 1개만**:
- `{BASE}/src/components/InsightPanel.tsx`

**건드리지 말 것**: `Canvas.tsx`, `useStore.ts`, 다른 모든 파일

#### 정확한 변경 위치와 내용

**변경 1**: 파일 상단 import에 추가
```typescript
import { CadastralMiniMap } from './CadastralMiniMap';
```

**변경 2**: `SiteInfoSection` 호출부 (현재 L134-139)

현재:
```tsx
<SiteInfoSection
  address={apiInsightData.address}
  pnu={apiInsightData.pnu}
  zones={apiInsightData.land}
  landCharacteristics={apiInsightData.landCharacteristics}
/>
```

변경 후:
```tsx
<SiteInfoSection
  address={apiInsightData.address}
  pnu={apiInsightData.pnu}
  zones={apiInsightData.land}
  landCharacteristics={apiInsightData.landCharacteristics}
  cadastralBoundary={apiInsightData.cadastralBoundary ?? null}
  mapCenter={apiInsightData.mapCenter ?? null}
/>
```

**변경 3**: `SiteInfoSection` 함수 시그니처 (현재 L252-267)

현재:
```typescript
function SiteInfoSection({
  address, pnu, zones, landCharacteristics,
}: {
  address: string | null;
  pnu: string | null;
  zones: LawEntry[];
  landCharacteristics?: { ... };
}) {
```

변경 후 — props 타입에 2개 추가:
```typescript
function SiteInfoSection({
  address, pnu, zones, landCharacteristics, cadastralBoundary, mapCenter,
}: {
  address: string | null;
  pnu: string | null;
  zones: LawEntry[];
  landCharacteristics?: { ... };  // 기존 유지
  cadastralBoundary: CadastralGeoJson | null;  // ← 추가
  mapCenter: { lng: number; lat: number } | null;  // ← 추가
}) {
```

**변경 4**: `SiteInfoSection` 내부 — `return` JSX의 `<div className="p-3 space-y-3">` 바로 아래(L304 이후)에 미니맵 삽입

```tsx
<div className="p-3 space-y-3">
  {/* ── 지적 경계 미니맵 (신규) ── */}
  {cadastralBoundary && mapCenter && cadastralBoundary.features.length > 0 && (
    <div className="rounded-lg overflow-hidden border border-neutral-100">
      <CadastralMiniMap
        boundary={cadastralBoundary}
        center={mapCenter}
        width={256}
        height={160}
        className="w-full"
      />
    </div>
  )}

  {/* 기존 address 표시 코드 그대로 유지... */}
  {address && (
```

**변경 5**: 파일 상단에 `CadastralGeoJson` 타입 import 추가
```typescript
import type { CadastralGeoJson } from '../lib/mapApi';
```

**중요**: `SiteInfoSection` 내부의 기존 코드(주소, PNU, 용도지역 등)는 절대 수정하지 마세요. 미니맵만 `<div className="p-3 space-y-3">` 바로 아래 첫 번째 자식으로 삽입합니다.

---

### TASK 4: MapNode 캔버스 아트보드 노드

**목적**: React Flow 캔버스에 독립적인 지도 아트보드 노드를 배치

**신규 파일 1개 + 수정 파일 2개**:
- **신규**: `{BASE}/src/components/nodes/MapNode.tsx`
- **수정**: `{BASE}/src/types/nodes.ts`
- **수정**: `{BASE}/src/components/Canvas.tsx`

**건드리지 말 것**: `useStore.ts`, `InsightPanel.tsx`, 기존 노드 파일들

#### Step 1: `src/types/nodes.ts` 수정

**추가 위치**: `ImageNodeData` 인터페이스(L93-97) 아래에 추가

```typescript
// L97 이후에 추가:
export interface MapNodeData extends Record<string, unknown> {
  boundary: CadastralGeoJson | null;
  center: { lng: number; lat: number } | null;
  address: string | null;
  pnu: string | null;
  tmsType: 'Base' | 'Satellite' | 'Hybrid';
  zoomLevel: number;
}
```

**import 추가**: 파일 상단(L1)에 `CadastralGeoJson` import
```typescript
import type { CadastralGeoJson } from '../lib/mapApi';
```

**AllNodeData 유니온에 추가** (현재 L107):
```typescript
// 현재:
export type AllNodeData = StickyNodeData | TurnGroupNodeData | PromptNodeData | DiscussionNodeData | SynapseNodeData | ImageNodeData | FileNodeData;

// 변경:
export type AllNodeData = StickyNodeData | TurnGroupNodeData | PromptNodeData | DiscussionNodeData | SynapseNodeData | ImageNodeData | FileNodeData | MapNodeData;
```

**타입가드 함수 추가** (L136 `isFileNode` 아래에):
```typescript
export function isMapNode(node: AppNode): node is Node<MapNodeData> {
  return node.type === 'mapNode';
}
```

#### Step 2: `src/components/nodes/MapNode.tsx` 신규 생성

**패턴 참조**: `ImageNode.tsx`와 동일한 구조를 따릅니다.

```typescript
// 파일: src/components/nodes/MapNode.tsx

import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { MapNodeData } from '../../types/nodes';
import { CadastralMiniMap } from '../CadastralMiniMap';
import { Trash2, MapPin } from 'lucide-react';

export const MapNode = memo(({ id, data, selected }: NodeProps<Node<MapNodeData>>) => {
  const isGenerating = useStore((state) => state.isGenerating);
  const deleteNode = useStore((state) => state.deleteNode);
  const lastActiveNodeId = useStore((state) => state.lastActiveNodeId);
  const [tmsType, setTmsType] = useState<'Base' | 'Satellite' | 'Hybrid'>(data.tmsType || 'Base');

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode(id);
  };

  return (
    <div
      className={cn(
        'w-[420px] rounded-2xl bg-white p-2 shadow-lg flex flex-col relative border-2 group transition-[border-color,box-shadow] duration-300',
        lastActiveNodeId === id ? 'border-black ring-2 ring-black/20' : 'border-neutral-200',
        isGenerating && 'opacity-80'
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-neutral-800 opacity-50 hover:opacity-100" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-neutral-800 opacity-50 hover:opacity-100" />

      {/* 헤더 */}
      <div className="flex items-center justify-between pb-2 px-1">
        <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
          <MapPin className="w-3.5 h-3.5 text-black" />
          <span className="text-[10px] font-black tracking-widest uppercase text-black">
            지적도
          </span>
        </div>
        <button onClick={handleDelete} className="text-neutral-400 hover:text-red-500 transition-colors p-1 opacity-0 group-hover:opacity-100" title="Delete Map">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 주소 */}
      {data.address && (
        <p className="text-[11px] font-bold text-neutral-700 px-1 pb-1 truncate">{data.address}</p>
      )}

      {/* 지도 본문 */}
      <div className="relative w-full rounded-xl overflow-hidden nodrag bg-neutral-100 flex items-center justify-center min-h-[300px]" aria-label="지적도 지도">
        {data.boundary && data.center ? (
          <CadastralMiniMap
            boundary={data.boundary}
            center={data.center}
            width={400}
            height={300}
            tmsType={tmsType}
            className="w-full h-full"
          />
        ) : (
          <span className="text-xs text-neutral-400 font-bold">지적 데이터 없음</span>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div className="flex items-center gap-1 pt-2 px-1">
        {(['Base', 'Satellite', 'Hybrid'] as const).map((t) => (
          <button
            key={t}
            onClick={(e) => { e.stopPropagation(); setTmsType(t); }}
            className={cn(
              'text-[9px] font-bold px-2 py-1 rounded-md transition-colors',
              tmsType === t ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
});
```

#### Step 3: `src/components/Canvas.tsx` 수정

**변경 1**: import 추가 (L28 `ImageNode` import 아래에):
```typescript
import { MapNode } from './nodes/MapNode';
```

**변경 2**: `nodeTypes` 객체 (현재 L31-38):

현재:
```typescript
const nodeTypes = {
  sticky: StickyNode,
  turnGroup: TurnGroupNode,
  promptNode: StickyNode,
  discussion: DiscussionNode,
  synapseNode: SynapseNode,
  imageNode: ImageNode,
};
```

변경 후 (맨 끝에 1줄 추가):
```typescript
const nodeTypes = {
  sticky: StickyNode,
  turnGroup: TurnGroupNode,
  promptNode: StickyNode,
  discussion: DiscussionNode,
  synapseNode: SynapseNode,
  imageNode: ImageNode,
  mapNode: MapNode,          // ← 지적도 아트보드 노드 추가
};
```

**중요**: `nodeTypes` 객체에 `mapNode: MapNode` 한 줄만 추가합니다. 다른 것은 건드리지 마세요.

---

### TASK 5: 자동 MapNode 생성 로직

**목적**: 토론 생성 시 지적 데이터가 존재하면 자동으로 MapNode를 캔버스에 배치

**수정 파일 1개만**:
- `{BASE}/src/store/useStore.ts`

**건드리지 말 것**: `gemini.ts`, `Canvas.tsx`, `InsightPanel.tsx`, `nodes.ts`, 모든 노드 컴포넌트

#### 정확한 변경 위치와 내용

**변경 위치**: `reGenerateFromPrompt()` 함수 내부, L846-851 (prefetch 완료 후 apiInsightData 세팅 직후)

현재 코드 (L846-851):
```typescript
      const preFetched = await prefetchApiData(fetchContext, apiToggles, existingAddress);

      // Store에 1회만 세팅 (race condition 해결)
      if (preFetched.insightData) {
        get().setApiInsightData(preFetched.insightData);
      }

      await Promise.all(groupIds.map(async (gid, index) => {
```

변경 후 (L851 `get().setApiInsightData(...)` 직후, `await Promise.all` 직전에 삽입):
```typescript
      const preFetched = await prefetchApiData(fetchContext, apiToggles, existingAddress);

      // Store에 1회만 세팅 (race condition 해결)
      if (preFetched.insightData) {
        get().setApiInsightData(preFetched.insightData);
      }

      // ── MapNode 자동 생성 (지적 경계 데이터 존재 시) ──
      if (preFetched.insightData?.cadastralBoundary?.features?.length) {
        const existingMapNode = state.nodes.find(
          (n) => n.type === 'mapNode' && (n.data as any).pnu === preFetched.insightData?.pnu
        );
        if (!existingMapNode) {
          const mapNodeId = `node-map-${generateId()}`;
          state.addNode({
            id: mapNodeId,
            type: 'mapNode',
            position: { x: promptNode.position.x - 500, y: promptNode.position.y },
            data: {
              boundary: preFetched.insightData.cadastralBoundary,
              center: preFetched.insightData.mapCenter ?? null,
              address: preFetched.insightData.address ?? null,
              pnu: preFetched.insightData.pnu ?? null,
              tmsType: 'Base',
              zoomLevel: 17,
            },
          } as any);
        }
      }

      await Promise.all(groupIds.map(async (gid, index) => {
```

**중요**:
- `reGenerateFromPrompt` 함수의 다른 부분은 절대 수정하지 마세요
- `combineAndGenerateVCS` 함수는 건드리지 마세요
- `generateId()` 함수는 이미 파일 내에 존재합니다 (별도 import 불필요)
- MapNode의 `data` 타입은 `MapNodeData`이지만, `addNode`의 타입 시스템 제약으로 `as any` 캐스팅 사용 (ImageNode와 동일 패턴)

---

### TASK 6: 검증 및 엣지 케이스 처리

**목적**: 전체 파이프라인 동작 검증

**파일 수정 없음** — 검증만 수행

#### 검증 체크리스트

1. **정상 케이스**: 주소 포함 안건 입력(예: "서울특별시 강남구 역삼동 123-4 오피스 빌딩 신축")
   - [ ] InsightPanel 대지위치 섹션 상단에 미니맵 표시됨
   - [ ] Canvas에 MapNode가 프롬프트 노드 좌측에 자동 생성됨
   - [ ] MapNode에 지적 경계 폴리곤(빨간선)이 표시됨
   - [ ] Base/Satellite/Hybrid 버튼 클릭 시 배경 전환됨

2. **PNU 없는 안건**: 주소가 없는 안건(예: "건축법 제44조에 대해 분석해주세요")
   - [ ] InsightPanel 미니맵 미표시 (기존 텍스트만 표시)
   - [ ] MapNode 미생성
   - [ ] 기존 토론 생성 정상 동작

3. **API 실패**: VWorld API 키 미설정 또는 네트워크 오류
   - [ ] 토론 생성은 정상 완료됨 (지적도 fetch 실패는 독립)
   - [ ] 콘솔에 `[prefetchApiData] 지적 경계 조회 실패 (무시)` 로그만 출력

4. **TypeScript 컴파일**:
   - [ ] `npx tsc --noEmit` 에러 없음

---

## 실행 순서 (엄격한 순서 — 건너뛰기 금지)

```
TASK 1 → TASK 2 → TASK 3 → TASK 4 → TASK 5 → TASK 6
```

각 TASK 완료 후 TypeScript 컴파일 에러 없음을 확인한 뒤 다음 TASK로 진행합니다.
TASK 3과 TASK 4는 병렬 가능하지만, **순서대로 진행하는 것이 안전합니다.**

---

## Progress

- [x] 2026-04-27 — TASK 1: `src/lib/gemini.ts` prefetchApiData()에 fetchCadastralBoundary 호출 추가
- [x] 2026-04-27 — TASK 2: `src/components/CadastralMiniMap.tsx` 신규 생성
- [x] 2026-04-27 — TASK 3: `src/components/InsightPanel.tsx` SiteInfoSection에 미니맵 삽입
- [x] 2026-04-27 — TASK 4: `src/components/nodes/MapNode.tsx` 신규 + `Canvas.tsx` 등록 + `nodes.ts` 타입
- [x] 2026-04-27 — TASK 5: `src/store/useStore.ts` reGenerateFromPrompt() MapNode 자동 생성
- [x] 2026-04-27 — TASK 6: TypeScript --noEmit 에러 없음 확인
- [ ] 2026-04-27 — 실기능 테스트 (주소 포함 안건 입력 → 미니맵/MapNode 표시 확인)
- [x] 2026-04-27 — git commit & push (1350130 → origin/master)

---

## Surprises & Discoveries

- (작업 진행 중 기록)

---

## Decision Log

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-27 | 외부 지도 라이브러리(Leaflet/OpenLayers) 미사용, 순수 SVG 렌더링 | 번들 크기 절약 + Planners 앱의 가벼운 특성 유지. 향후 3D 확장 시 별도 검토 |
| 2026-04-27 | WMS 이미지 대신 TMS + WFS 조합 우선 | WMS는 서버 프록시 필요 + 해상도 제한. TMS CDN + WFS 벡터가 더 유연 |
| 2026-04-27 | MapNode를 토론 생성 시 자동 생성 | 사용자가 수동으로 추가하는 것보다 맥락 연결이 자연스러움 |
| 2026-04-27 | exec-plan을 Sonnet용으로 재작성 | 정확한 파일 경로, 라인 번호, 코드 변경 범위를 명시하여 오작업 방지 |

---

## Outcomes & Retrospective

작업 완료 후 작성합니다.

- **원래 목표 달성 여부**: [ ] Yes  [ ] Partial  [ ] No
- **결과 요약**: [원래 목표 대비 실제 결과]
- **다음 작업에 반영할 것**: [이 작업에서 배운 것 — 3D 맵 확장 가능성 등]

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
