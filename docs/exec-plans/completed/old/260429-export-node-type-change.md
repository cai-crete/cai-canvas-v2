# EXPORT TO IMAGE NODE 생성 노드 유형 변경

## 목표
cadastral/map3d ExpandedView의 "EXPORT TO IMAGE NODE" 클릭 시 생성되는 노드를
`type='image', artboardType='image'` → 각각 `type='cadastral'`, `type='map3d'`, `artboardType='sketch'`로 변경.
생성된 노드의 기본 Expand 진입 뷰도 변경.

---

## 현재 동작

| 핸들러 | 생성 노드 | Expand 진입 |
|--------|-----------|-------------|
| `handleExportCadastralImage` | `type='image', artboardType='image'` | sketch-to-image |
| `handleExportMap3dImage` | `type='image', artboardType='image'` | sketch-to-image |

## 목표 동작

| 핸들러 | 생성 노드 | Expand 진입 |
|--------|-----------|-------------|
| `handleExportCadastralImage` | `type='cadastral', artboardType='sketch'` | **sketch-to-plan ExpandedView** |
| `handleExportMap3dImage` | `type='map3d', artboardType='sketch'` | **sketch-to-image ExpandedView** |

---

## 영향 범위 분석

### 1. `project_canvas/types/canvas.ts`

- `NODE_TO_ARTBOARD_TYPE`
  - `cadastral: 'image'` → `cadastral: 'sketch'`
  - `map3d: 'image'` → `map3d: 'sketch'`
- `ARTBOARD_COMPATIBLE_NODES.sketch`
  - `['image', 'plan', 'print']` → `['image', 'plan', 'print', 'cadastral', 'map3d']`

### 2. `project_canvas/app/page.tsx`

#### `handleExportCadastralImage` (line 534~558)
- `type: 'image'` → `type: 'cadastral'`
- `artboardType: 'image'` → `artboardType: 'sketch'`
- `num` 카운터: `n.type === 'image'` → `n.type === 'cadastral'`
- `title`: `지적도 Export #${num}` → `지적도 #${num}`
- 원본 노드(`expandedNodeId`)에서 cadastral 데이터 필드 복사:
  `cadastralPnu`, `cadastralGeoJson`, `cadastralMapCenter`,
  `cadastralTmsType`, `cadastralShowSurrounding`, `cadastralShowLotNumbers`,
  `cadastralFillSelected`

#### `handleExportMap3dImage` (line 561~586)
- `type: 'image'` → `type: 'map3d'`
- `artboardType: 'image'` → `artboardType: 'sketch'`
- `num` 카운터: `n.type === 'image'` → `n.type === 'map3d'`
- `title`: `3D View Export #${num}` → `3D 버드아이 뷰 #${num}`
- 원본 노드에서 map3d 데이터 필드 복사:
  `map3dCenter`, `map3dHeading`, `map3dHeight`, `map3dOffsetAngle`,
  `map3dBoundary`, `map3dRoadInfo`, `map3dShowLabels`
- `setExpandedNodeId(null)` 유지

#### `handleNodeTabSelect` — expand 진입 시 `expandedViewMode` 설정
- `type='cadastral', artboardType='sketch'` 노드 expand 시 → `setExpandedViewMode('plan')`
- `type='map3d', artboardType='sketch'` 노드 expand 시 → `setExpandedViewMode('image')`
  - 현재 `NODES_THAT_EXPAND`에 map3d 없음 → 추가 또는 inline 처리 필요

#### `expandedViewMode` 자동 감지 로직 (line 221~232)
```ts
// 현재
if (node.artboardType === 'image' && (plan/image/viewpoint)) return 'image';
// 추가 필요
if (node.type === 'cadastral' && node.artboardType === 'sketch') return 'plan';
if (node.type === 'map3d'     && node.artboardType === 'sketch') return 'image';
```

### 3. `project_canvas/components/ExpandedView.tsx`

#### cadastral/map3d 분기 조건에 artboardType 제한 추가
- 현재 (line 255): `if (node.type === 'cadastral')` → 무조건 CadastralMapView
- 변경: `if (node.type === 'cadastral' && node.artboardType !== 'sketch')`
  - `artboardType='sketch'`이면 이 분기를 타지 않고 아래 sketch-to-plan 분기로 진행
- 현재 (line 326): `if (node.type === 'map3d')` → 무조건 Map3DView
- 변경: `if (node.type === 'map3d' && node.artboardType !== 'sketch')`
  - `artboardType='sketch'`이면 sketch-to-image 분기로 진행

### 4. 변경 불필요
- `NodeCard.tsx`: cadastral 라이브 썸네일 분기가 artboardType보다 우선하므로 썸네일 표시 정상
- `NODES_THAT_EXPAND`: cadastral 이미 포함. map3d는 handleExportMap3dImage에서 직접 setExpandedNodeId로 처리하므로 리스트 추가 불필요

---

## 체크리스트

- [ ] `types/canvas.ts` — `NODE_TO_ARTBOARD_TYPE` cadastral/map3d → `'sketch'`
- [ ] `types/canvas.ts` — `ARTBOARD_COMPATIBLE_NODES.sketch`에 cadastral/map3d 추가
- [ ] `page.tsx` — `handleExportCadastralImage`: type/artboardType/title/num/데이터 복사 변경
- [ ] `page.tsx` — `handleExportMap3dImage`: type/artboardType/title/num/데이터 복사 변경
- [ ] `page.tsx` — `expandedViewMode` 자동 감지 로직에 cadastral/map3d sketch 분기 추가
- [ ] `ExpandedView.tsx` — cadastral 분기: `artboardType !== 'sketch'` 조건 추가
- [ ] `ExpandedView.tsx` — map3d 분기: `artboardType !== 'sketch'` 조건 추가
- [ ] 브라우저 검증: cadastral EXPORT → 새 cadastral(sketch) 노드 생성 확인
- [ ] 브라우저 검증: map3d EXPORT → 새 map3d(sketch) 노드 생성 확인
- [ ] 브라우저 검증: cadastral(sketch) 노드 expand → sketch-to-plan ExpandedView 진입 확인
- [ ] 브라우저 검증: map3d(sketch) 노드 expand → sketch-to-image ExpandedView 진입 확인
- [ ] 브라우저 검증: 기존 cadastral(image)/map3d(image) 노드 expand 정상 동작 확인 (회귀)
