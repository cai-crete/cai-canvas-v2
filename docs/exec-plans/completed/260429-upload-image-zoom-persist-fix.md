# 업로드 이미지 줌 동기화 & 크기 영속성 수정

## 배경
- Bug 1: ExpandedView에서 이미지 업로드 후 줌 177% 이상에서 이미지 위치가 stroke/grid와 어긋남 + 이미지 비율 왜곡
- Bug 2: ExpandedView에서 이미지 업로드 → collapse → re-expand 시 이미지 크기가 작아짐

## 원인
### Bug 1
- stroke: canvas ctx `translate(ox, oy) scale(zs)` 방식 (정확)
- grid: CSS `translate(ox, oy) scale(zs)` 방식 (정확)
- 업로드 이미지: `left: x*zs+ox, width: w*zs` 직접 계산 → sub-pixel 오차 줌 배율에 비례 누적

### Bug 2
- `loadState`에서 `applyImageTransform(state.imageTransform)` 후 `setUploadedImageData()` 호출
- `useEffect([uploadedImageData])` 트리거 → `imgScale = Math.min(...) * 0.8` 새 transform 계산
- 저장된 imageTransform을 덮어씀

## 수정 계획

### [A] SketchCanvas.tsx — 업로드 이미지 CSS transform wrapper 방식으로 변경
- z=1 업로드 이미지 렌더링 교체
- 현재: `<img left: x*zs+ox, width: w*zs, height: h*zs />`
- 변경: wrapper `translate(ox, oy) scale(zs)` + inner `<img left: x, top: y, width: w, height: h />`
- rotate는 inner img에 유지 (transformOrigin: center center = world 좌표 center → 올바름)
- `cw > 0` 조건 추가 (참조 이미지와 동일)

### [B] SketchCanvas.tsx — loadState 시 transform 보존
- `keepTransformNextLoadRef = useRef(false)` 추가
- `loadState`에서 uploadedImageData 설정 전 `keepTransformNextLoadRef.current = true`
- `useEffect([uploadedImageData])` 내부: 플래그 true이면 transform 재계산 건너뜀 + undo stack transform 반영

## 체크리스트
- [ ] Bug A: 업로드 이미지 CSS wrapper 방식으로 변경
- [ ] Bug B: keepTransformNextLoadRef 플래그 추가
- [ ] Bug B: loadState에서 플래그 세팅
- [ ] Bug B: useEffect에서 플래그 체크
- [ ] TypeScript 오류 없음 확인
