# 작업지시서: 생성 이미지 노드 — 사이드바 IMAGE 활성화 + ExpandedView 라우팅

## 요청 요약

1. Plan / Image / Change Viewpoint로 생성된 이미지 노드를 선택하면 우측 사이드바에서 **"IMAGE" 패널이 자동 활성화**되도록 설정 변경
2. Image / Change Viewpoint로 생성된 이미지 노드에서 Expand 클릭 시 **"IMAGE" ExpandedView (SketchToImageExpandedView)** 가 열리도록 설정 변경

---

## 코드베이스 분석

### 관련 타입 (`types/canvas.ts`)

| 노드 타입 | artboardType | 배지 | 생성 경로 |
|-----------|-------------|------|-----------|
| `image`   | `image`     | IMAGE | Sketch to Image |
| `plan`    | `image`     | PLAN  | Sketch to Plan |
| `viewpoint` | `image`  | VIEWPOINT | Change Viewpoint |

### 현재 동작

**사이드바 (page.tsx `handleNodeCardSelect`):**
- `artboardType === 'thumbnail'` → `activeSidebarNodeType = 'planners'`
- 그 외 → `activeSidebarNodeType = null` (SELECT TOOLS 모드)

따라서 plan/image/viewpoint 타입 노드를 선택해도 사이드바는 SELECT TOOLS로 유지됨

**ExpandedView 라우팅 (components/ExpandedView.tsx):**
- `node.type === 'image'` → `SketchToImageExpandedView` ✅
- `node.type === 'plan'` → `SketchToPlanExpandedView` ✅
- `node.type === 'viewpoint'` → 처리 없음 → 기본 placeholder 레이아웃 ❌

**navigate 버튼 (page.tsx `handleNavigateToExpand`):**
- `selected.type === 'image'` → 해당 노드 expand
- `selected.type === 'viewpoint'` → createAndExpandNode('image') (새 노드 생성) ❌

---

## 변경 계획

### [ ] 변경 1: `project_canvas/app/page.tsx` — handleNodeCardSelect

```diff
- if (node.artboardType === 'thumbnail') {
-   setActiveSidebarNodeType('planners');
- } else {
-   setActiveSidebarNodeType(null);
- }
+ if (node.artboardType === 'thumbnail') {
+   setActiveSidebarNodeType('planners');
+ } else if (
+   node.artboardType === 'image' &&
+   (node.type === 'plan' || node.type === 'image' || node.type === 'viewpoint')
+ ) {
+   setActiveSidebarNodeType('image');
+ } else {
+   setActiveSidebarNodeType(null);
+ }
```

**효과:** plan/image/viewpoint 타입 노드를 선택하면 IMAGE 패널 자동 열림

---

### [ ] 변경 2: `project_canvas/components/ExpandedView.tsx` — isSketchImageMode

```diff
- const isSketchImageMode = node.type === 'image';
+ const isSketchImageMode = node.type === 'image' || node.type === 'viewpoint';
```

**효과:** viewpoint 노드도 SketchToImageExpandedView로 라우팅됨
- `generatedImageData`가 있으므로 스케치 캔버스에 생성된 이미지가 로드됨

---

### [ ] 변경 3: `project_canvas/app/page.tsx` — handleNavigateToExpand

IMAGE 패널 → 버튼 클릭 시 viewpoint/plan/image 타입 노드(artboardType='image')가 선택되어 있으면 해당 노드를 expand (새 노드 생성 대신)

```diff
  const handleNavigateToExpand = useCallback((type: NodeType) => {
    if (NODES_NAVIGATE_DISABLED.includes(type)) return;
    if (selectedNodeId) {
      const selected = nodes.find(n => n.id === selectedNodeId);
-     if (selected && selected.type === type) {
+     if (selected && (
+       selected.type === type ||
+       (type === 'image' && selected.artboardType === 'image' &&
+         (selected.type === 'image' || selected.type === 'viewpoint' || selected.type === 'plan'))
+     )) {
        setExpandedNodeId(selectedNodeId);
        setActiveSidebarNodeType(null);
        return;
      }
    }
    createAndExpandNode(type);
  }, [selectedNodeId, nodes, createAndExpandNode]);
```

**효과:** viewpoint/plan 노드에서 IMAGE 패널의 → 버튼을 클릭하면 해당 노드를 IMAGE ExpandedView로 열음

---

## 동작 흐름 (변경 후)

| 노드 | 선택 시 사이드바 | Expand/더블탭 | 사이드바 → 버튼 |
|------|----------------|--------------|----------------|
| image (artboard=image) | IMAGE 패널 열림 | SketchToImageExpandedView | 해당 노드 expand |
| plan (artboard=image) | IMAGE 패널 열림 | SketchToPlanExpandedView (유지) | 해당 노드 IMAGE expand |
| viewpoint (artboard=image) | IMAGE 패널 열림 | SketchToImageExpandedView (신규) | 해당 노드 expand |

---

## 체크리스트

- [ ] 변경 1: page.tsx handleNodeCardSelect — IMAGE 패널 자동 활성화
- [ ] 변경 2: ExpandedView.tsx — viewpoint 노드 SketchToImageExpandedView 라우팅
- [ ] 변경 3: page.tsx handleNavigateToExpand — navigate 시 기존 노드 expand

---

*작성일: 2026-04-27*
