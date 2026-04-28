# 작업지시서: 생성 노드 artboardType 정의

## 목적
IMAGE 및 PLAN 노드에서 GENERATE 후 생성된 자식 노드에 "image" 성격(artboardType)을 부여하여,
해당 노드를 선택했을 때 ELEVATION, CHANGE VIEWPOINT, PRINT 탭이 활성화되도록 한다.

## 현재 문제
- `handleGenerateComplete` (IMAGE 생성) → 자식 노드 `artboardType: 'sketch'`
- `handleGeneratePlanComplete` (PLAN 생성) → 자식 노드 `artboardType: 'sketch'`
- `artboardType: 'sketch'`이면 사이드바에 IMAGE, PLAN 탭만 표시됨
- 원하는 동작: 생성 이미지 노드 선택 시 ELEVATION, CHANGE VIEWPOINT, DIAGRAM, PRINT 탭 표시

## 변경 대상 파일

### 1. `project_canvas/app/page.tsx`
- `handleGenerateComplete` (line ~796): `artboardType: 'sketch'` → `artboardType: 'image'`
- `handleGeneratePlanComplete` (line ~519): `artboardType: 'sketch'` → `artboardType: 'image'`

### 2. `project_canvas/components/ExpandedView.tsx`
- `artboardType === 'image'`이고 `type === 'image' || type === 'plan'`인 노드 expand 시
  → 스케치 에디터 대신 생성 이미지 뷰어 표시

## 체크리스트
- [x] exec-plan 파일 생성
- [x] page.tsx: handleGenerateComplete artboardType 수정
- [x] page.tsx: handleGeneratePlanComplete artboardType 수정
- [x] ExpandedView.tsx: 생성 이미지 뷰어 케이스 추가
- [x] progress 파일 저장
