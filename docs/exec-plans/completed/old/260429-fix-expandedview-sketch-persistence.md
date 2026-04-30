# ExpandedView 스케치(스트로크) 상태 유지 버그 수정

## 1. 개요
사용자가 `ExpandedView`에서 렌더링된 이미지 위에 스케치(스트로크)를 추가한 뒤, 메인 캔버스로 복귀하거나 다시 `ExpandedView`로 진입할 때 해당 스케치 내역이 사라지는 현상 해결.

## 2. 문제 원인 파악 (가설)
- `ExpandedView` 닫기 동작 시, 현재 캔버스(`SketchCanvas`)에 그려진 `paths` (스케치 벡터 데이터)가 노드 상태(Node state)에 올바르게 저장(sync)되지 않고 있음.
- 메인 캔버스 썸네일에 스케치 데이터를 병합하여 렌더링하는 로직(`exportThumbnail` 등)이 누락되었거나 `paths` 데이터를 포함하지 않고 있음.
- `ExpandedView` 재진입 시, 노드에 저장되어 있어야 할 `sketchPaths` 데이터가 복원(rehydrate)되지 않아 빈 상태로 렌더링됨.

## 3. 작업 계획 (체크리스트)
- [ ] `project_canvas/components/SketchCanvas.tsx` 및 관련 스토어 파일(예: `useCanvasStore.ts` 등) 분석.
- [ ] `ExpandedView`에서 메인 캔버스로 돌아갈 때 현재 그려진 `paths` 데이터를 해당 노드 속성(예: `node.data.sketchPaths`)에 저장하는 로직 추가/수정.
- [ ] 노드 썸네일 업데이트 시 배경 이미지와 `paths`가 함께 렌더링되어 메인 캔버스에 표시되도록 `exportThumbnail` 또는 이미지 병합 로직 수정.
- [ ] 다시 `ExpandedView`로 진입할 때 `node.data.sketchPaths` 데이터를 `SketchCanvas`의 초기 상태로 로드(rehydrate)하는 로직 수정.
- [ ] 수정한 로직이 기존 트랜스폼(Pan/Zoom)과 충돌하지 않는지 검증.

## 4. 필요 사항 (질문/확인)
- 특별히 질문할 사항은 없으나, 작업 승인이 필요합니다.
