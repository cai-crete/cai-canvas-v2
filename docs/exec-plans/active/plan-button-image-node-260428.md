# 작업지시서: 이미지 노드에서 PLAN 버튼 활성화 + Plan ExpandedView 진입

**작성일**: 2026-04-28  
**우선순위**: High  
**담당**: AGENT C

---

## 요구사항

1. **생성된 평면도 선택 시**: 우측 노드 버튼 "PLAN" 활성화 → 클릭 시 Plan ExpandedView 진입
2. **업로드한 사진 선택 시**: 우측 노드 버튼 "PLAN" 활성화 → 클릭 시 Plan ExpandedView 진입

---

## 현황 분석

### 노드 데이터 구조

| 노드 종류 | type | artboardType | 보유 데이터 |
|----------|------|-------------|------------|
| 생성된 평면도 | `'plan'` | `'image'` | sketchData, generatedImageData, generatedPlanData |
| 업로드한 사진 | `'image'` | `'image'` | thumbnailData |

### 문제 1: PLAN 버튼이 비활성화됨

`project_canvas/types/canvas.ts` L193:
```typescript
ARTBOARD_COMPATIBLE_NODES = {
  sketch:    ['image', 'plan'],
  image:     ['elevation', 'viewpoint', 'diagram', 'print'],  // ← 'plan' 없음
  thumbnail: ['planners', 'print'],
}
```
→ artboardType='image' 노드 선택 시 PLAN 버튼이 disabled 상태

### 문제 2: 클릭 시 잘못된 ExpandedView 진입 (이미지 노드)

`project_canvas/components/ExpandedView.tsx` L150-153:
```typescript
const isSketchImageMode =
  node.type === 'image' || node.type === 'viewpoint' ||   // ← type='image'면 무조건 Image View
  (viewMode === 'image' && node.artboardType === 'image');
const isSketchPlanMode = node.type === 'plan' && viewMode !== 'image';
```
→ type='image' 노드는 viewMode 무관하게 항상 SketchToImageExpandedView로 라우팅됨

### 문제 3: SketchToPlanExpandedView가 업로드 이미지를 로드하지 못함

`project_canvas/sketch-to-plan/ExpandedView.tsx` L162-167:
```typescript
// sketchData → generatedImageData 순으로 fallback, thumbnailData 없음
if (node.sketchData) { ... }
else if (node.generatedImageData) { ... }
// thumbnailData fallback 없음
```
→ 업로드한 사진 노드(thumbnailData만 보유)로 진입 시 스케치 캔버스 빈 상태

---

## 수정 계획 (4개 파일)

### Change 1 — `project_canvas/types/canvas.ts`
**위치**: L193  
**변경**: `ARTBOARD_COMPATIBLE_NODES['image']`에 `'plan'` 추가

```typescript
// 변경 전
image: ['elevation', 'viewpoint', 'diagram', 'print'],
// 변경 후
image: ['elevation', 'viewpoint', 'plan', 'diagram', 'print'],
```

---

### Change 2 — `project_canvas/app/page.tsx`
**위치**: L160 (expandedViewMode 타입), L652 앞 (PLAN 버튼 핸들러 추가)

**(A)** `expandedViewMode` 타입 확장:
```typescript
// 변경 전
const [expandedViewMode, setExpandedViewMode] = useState<'image' | 'default'>('default');
// 변경 후
const [expandedViewMode, setExpandedViewMode] = useState<'image' | 'plan' | 'default'>('default');
```

**(B)** `handleNodeTabSelect` 내 IMAGE 핸들러 블록(L652~661) **앞**에 PLAN 핸들러 추가:
```typescript
/* PLAN 탭 + image 아트보드 노드 → Plan ExpandedView */
if (
  type === 'plan' &&
  selectedNode.artboardType === 'image' &&
  (selectedNode.type === 'plan' || selectedNode.type === 'image' || selectedNode.type === 'viewpoint')
) {
  setExpandedViewMode('plan');
  setExpandedNodeId(selectedNode.id);
  setActiveSidebarNodeType(null);
  return;
}
```

---

### Change 3 — `project_canvas/components/ExpandedView.tsx`
**위치**: L150-153 (라우팅 조건), Props viewMode 타입

**(A)** Props의 `viewMode` 타입 업데이트:
```typescript
// 변경 전
viewMode?: 'image' | 'default';
// 변경 후
viewMode?: 'image' | 'plan' | 'default';
```

**(B)** 라우팅 조건 수정:
```typescript
// 변경 전
const isSketchImageMode =
  node.type === 'image' || node.type === 'viewpoint' ||
  (viewMode === 'image' && node.artboardType === 'image');
const isSketchPlanMode = node.type === 'plan' && viewMode !== 'image';

// 변경 후
const isSketchImageMode =
  (node.type === 'image' || node.type === 'viewpoint') && viewMode !== 'plan' ||
  (viewMode === 'image' && node.artboardType === 'image');
const isSketchPlanMode =
  (node.type === 'plan' && viewMode !== 'image') ||
  ((node.type === 'image' || node.type === 'viewpoint') && viewMode === 'plan');
```

---

### Change 4 — `project_canvas/sketch-to-plan/ExpandedView.tsx`
**위치**: L162-167 (초기 이미지 로드 fallback)

```typescript
// 변경 전
if (node.sketchData) {
  sketchCanvasRef.current?.loadImage(node.sketchData, false, true);
} else if (node.generatedImageData) {
  sketchCanvasRef.current?.loadImage(node.generatedImageData);
}

// 변경 후
if (node.sketchData) {
  sketchCanvasRef.current?.loadImage(node.sketchData, false, true);
} else if (node.generatedImageData) {
  sketchCanvasRef.current?.loadImage(node.generatedImageData);
} else if (node.thumbnailData) {
  sketchCanvasRef.current?.loadImage(node.thumbnailData);
}
```

---

## 체크리스트

- [x] Change 1: `types/canvas.ts` — ARTBOARD_COMPATIBLE_NODES['image']에 'plan' 추가
- [x] Change 2A: `app/page.tsx` — expandedViewMode 타입에 'plan' 추가
- [x] Change 2B: `app/page.tsx` — handleNodeTabSelect에 PLAN 핸들러 추가
- [x] Change 3A: `components/ExpandedView.tsx` — Props viewMode 타입 업데이트
- [x] Change 3B: `components/ExpandedView.tsx` — 라우팅 조건 수정
- [x] Change 4: `sketch-to-plan/ExpandedView.tsx` — thumbnailData fallback 추가
- [ ] 동작 검증: 생성된 평면도 선택 → PLAN 버튼 활성화 확인
- [ ] 동작 검증: 생성된 평면도 PLAN 버튼 클릭 → Plan ExpandedView 진입 확인
- [ ] 동작 검증: 업로드한 사진 선택 → PLAN 버튼 활성화 확인
- [ ] 동작 검증: 업로드한 사진 PLAN 버튼 클릭 → Plan ExpandedView 진입 확인
- [ ] 동작 검증: 업로드한 사진 PLAN ExpandedView에서 사진이 스케치 캔버스에 로드되는지 확인
- [ ] 회귀 검증: IMAGE 버튼 클릭 → SketchToImageExpandedView 정상 진입 확인
- [ ] 회귀 검증: 스케치 노드(type='sketch') PLAN 버튼 → 기존 동작 유지 확인

---

## 영향 범위

| 파일 | 변경 규모 | 영향 |
|------|---------|------|
| `types/canvas.ts` | 1줄 | ARTBOARD_COMPATIBLE_NODES 확장 |
| `app/page.tsx` | 10줄 | handleNodeTabSelect 분기 추가 |
| `components/ExpandedView.tsx` | 4줄 | 라우팅 조건 수정 |
| `sketch-to-plan/ExpandedView.tsx` | 2줄 | thumbnailData fallback 추가 |

**회귀 위험**: 낮음 — 기존 'image'→Image View 경로는 `viewMode !== 'plan'`으로 보호됨
