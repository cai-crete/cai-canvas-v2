# 작업지시서: 생성 이미지 배지 클릭 → ExpandedView 연동

**날짜**: 2026-04-27  
**에이전트**: AGENT C (디자인/프론트엔드)

---

## 목표

1. PLAN/IMAGE 노드에서 생성한 이미지(artboardType=image)에서 **"PLAN"/"IMAGE" 배지를 클릭하면** 각각 해당 ExpandedView가 열리도록 변경
2. 모든 생성된 이미지에서 **"IMAGE" 배지 클릭 시 항상 스케치 가능한 뷰**로 열리도록 설정

---

## 변경 파일

### 1. `project_canvas/components/ExpandedView.tsx`
- `isSketchImageMode`: `artboardType === 'sketch' && type === 'image'` → `type === 'image'`  
  (artboardType=image 인 image 타입도 SketchToImageExpandedView로 라우팅)
- `isSketchPlanMode` : `artboardType === 'sketch' && type === 'plan'`  → `type === 'plan'`  
  (artboardType=image 인 plan 타입도 SketchToPlanExpandedView로 라우팅)
- 기존 정적 이미지 뷰 블록(`artboardType === 'image' && (type === 'image' || type === 'plan')`) 제거

### 2. `project_canvas/components/NodeCard.tsx`
- 배지 영역(`!isBlank`)을 클릭 가능한 `<button>`으로 변경
- `onClick={e => { e.stopPropagation(); onExpand(id); }}`
- handleArtboardPointerDown의 `closest('button')` 가드가 이미 존재 → 드래그/더블탭 충돌 없음

---

## 체크리스트

- [x] 작업지시서 생성
- [ ] `ExpandedView.tsx` 라우팅 변경 + 정적 뷰 섹션 제거
- [ ] `NodeCard.tsx` 배지 → 버튼 변환
- [ ] 진행상황 저장
