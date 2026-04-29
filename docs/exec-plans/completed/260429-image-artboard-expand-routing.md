# 작업지시서: artboardType=Image 노드 버튼 별 ExpandedView 분기 라우팅

## 목적
artboardType=Image인 노드에서 우측 사이드바 버튼 [PLAN] / [IMAGE] 클릭 및 더블클릭 시 각각 올바른 ExpandedView로 진입하도록 라우팅 연결

## 요구사항
- [PLAN] 클릭 → Plan ExpandedView (`sketch-to-plan/ExpandedView.tsx`) 진입
- [IMAGE] 클릭 → Sketch-to-Image ExpandedView (`sketch-to-image/ExpandedView.tsx`) 진입
- 더블클릭(기존 expandedViewMode='default') → Sketch-to-Image ExpandedView 진입

## 현황 분석

### 이미 구현된 것 (변경 불필요)
- `page.tsx:176` — `expandedViewMode` 상태 (`'image' | 'plan' | 'default'`) 존재
- `page.tsx:885` — [PLAN] 클릭 시 `setExpandedViewMode('plan')` 설정
- `page.tsx:898` — [IMAGE] 클릭 시 `setExpandedViewMode('image')` 설정
- `page.tsx:590` — `handleReturnFromExpand`에서 `setExpandedViewMode('default')` 리셋

### 문제점 (수정 필요)
1. `expandedViewMode`가 `<ExpandedView>` 컴포넌트에 **전달되지 않음** (page.tsx)
2. `ExpandedView.tsx`가 `expandedViewMode` prop을 받지 않아 분기 불가
3. `ExpandedView.tsx`에서 `artboardType === 'image'` 시 무조건 기존 이미지 뷰어만 렌더링

### 목표 라우팅 (수정 후)
| 진입 경로 | expandedViewMode | 렌더링 |
|-----------|-----------------|--------|
| [PLAN] 클릭 | `'plan'` | `SketchToPlanExpandedView` |
| [IMAGE] 클릭 | `'image'` | `SketchToImageExpandedView` |
| 더블클릭 | `'default'` | `SketchToImageExpandedView` |

## 체크리스트

- [ ] **Step 1**: `ExpandedView.tsx` Props 인터페이스에 `expandedViewMode?: 'image' | 'plan' | 'default'` 추가
- [ ] **Step 2**: `ExpandedView.tsx` 라우팅 로직 수정
  - `artboardType === 'image'` + `expandedViewMode === 'plan'` → `SketchToPlanExpandedView` 렌더링
  - `artboardType === 'image'` + (`expandedViewMode === 'image'` 또는 `'default'`) → `SketchToImageExpandedView` 렌더링
  - 기존 이미지 뷰어 분기(`node.artboardType === 'image' && (node.type === 'image' || node.type === 'plan')`) 제거 또는 위 두 분기 아래로 이동
- [ ] **Step 3**: `page.tsx`에서 `<ExpandedView>`에 `expandedViewMode={expandedViewMode}` prop 전달

## 수정 대상 파일
- `project_canvas/components/ExpandedView.tsx`
- `project_canvas/app/page.tsx`

## 범위 외 (수정 없음)
- `sketch-to-plan/ExpandedView.tsx` — 기존 그대로 사용
- `sketch-to-image/ExpandedView.tsx` — 기존 그대로 사용
- `page.tsx` 상태/핸들러 로직 — 이미 완성됨
- `RightSidebar.tsx` — 이미 완성됨
