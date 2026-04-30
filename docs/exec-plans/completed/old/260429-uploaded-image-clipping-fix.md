# 작업지시서: ExpandedView 업로드 이미지 클리핑 버그 수정

**날짜**: 2026-04-29
**담당**: Claude

---

## 문제 정의

**현상**: ExpandedView에서 이미지를 업로드 했을 때, 업로드 된 이미지가 캔버스 상에 보이지 않음.
**원인**:
업로드 이미지 렌더링 구조에서 `img` 요소에 직접 `left: imageTransform.x` (예: -400px 등 음수값)가 적용되어 있는데, 캔버스 최상위 컨테이너의 `overflow: hidden`에 의해 레이아웃 기준으로 클리핑이 발생함. 반면, 참조 이미지(`referenceImageUrl`)는 명시적 크기(`width: cw`, `height: ch`)와 중심점 이동(`left: -cw/2`, `top: -ch/2`)이 적용된 `inner div` 래퍼로 한 겹 감싸져 있어 이 클리핑 문제를 우회하고 있음.

---

## 해결 방안

업로드 이미지(`uploadedImageData`)의 렌더링 DOM 구조를 참조 이미지 구조와 통일하여 명시적 크기의 `inner div`를 추가하고, 내부 `img`의 기준 좌표를 보정함.

### 수정 상세 (`project_canvas/components/SketchCanvas.tsx`)
1. **`uploadedImageData`의 `z=1` 영역 구조 변경**
   - 기존 외부 wrapper(transform 적용) 내부에 아래와 같은 `inner div` 래퍼를 추가:
     ```jsx
     <div style={{
       position: 'absolute',
       left: -cw / 2, top: -ch / 2,
       width: cw, height: ch,
       overflow: 'visible',
     }}>
     ```
2. **`img` 요소의 좌표 보정**
   - 새 래퍼(`inner div`)가 캔버스 중앙을 기준으로 `(-cw/2, -ch/2)`만큼 이동해 있으므로, `img` 요소의 절대 좌표값도 이에 맞춰 보정해야 기존 위치를 유지함.
   - `left`: `imageTransform.x + cw / 2`
   - `top`: `imageTransform.y + ch / 2`

---

## 체크리스트

- [x] `SketchCanvas.tsx`에서 업로드 이미지 렌더링 영역에 `inner div` 래퍼 추가
- [x] `img` 요소의 `left`, `top` 값에 `+ cw/2`, `+ ch/2` 보정 적용
- [x] 브라우저에서 이미지 업로드 기능 테스트 (이미지가 정상적으로 화면에 나타나는지 확인)
- [x] 업로드된 이미지의 리사이즈/회전/이동(transform) 조작이 기존과 같이 정상 동작하는지 검증
