# 지적도 내보내기(Export) 및 배경지도 미세조정(Offset) 구현 계획서

## 1. 개요
지적도 Expand 뷰에서 **(1) 현재 뷰포인트 그대로 Image Node로 내보내는 기능**과 **(2) 배경 지도(위성/벡터)만 별도로 드래그하여 지적선과 핏(Fit)을 맞추는 미세 조정 기능**을 통합하여 구현합니다.

---

## 2. 배경지도 미세 조정 (Map Offset) 구현 플랜

### 2.1. UX 및 상태 관리
- **위치**: 우측 패널(`CadastralPanel.tsx`)의 '배경 레이어(TMS)'와 '표시 옵션' 사이에 **[지도 미세조정] 토글 스위치**를 추가합니다.
- **조작**: 해당 토글을 켜고 마우스로 맵을 드래그하면, 지적선(빨간 선)과 화면 전체 뷰(카메라)는 가만히 있고 **배경 지도 이미지들만 상하좌우로 이동**합니다.
- **상태 관리**: `CanvasNode` 타입에 `cadastralMapOffset?: { x: number; y: number }` 속성을 추가하여, 사용자가 조정한 오프셋 값이 노드에 영구 저장되도록 합니다. (창을 닫았다 열어도 오프셋 유지)

### 2.2. 오프셋 히스토리 (Undo / Redo / Reset)
- 토글 활성화 시, 지적도 뷰(Canvas) **좌측에 플로팅 버튼 탭**이 나타납니다.
- **기능**:
  - **뒤로 가기 (Undo)**: 직전 드래그 전 상태로 오프셋 되돌리기
  - **앞으로 가기 (Redo)**: 되돌린 오프셋을 다시 앞으로 복구
  - **처음으로 (Reset)**: 오프셋을 0,0(초기화) 상태로 완전히 되돌림
- **기술**: `CadastralMapView.tsx` 내부에 `offsetHistory` 배열과 `historyIndex` 상태를 두고 마우스 드래그 종료(`onPointerUp`) 시점에만 이력을 저장합니다.

### 2.3. 기술적 구현 (SVG 로컬 좌표계 변환)
배경 지도는 현재 SVG 내부의 `<image>` 태그로 렌더링되고 있습니다. 
마우스 드래그(Screen Pixel) 거리를 SVG 내부의 **로컬 좌표계(Web Mercator) 비율로 환산**해야 합니다.
```typescript
// 1. SVG 내부 스케일 비율 계산
const internalScale = Math.min(containerW / viewBoxW, containerH / viewBoxH);

// 2. 화면 드래그(dx, dy)를 SVG 좌표계로 환산 (현재 줌 배율 view.scale 반영)
const svgDx = dx / view.scale / internalScale;
const svgDy = dy / view.scale / internalScale;

// 3. SVG <image> 태그의 x, y 좌표에 적용
<image x={tile.x + mapOffset.x} y={tile.y + mapOffset.y} />
```

---

## 3. 지적도 화면을 Image Node로 내보내기 (Export) 구현 플랜

### 3.1. UX 및 상태 관리
- **위치**: `CadastralPanel.tsx` 하단에 **[Image Node로 내보내기]** 버튼을 배치합니다.
- **동작**: 버튼 클릭 시 현재 뷰(줌, 패닝, 회전, 오프셋이 모두 적용된 화면)를 캡처하여 새로운 `Image` 노드로 빼내고, 현재 Expand 뷰를 닫습니다.

### 3.2. 기술적 구현 (Canvas 렌더링)
`html2canvas` 라이브러리를 사용하지 않고, React의 `forwardRef`와 순수 `Canvas API`를 사용하여 완벽한 고해상도 캡처를 수행합니다.
1. `exportToImage` 함수를 `CadastralMapView`에 노출시킵니다.
2. 현재 화면 크기와 동일한 메모리 `<canvas>`를 생성합니다.
3. SVG를 문자열로 직렬화하여 `Image` 객체로 로드합니다. (이때 프록시 API를 타게 되므로 CORS 문제 없이 배경지도도 포함됩니다)
4. Canvas Context(`ctx`)에 현재 카메라의 `translate`, `rotate`, `scale` 매트릭스를 적용합니다.
5. `ctx.drawImage`로 SVG를 그린 후 `canvas.toDataURL()`로 출력합니다.
6. `app/page.tsx`에서 이 Base64 문자열을 전달받아 새로운 `CanvasNode(type='image')`를 생성하고 `history`에 푸시합니다.

---

## 4. 작업 대상 파일 (Files to Modify)

1. **`types/canvas.ts`**
   - `CanvasNode` 타입에 `cadastralMapOffset?: { x: number; y: number }` 및 `cadastralIsOffsetMode?: boolean` 추가.
2. **`components/CadastralMapView.tsx`**
   - 드래그 이벤트 분기 (오프셋 모드일 때는 `mapOffset` 업데이트, 아닐 때는 카메라 뷰 업데이트)
   - 좌측 히스토리 플로팅 툴바(Undo/Redo/Reset) 렌더링
   - `<image>` 렌더링 시 `mapOffset` 반영
   - `exportToImage` 메서드를 노출하는 `forwardRef` 적용
3. **`components/ExpandedSidebar/CadastralPanel.tsx`**
   - [지도 조정] 토글 스위치 컴포넌트 추가
   - [Image Node로 내보내기] 하단 고정 버튼 추가
4. **`components/ExpandedView.tsx`**
   - `CadastralMapView`의 Ref를 받아 Export 실행 및 Base64 전달
5. **`app/page.tsx`**
   - `onExportCadastralImage` 핸들러 구현 (새 Image 노드 생성 로직)
