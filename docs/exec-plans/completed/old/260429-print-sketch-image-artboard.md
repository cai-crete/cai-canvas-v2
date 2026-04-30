# 작업지시서: Print 버튼 — sketch/image 아트보드 모두 ExpandedView 진입

## 날짜: 2026-04-29

## 목표
- `artboardType='sketch'` 노드: 우측 PRINT 버튼 활성화 + 클릭 시 Print ExpandedView 진입 (thumbnailData 사용)
- `artboardType='image'` 노드: 단일/다중 선택 모두 Print ExpandedView 정상 진입

## 원인
1. `ARTBOARD_COMPATIBLE_NODES.sketch`에 `'print'` 미포함 → 버튼 비활성
2. `handleNodeTabSelect` print 블록 필터가 `artboardType === 'image'` 만 허용 → sketch 노드 제외

## 변경 파일

### 1. `project_canvas/types/canvas.ts`
- `ARTBOARD_COMPATIBLE_NODES.sketch`: `['image', 'plan']` → `['image', 'plan', 'print']`

### 2. `project_canvas/app/page.tsx`
- `handleNodeTabSelect` print 블록 필터:
  - `n.artboardType === 'image'` → `n.artboardType === 'image' || n.artboardType === 'sketch'`
  - 이미지 소스: `generatedImageData ?? thumbnailData` (sketch는 thumbnailData만 존재, 기존 코드 그대로 커버)

## 체크리스트
- [ ] `types/canvas.ts`: ARTBOARD_COMPATIBLE_NODES.sketch에 'print' 추가
- [ ] `page.tsx`: print 필터를 sketch | image 로 확장
- [ ] 브라우저 검증: sketch 아트보드 단일 선택 → PRINT 버튼 활성 확인
- [ ] 브라우저 검증: sketch 아트보드 PRINT 클릭 → Print ExpandedView 진입 + thumbnailData 이미지 로드 확인
- [ ] 브라우저 검증: image 아트보드 단일/다중 선택 → Print ExpandedView 진입 확인
- [ ] 회귀 검증: 기존 uploaded image PRINT 흐름 정상 확인
