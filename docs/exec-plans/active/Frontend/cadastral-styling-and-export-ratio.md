# 지적도 스타일링 및 내보내기 비율 조정 실행 계획서

## 1. 개요
지적도 Export 시 노드 규격(297:210)에 맞춘 **정확한 비율 크롭(Crop)**, **벡터 지도 흑백(Grayscale) 처리**, 그리고 **선택 대지 내부 채우기 토글**을 구현합니다. 미세조정 모드 토글은 향후 사용을 위해 코드만 남기고 UI에서 숨깁니다(Hidden).

---

## 2. 세부 구현 플랜

### 2.1. 내보내기 이미지 비율 고정 (297:210)
- **문제점**: 현재 전체 화면 크기(예: 16:9)로 캡처되어 `image` 노드의 297:210(A4 비율) 썸네일 뷰에서 상하/좌우가 잘려나가는 현상 발생.
- **해결책**:
  - `CadastralMapView`의 `exportToImage` 함수 내부 캡처 로직을 수정합니다.
  - 현재 컨테이너(`rect`)의 가로세로 비율을 판별하여, 중앙을 기준으로 정확히 **297:210 비율을 갖는 타겟 Canvas**를 생성합니다.
  - `ctx.translate` 매트릭스를 조정하여 화면 중앙 영역만 캔버스에 꽉 차게 렌더링되도록 크롭(Crop) 캡처합니다.

### 2.2. 벡터 지도 흑백 처리 (Grayscale)
- **요구사항**: `tmsType`이 'Vector'일 경우 배경 타일 이미지가 흑백으로 표시 및 캡처되도록 처리.
- **해결책**:
  - SVG 내부 `<image>` 렌더링 시 `style={{ filter: tmsType === 'Vector' ? 'grayscale(100%)' : 'none' }}`를 적용합니다.
  - 캔버스 렌더링(`exportToImage`) 시에도 이 CSS 필터 속성이 유지되어 흑백 배경 위에 빨간 지적선이 뚜렷하게 보이게 됩니다.

### 2.3. 선택 대지 내부 채우기 토글 및 UI 숨김 처리
- **UX/상태 관리**:
  - `types/canvas.ts`의 `CanvasNode`에 `cadastralFillSelected?: boolean` 속성을 추가합니다.
  - `CadastralPanel.tsx`에 **"선택 대지 내부 색칠"** 토글을 새롭게 추가합니다.
  - **"배경 지도 미세조정 모드"** 토글 영역은 `className="hidden"`을 적용해 시각적으로만 숨깁니다(코드 보존).
- **기술적 구현**:
  - `CadastralMapView`에 `fillSelected` prop을 추가합니다.
  - 메인 필지(선택 대지)의 SVG `<path>` 렌더링 시, 토글이 켜져 있으면 `fill="rgba(239, 68, 68, 0.3)"`, 꺼져 있으면 `fill="transparent"`(투명)가 되도록 분기 처리합니다. 선(Stroke)은 항상 붉은색(`#EF4444`)을 유지합니다.

---

## 3. 작업 대상 파일 (Files to Modify)

1. **`types/canvas.ts`**
   - `cadastralFillSelected?: boolean` 추가.
2. **`components/CadastralMapView.tsx`**
   - `fillSelected` prop 추가 및 `<path>` fill 색상 동적 바인딩.
   - 타일 `<image>`에 `grayscale` 필터 바인딩.
   - `exportToImage` 캔버스 크기 및 중앙 정렬(297:210 크롭) 로직 추가.
3. **`components/ExpandedSidebar/CadastralPanel.tsx`**
   - "선택 대지 색칠" 토글 컴포넌트 신규 추가.
   - "지도 미세조정" 토글 컨테이너에 `hidden` 클래스 추가.
4. **`components/ExpandedView.tsx`**
   - `CadastralMapView` 렌더링 시 `fillSelected={node.cadastralFillSelected ?? true}` prop 전달.
