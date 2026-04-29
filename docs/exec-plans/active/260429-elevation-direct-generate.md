# Elevation: 복제 노드 없이 원본에서 직접 전개도 생성

> **목표:** Elevation 진입 시 중간 복제 노드를 생성하지 않고, 원본 image 노드 기반으로 ElevationExpandedView를 열어 GENERATE 후 결과 child 노드만 생성한다.

## 현재 문제

```
image 노드 → elevation 클릭
  → createChildNode() → 복제 elevation 노드 생성 (원본 이미지 복사)  ← 제거 대상
  → setExpandedNodeId(복제 노드 ID)
  → ElevationExpandedView (복제 노드 기반)
  → GENERATE
  → handleGenerateElevationComplete() → 결과 elevation 노드 (복제 노드의 자식)
```

캔버스에 노드 2개: 복제 노드 + 결과 노드

## 원하는 흐름

```
image 노드 → elevation 클릭
  → setElevationSourceNodeId(원본 노드 ID)
  → setExpandedNodeId(원본 노드 ID)
  → ElevationExpandedView (원본 노드 기반, sourceNodeId prop으로 원본 ID 전달)
  → GENERATE
  → handleGenerateElevationComplete() → 결과 elevation 노드 (원본 노드의 자식)
```

캔버스에 노드 1개: 결과 노드만

---

## 수정 대상 파일

### 1. `project_canvas/app/page.tsx`

#### 1-A. `elevationSourceNodeId` state 추가

```typescript
const [elevationSourceNodeId, setElevationSourceNodeId] = useState<string | null>(null);
```

#### 1-B. `handleNodeTabSelect` — elevation 처리 변경

```typescript
// 기존
if (type === 'elevation') {
  if (selectedNode.artboardType === 'image') {
    const sourceImage = selectedNode.generatedImageData ?? selectedNode.thumbnailData;
    setGeneratingLabel('ELEVATION GENERATING');
    const childId = createChildNode(selectedNode.id, type, 'image',
      sourceImage ? { thumbnailData: sourceImage, hasThumbnail: true } : undefined
    );
    setExpandedNodeId(childId);
  } else {
    showToast('이미지를 선택해 주세요');
  }
  setActiveSidebarNodeType(null);
  return;
}

// 변경
if (type === 'elevation') {
  if (selectedNode.artboardType === 'image') {
    setGeneratingLabel('ELEVATION GENERATING');
    setElevationSourceNodeId(selectedNode.id);
    setExpandedNodeId(selectedNode.id);
  } else {
    showToast('이미지를 선택해 주세요');
  }
  setActiveSidebarNodeType(null);
  return;
}
```

#### 1-C. `handleReturnFromExpand` — elevation 모드 시 원본 노드 업데이트 생략

elevation 진입 시 `expandedNodeId`가 원본 image 노드를 가리키므로, `handleReturnFromExpand`에서 해당 노드에 `hasThumbnail: true`, `artboardType` 변경 등이 적용되지 않도록 분기 추가.

```typescript
const handleReturnFromExpand = useCallback(() => {
  setExpandedViewMode('default');
  if (!expandedNodeId) { setExpandedNodeId(null); return; }

  // elevation 모드에서 복귀 시 원본 노드 업데이트 없이 state만 정리
  if (elevationSourceNodeId) {
    setElevationSourceNodeId(null);
    setExpandedNodeId(null);
    return;
  }

  const node = nodes.find(n => n.id === expandedNodeId);
  // ... 기존 로직 유지 ...
}, [expandedNodeId, elevationSourceNodeId, nodes, historyIndex]);
```

#### 1-D. `handleGenerateElevationComplete` — 완료 후 state 정리

```typescript
const handleGenerateElevationComplete = useCallback(async ({ aepl, images, nodeId }) => {
  setIsGenerating(false);
  setElevationSourceNodeId(null);  // ← 추가
  // ... 기존 로직 유지 (nodeId가 이제 원본 image 노드 ID) ...
}, [...]);
```

#### 1-E. ExpandedView 렌더링에 `elevationSourceNodeId` prop 전달

```tsx
<ExpandedView
  ...
  elevationSourceNodeId={elevationSourceNodeId ?? undefined}
/>
```

---

### 2. `project_canvas/components/ExpandedView.tsx`

#### 2-A. Props에 `elevationSourceNodeId` 추가

```typescript
interface Props {
  ...
  elevationSourceNodeId?: string;
}
```

#### 2-B. elevation 라우터 조건 확장

```typescript
// 기존: node.type === 'elevation'
// 변경: node.type === 'elevation' || !!elevationSourceNodeId
if (node.type === 'elevation' || !!elevationSourceNodeId) {
  return (
    <ElevationExpandedView
      node={node}
      sourceNodeId={elevationSourceNodeId}  // ← 추가
      onCollapse={onCollapse}
      onGeneratingChange={onGeneratingChange}
      isGenerating={isGenerating}
      onGenerateElevationComplete={onGenerateElevationComplete}
    />
  );
}
```

---

### 3. `project_canvas/elevation/ExpandedView.tsx`

#### 3-A. Props에 `sourceNodeId` 추가

```typescript
interface Props {
  ...
  sourceNodeId?: string;
}
```

#### 3-B. `handleGenerate`에서 nodeId를 sourceNodeId로 사용

```typescript
// 기존
onGenerateElevationComplete?.({
  sketchBase64: sourceImage,
  aepl: result.aepl,
  images: result.images,
  nodeId: node.id,  // 복제 노드 ID
});

// 변경
onGenerateElevationComplete?.({
  sketchBase64: sourceImage,
  aepl: result.aepl,
  images: result.images,
  nodeId: sourceNodeId ?? node.id,  // 원본 노드 ID 우선
});
```

---

## 영향 범위

| 시나리오 | 변경 전 | 변경 후 |
|----------|---------|---------|
| 신규 elevation 생성 | 복제 노드 + 결과 노드 (2개) | 결과 노드만 (1개) |
| elevation 닫기 (GENERATE 없음) | 복제 노드 캔버스에 잔존 | 노드 변경 없음 |
| 기존 elevation 결과 노드 열기 | 기존 동작 유지 | 기존 동작 유지 (elevationSourceNodeId=null) |
| 원본 image 노드 업데이트 | 복귀 시 hasThumbnail: true 덮어씀 | 복귀 시 업데이트 없음 |

## 체크리스트

- [x] `page.tsx` — `elevationSourceNodeId` state 추가
- [x] `page.tsx` — `handleNodeTabSelect` elevation 처리: `createChildNode` 제거, sourceNodeId/expandedNodeId 설정으로 변경
- [x] `page.tsx` — `handleReturnFromExpand`: elevation 모드 분기 추가 (원본 노드 업데이트 없이 state 정리만)
- [x] `page.tsx` — `handleGenerateElevationComplete`: `setElevationSourceNodeId(null)` 추가
- [x] `page.tsx` — ExpandedView 렌더링에 `elevationSourceNodeId` prop 전달
- [x] `components/ExpandedView.tsx` — `elevationSourceNodeId` prop 추가 + elevation 라우터 조건 확장 + `ElevationExpandedView`에 `sourceNodeId` 전달
- [x] `elevation/ExpandedView.tsx` — `sourceNodeId` prop 추가 + `handleGenerate`에서 `nodeId: sourceNodeId ?? node.id` 사용
- [ ] 동작 확인: 신규 elevation 생성 시 결과 노드만 1개 생성
- [ ] 동작 확인: GENERATE 없이 닫기 시 캔버스 변경 없음
- [ ] 동작 확인: 기존 elevation 결과 노드 열기 정상 작동
