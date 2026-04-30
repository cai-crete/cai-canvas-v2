# Plan 생성 이미지 ExpandedView 분리

## 목표
Plan에서 생성한 이미지 노드(`plan` 타입 + `artboardType === 'image'`)의 ExpandedView 진입 경로를 두 가지로 분리한다.

| 진입 경로 | 열리는 뷰 |
|---|---|
| 노드 카드 내 Expand 버튼 | Plan ExpandedView (SketchToPlanExpandedView) |
| 우측 사이드바 PLAN 버튼(→ 또는 탭) | Plan ExpandedView |
| 우측 사이드바 IMAGE 버튼 클릭 | Image ExpandedView (SketchToImageExpandedView) |

## 현황 분석

### 문제 원인
`ExpandedView.tsx`가 `node.type === 'plan'`이면 무조건 `SketchToPlanExpandedView`로 라우팅한다.  
IMAGE 버튼으로 진입해도 같은 노드(plan type)를 받으므로 Plan ExpandedView가 열린다.

### 관련 파일
- `project_canvas/app/page.tsx` — expand 트리거 로직 (`handleNodeTabSelect`, `handleNavigateToExpand`, `onNodeExpand`)
- `project_canvas/components/ExpandedView.tsx` — 노드 유형별 라우터
- `project_canvas/sketch-to-image/ExpandedView.tsx` — Image ExpandedView (참고용)

### 데이터 흐름
```
[IMAGE 버튼 클릭]
 → handleNodeTabSelect('image')
 → NODES_THAT_EXPAND.includes('image') → setExpandedNodeId(plan node id)
 → ExpandedView: node.type === 'plan' → SketchToPlanExpandedView ✗
```

## 구현 계획

### 변경 1: `page.tsx` — `expandedViewMode` 상태 추가

```tsx
const [expandedViewMode, setExpandedViewMode] = useState<'image' | 'default'>('default');
```

### 변경 2: `page.tsx` — `handleNodeTabSelect` 수정

IMAGE 탭 클릭 시, 선택 노드가 plan/image/viewpoint이고 artboardType='image'이면
→ `expandedViewMode = 'image'`로 설정 후 early return

```tsx
// IMAGE 탭 + plan/image/viewpoint 노드(artboardType=image) → Image ExpandedView
if (
  type === 'image' &&
  selectedNode.artboardType === 'image' &&
  (selectedNode.type === 'plan' || selectedNode.type === 'image' || selectedNode.type === 'viewpoint')
) {
  setExpandedViewMode('image');
  setExpandedNodeId(selectedNode.id);
  setActiveSidebarNodeType(null);
  return;
}
```

### 변경 3: `page.tsx` — `handleNavigateToExpand` 수정

IMAGE 패널의 `→` 버튼으로 navigate할 때도 viewMode 설정:

```tsx
if (selected.type === type || isImageResultNode) {
  setExpandedViewMode(type === 'image' ? 'image' : 'default');
  setExpandedNodeId(selectedNodeId);
  setActiveSidebarNodeType(null);
  return;
}
setExpandedViewMode('default');
createAndExpandNode(type);
```

### 변경 4: `page.tsx` — `onNodeExpand` 래핑

카드 내 Expand 버튼 클릭 시 항상 default 모드:

```tsx
onNodeExpand={(id) => { setExpandedViewMode('default'); setExpandedNodeId(id); }}
```

### 변경 5: `page.tsx` — `handleReturnFromExpand` 수정

expand 닫을 때 viewMode 초기화:
```tsx
setExpandedViewMode('default');
```

### 변경 6: `page.tsx` — ExpandedView에 prop 전달

```tsx
<ExpandedView ... viewMode={expandedViewMode} />
```

### 변경 7: `ExpandedView.tsx` — `viewMode` prop 추가 및 라우팅 수정

```tsx
interface Props {
  ...
  viewMode?: 'image' | 'default';
}

// 라우팅 수정
const isSketchImageMode =
  node.type === 'image' || node.type === 'viewpoint' ||
  (viewMode === 'image' && node.artboardType === 'image');

const isSketchPlanMode = node.type === 'plan' && viewMode !== 'image';
```

## 체크리스트

- [ ] `expandedViewMode` 상태 page.tsx에 추가
- [ ] `handleNodeTabSelect` — IMAGE 탭 조기 반환 분기 추가
- [ ] `handleNavigateToExpand` — viewMode 분기 추가
- [ ] `onNodeExpand` 래핑 (default 모드 보장)
- [ ] `handleReturnFromExpand` 에 viewMode 초기화 추가
- [ ] ExpandedView에 `viewMode` prop 전달
- [ ] `ExpandedView.tsx` — prop 추가 및 라우팅 수정
