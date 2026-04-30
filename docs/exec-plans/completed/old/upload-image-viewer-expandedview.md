# 작업지시서: 업로드 이미지 → IMAGE ExpandedView 라우팅

## 목표
캔버스에 업로드된 이미지 노드(`type='image'`, `artboardType='image'`)에서
Expand 버튼 또는 IMAGE 버튼을 클릭했을 때,
빈 스케치 캔버스 대신 **이미지 뷰어(IMAGE ExpandedView)** 가 열리도록 한다.

---

## 현황 분석

### 업로드 이미지 노드 특성 (`page.tsx:handleUploadImage`)
| 필드 | 값 |
|------|-----|
| `type` | `'image'` |
| `artboardType` | `'image'` |
| `thumbnailData` | `data:image/...;base64,...` |
| `sketchData` | **없음** |
| `generatedImageData` | **없음** |

### 현재 라우팅 로직 (`components/ExpandedView.tsx:151-152`)
```tsx
const isSketchImageMode =
  node.type === 'image' || node.type === 'viewpoint' ||
  (viewMode === 'image' && node.artboardType === 'image');
```
→ `node.type === 'image'`면 무조건 `SketchToImageExpandedView`로 라우팅  
→ 업로드 이미지는 `generatedImageData` / `sketchData` 모두 없어 **빈 스케치 캔버스** 표시됨

### 노드 유형 분류 (artboardType 기준)
| 노드 | artboardType | 원하는 뷰 |
|------|-------------|-----------|
| 스케치→이미지 원본 | `sketch` | SketchToImageExpandedView (스케치 캔버스) |
| **업로드 이미지** | `image` | **IMAGE 뷰어** |
| AI 생성 이미지 결과 | `image` | **IMAGE 뷰어** |
| Viewpoint 결과 | `image` | **IMAGE 뷰어** |
| plan + IMAGE btn | `image` + viewMode='image' | SketchToImageExpandedView (기존 유지) |

---

## 변경 범위

### 파일 1: `project_canvas/components/ExpandedView.tsx`
**라우팅 조건 분리**

Before:
```tsx
const isSketchImageMode =
  node.type === 'image' || node.type === 'viewpoint' ||
  (viewMode === 'image' && node.artboardType === 'image');
```

After:
```tsx
// image/viewpoint 아트보드 → 이미지 뷰어
const isImageViewerMode =
  (node.type === 'image' || node.type === 'viewpoint') &&
  node.artboardType === 'image';

// sketch 아트보드 → 스케치 캔버스
// plan+IMAGE btn → 스케치 캔버스 (기존 유지)
const isSketchImageMode =
  (node.type === 'image' && node.artboardType === 'sketch') ||
  (viewMode === 'image' && node.artboardType === 'image' &&
   node.type !== 'image' && node.type !== 'viewpoint');
```

라우팅 블록 추가 (isSketchImageMode 블록 앞에):
```tsx
if (isImageViewerMode) {
  return (
    <ImageViewerExpandedView
      node={node}
      onCollapse={onCollapse}
    />
  );
}
```

import 추가:
```tsx
import ImageViewerExpandedView from '@/components/ImageViewerExpandedView';
```

---

### 파일 2 (신규): `project_canvas/components/ImageViewerExpandedView.tsx`
**이미지 뷰어 전용 ExpandedView**

구조:
- 좌측: 이미지 풀스크린 (object-fit: contain, 패딩 포함)
  - 표시 데이터: `node.generatedImageData ?? node.thumbnailData`
  - 이미지 없을 경우: 플레이스홀더 (회색 박스 + "이미지 없음")
- 우측: `ExpandedSidebar` (currentNodeType={node.type})
  - node.type='image' → "IMAGE" 사이드바
  - node.type='viewpoint' → "CHANGE VIEWPOINT" 사이드바
- [<-] collapse: `onCollapse()` 직접 호출

컴포넌트 Props:
```tsx
interface Props {
  node: CanvasNode;
  onCollapse: () => void;
}
```

---

### 파일 3: `project_canvas/app/page.tsx`
**변경 없음**

- `handleNodeTabSelect`의 IMAGE 버튼 처리는 이미 업로드 이미지 조건 포함
  ```tsx
  // 이미 처리됨 (line 654-663)
  type === 'image' &&
  selectedNode.artboardType === 'image' &&
  (selectedNode.type === 'plan' || selectedNode.type === 'image' || selectedNode.type === 'viewpoint')
  → setExpandedViewMode('image'); setExpandedNodeId(selectedNode.id);
  ```
- `onNodeExpand`: `expandedViewMode='default'` 설정 → `isImageViewerMode`는 viewMode 무관하게 라우팅 → 문제 없음

---

## 체크리스트

- [x] `components/ImageViewerExpandedView.tsx` 신규 생성
  - [x] 이미지 렌더링 (generatedImageData ?? thumbnailData)
  - [x] 이미지 없을 때 플레이스홀더
  - [x] ExpandedSidebar 연결 (currentNodeType={node.type})
  - [x] onCollapse 연결
- [x] `components/ExpandedView.tsx` 라우팅 수정
  - [x] `isImageViewerMode` 조건 추가
  - [x] `isSketchImageMode` 조건 범위 축소 (sketch artboard만)
  - [x] `isImageViewerMode` 라우팅 블록 추가 (isSketchImageMode 앞)
  - [x] ImageViewerExpandedView import 추가
- [ ] 동작 검증
  - [ ] 업로드 이미지 Expand → IMAGE 뷰어 열림
  - [ ] 업로드 이미지 IMAGE 버튼 → IMAGE 뷰어 열림
  - [ ] viewpoint 노드 Expand → IMAGE 뷰어 열림
  - [ ] AI 생성 image 노드 Expand → IMAGE 뷰어 열림
  - [ ] sketch artboard image 노드 Expand → 스케치 캔버스 열림 (기존 유지)
  - [ ] plan + IMAGE 버튼 → SketchToImageExpandedView 유지 (기존 유지)

---

## 우선순위 및 영향 범위

- 영향 범위: **image / viewpoint 타입 노드 전체**
- 기존 plan 노드 동작: **변경 없음**
- 기존 스케치 원본 노드 동작: **변경 없음**
- 위험도: 낮음 (라우팅 분기 추가, 기존 로직 보존)
