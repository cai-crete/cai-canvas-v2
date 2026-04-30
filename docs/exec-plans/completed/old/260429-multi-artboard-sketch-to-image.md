# 작업지시서: 다중 아트보드 → Sketch-to-Image (N3_Image) 발동

**생성일:** 2026-04-29  
**우선순위:** P1  
**관련 노드:** N3_Image (Cut-off: 3)

---

## 0. 목표 요약

캔버스에서 아트보드 2개(평면도 + 입면도)를 선택한 후 [SKETCH TO IMAGE] 버튼 클릭 →  
SketchToImage ExpandedView 진입 시 선택한 노드들이 우측 사이드바  
**"INPUT IMAGES" 섹션의 평면도/입면도 슬롯에 자동 배치**되는 UX.

- INPUT IMAGES 섹션은 **다중 선택 시에만** 표시 (단일/신규 = 기존 스케치 단독 모드 유지)
- 슬롯은 **평면도 / 입면도** 2개 고정 레이블 (Gemini 분석 컨텍스트용 역할 태그)
- 입면도 슬롯: 핸드 스케치일 수도, 레퍼런스 이미지일 수도 있음 → 데이터 추출 방식 동일
- 자동 배치 후 슬롯 간 **swap ⇄ 버튼**으로 순서 교환 가능
- PRINT 노드의 `printSelectedImages` 패턴을 동일하게 적용

---

## 1. 레퍼런스: PRINT 노드 패턴

```
캔버스 다중선택 (selectedNodeIds)
    ↓ [PRINT] 버튼 클릭 (page.tsx:823)
imageNodes = selectedNodeIds → filter(artboardType === 'image' | 'sketch')
preloadedImages = imageNodes.map(n =>
  nodeImageToSelectedImage(n.generatedImageData ?? n.thumbnailData, n.id)
)
    ↓
새 print CanvasNode 생성 { printSelectedImages: preloadedImages }
    ↓ setExpandedNodeId(newId)
PrintExpandedView ← node.printSelectedImages → "INSERT IMAGE" 사이드바 표시
```

---

## 2. 자동 배치 판별 로직 (데이터 구조 기반, 노드 타입 무관)

노드 `type` 필드가 아닌 **아트보드 데이터 필드**로 판별한다.

```ts
// 스케치 아트보드 판별
const isSketchArtboard = (n: CanvasNode) =>
  n.artboardType === 'sketch' || !!n.sketchPaths || !!n.sketchData;

// 자동 분류
const elevNode = sketchInputNodes.find(isSketchArtboard);          // 입면도 슬롯 우선
const planNode = sketchInputNodes.find(n => !isSketchArtboard(n)); // 평면도 슬롯 우선

// 판별 불가(둘 다 동일 유형): 선택 순서 그대로 (소스 1 = 평면도, 소스 2 = 입면도)
```

**판별 우선순위 요약:**

| 슬롯 | 자동 배치 조건 | 판별 불가 시 |
|------|---------------|-------------|
| 평면도 | `artboardType === 'image'` (스케치 필드 없음) | 선택 순서 첫 번째 |
| 입면도 | `artboardType === 'sketch'` 또는 sketchPaths/sketchData 있음 | 선택 순서 두 번째 |

> swap ⇄ 버튼으로 언제든 교환 가능하므로 자동 배치 정확도 요건 낮음.

### 데이터 추출 방식 (양쪽 슬롯 동일)

입면도가 핸드 스케치든 레퍼런스 이미지든 동일한 우선순위로 추출한다.

```ts
const getNodeBase64 = (n: CanvasNode): string | undefined =>
  n.generatedImageData ?? n.sketchData ?? n.thumbnailData;

const sketchInputImages: SelectedImage[] = [
  planNode && {
    id: planNode.id,
    base64: getNodeBase64(planNode)!,
    role: '평면도',
    mimeType: 'image/png',
  },
  elevNode && {
    id: elevNode.id,
    base64: getNodeBase64(elevNode)!,
    role: '입면도',
    mimeType: 'image/png',
  },
].filter(Boolean) as SelectedImage[];
```

---

## 3. 전체 파이프라인

```
캔버스 다중선택 (selectedNodeIds ≥ 2)
    ↓ [SKETCH TO IMAGE] 버튼 클릭
isSketchArtboard() 판별 → planNode / elevNode 자동 분류
sketchInputImages = [{ role:'평면도', base64 }, { role:'입면도', base64 }]
    ↓
새 image CanvasNode 생성 { sketchInputImages }
다중 엣지 생성 (각 소스 노드 → 새 노드)
    ↓ setExpandedNodeId(newId)
SketchToImageExpandedView ← node.sketchInputImages
inputImages state 초기화 (mount-only)
    ↓
우측 사이드바 INPUT IMAGES 섹션 표시
    ├── [평면도 thumb] ⇄ [입면도 thumb]
    └── × 개별 슬롯 비우기 / ⇄ swap
    ↓ [GENERATE] 클릭
useBlueprintGeneration.generate(sketchBase64, params, inputSources: inputImages)
    ↓
API /api/sketch-to-image { input_sources: [{ id, data, mime_type, role }] }
    ↓
render-server Phase 1 (gemini-3.1-pro-preview)
  ROOM 1: 소스 분류 (소스1=평면도, 소스2=입면도)
  ROOM 2: 두 도면 통합 Mode 결정
  ROOM 3: 평면 공간구성 × 입면 파사드 기하학 → analysis-spec JSON (passed: true|false)
    ↓ FM-04: passed=false → ROOM 3 재실행
render-server Phase 2 (gemini-3.1-flash-image-preview)
  ROOM 4: 4-Layer 시공 (평면+입면 기반 3D 투시)
  ROOM 5: 기하학 무결성 검증 (FM-01~04)
    ↓
generated_image + analysis_report → 응답
Supabase 비동기 저장 (uploadToStorage)
    ↓
Red Team 검증 (Cut-off: 3)
  cumulative_score < 3 → VERIFYING_RETRY
  cumulative_score ≥ 3 → REALIZED → 캔버스 안착
```

---

## 4. 우측 사이드바 UI 조직도

### 단일 선택 / 신규 노드 → 변경 없음

```
SketchToImagePanel
├── [PROMPT]           textarea (2000자)
├── [MODE]             CONCEPT / DETAIL
├── [CRE-TE STYLE]     A B C D E F G NONE
│   └── 스타일 상세 카드
├── [ASPECT RATIO]     1:1 / 4:3 / 16:9
├── [RESOLUTION]       FAST / NORMAL / HIGH
├── [Error 메시지]     (에러 시만)
├── [GENERATE 버튼]
└── [Footer]
```

### 다중 선택 → sketchInputImages 존재 시

```
SketchToImagePanel
├── [INPUT IMAGES]     ← inputImages 유효 항목 ≥ 1일 때만 표시
│   ├── ┌──────────────┐         ┌──────────────┐
│   │   │  [60×60 img] │   ⇄   │  [60×60 img] │
│   │   │  평면도  [×] │         │  입면도  [×] │
│   │   └──────────────┘         └──────────────┘
│   │   (슬롯 비어있으면 점선 빈칸 + "비어있음")
│   └── (섹션 하단 구분선)
├── [PROMPT]
├── [MODE]
├── [CRE-TE STYLE]
├── [ASPECT RATIO]
├── [RESOLUTION]
├── [Error 메시지]
├── [GENERATE 버튼]
└── [Footer]
```

### INPUT IMAGES 섹션 상세 스펙

```
┌── INPUT IMAGES ──────────────────────────────────────┐
│  ┌────────────────┐         ┌────────────────┐       │
│  │  [60×60 img]   │   ⇄   │  [60×60 img]   │       │
│  │  평면도   [×]  │         │  입면도   [×]  │       │
│  └────────────────┘         └────────────────┘       │
└──────────────────────────────────────────────────────┘
```

**슬롯 스타일:**
- thumbnail: 60×60px, `border-radius: 0.5rem`, `object-fit: cover`
- 슬롯 레이블: `var(--font-family-bebas)` / 0.625rem / `var(--color-gray-400)` (기존 sectionLabel 동일)
- 빈 슬롯: `border: 1px dashed var(--color-gray-200)`, 중앙 "비어있음" 텍스트
- × 버튼: 슬롯 우상단 오버레이, 14×14px — 클릭 시 해당 슬롯을 `null`로 교체 (슬롯 자체는 유지)
- 섹션 숨김: 두 슬롯 모두 `null`인 경우

**swap ⇄ 버튼 스펙:**
- 위치: 두 슬롯 사이 수직 중앙
- 크기: 28×28px, `border-radius: 50%`, `background: rgba(0,0,0,0.04)`
- 아이콘: 좌우 교환 화살표 SVG 16×16
- 활성 조건: 양쪽 슬롯 **모두 채워진 경우만** (`opacity: 1`, `pointer-events: auto`)
- 비활성: 1개만 채워진 경우 `opacity: 0.3`, `pointer-events: none`
- hover: `background: rgba(0,0,0,0.08)`
- 클릭: `setInputImages(prev => [prev[1], prev[0]])` (인덱스 0↔1 swap)

```tsx
// swap SVG
<svg viewBox="0 0 20 20" width={16} height={16}
  stroke="currentColor" fill="none" strokeWidth={1.5}
  strokeLinecap="round" strokeLinejoin="round">
  <path d="M4 7h12M13 4l3 3-3 3" />
  <path d="M16 13H4M7 10l-3 3 3 3" />
</svg>
```

---

## 5. 구현 체크리스트

### Tier 1 — 데이터 모델 (`project_canvas/types/canvas.ts`)
- [ ] `CanvasNode`에 `sketchInputImages?: SelectedImage[]` 필드 추가
- [ ] `SelectedImage` 타입에 `role?: string` 필드 필요 여부 확인 (없으면 로컬 확장 타입 정의)

### Tier 2 — 노드 생성 (`project_canvas/app/page.tsx`)
- [ ] `handleNodeTypeSelect('image')` 분기:
  - `sketchInputNodes` = `selectedNodeIds`에서 artboard 노드 필터
  - `isSketchArtboard()` 판별 → `elevNode` / `planNode` 분류
  - `getNodeBase64(n)` = `n.generatedImageData ?? n.sketchData ?? n.thumbnailData`
  - `sketchInputImages` 배열 구성 (role: '평면도'/'입면도')
  - 새 image CanvasNode에 `sketchInputImages` 주입
  - `sketchInputNodes.length > 1`이면 다중 엣지 생성 (PRINT 패턴 line 858 참고)

### Tier 3 — ExpandedView (`project_canvas/sketch-to-image/ExpandedView.tsx`)
- [ ] `inputImages` state: `useState<(SelectedImage | null)[]>(node.sketchInputImages ?? [])`
  - 인덱스 0 = 평면도 슬롯, 인덱스 1 = 입면도 슬롯
- [ ] mount-only `useEffect`: `node.id` 변경 시 `inputImages` 재초기화
- [ ] `handleGenerate`에서 `inputImages.filter(Boolean)`를 `generate()`의 `inputSources`로 전달
- [ ] `SketchToImagePanel` props에 `inputImages`, `onInputImagesChange` 전달

### Tier 4 — 사이드바 패널 (`project_canvas/components/panels/SketchToImagePanel.tsx`)
- [ ] props 추가:
  - `inputImages?: (SelectedImage | null)[]`
  - `onInputImagesChange?: (imgs: (SelectedImage | null)[]) => void`
- [ ] 섹션 표시 조건: `inputImages?.some(Boolean)` (유효 항목 1개 이상)
- [ ] 슬롯 0 = 평면도, 슬롯 1 = 입면도 고정 레이블 렌더
- [ ] × 클릭: `onInputImagesChange(inputImages.map((img, i) => i === idx ? null : img))`
- [ ] swap 버튼: `onInputImagesChange([inputImages[1], inputImages[0]])`
  - 활성 조건: `inputImages[0] != null && inputImages[1] != null`
- [ ] 빈 슬롯: 점선 border + "비어있음" 텍스트
- [ ] 섹션 전체 숨김: 양쪽 모두 `null`

### Tier 5 — Generation Hook (`project_canvas/hooks/useBlueprintGeneration.ts`)
- [ ] `generate()` 시그니처에 `inputSources?: SelectedImage[]` 추가
- [ ] `inputSources?.length > 0`이면 API body에 추가:
  ```ts
  input_sources: inputSources.map((img, idx) => ({
    id: img.id,
    data: img.base64,
    mime_type: img.mimeType,
    role: img.role ?? `소스 ${idx + 1}`,
  }))
  ```
- [ ] 기존 `sketch_image` 단일 입력 하위호환 유지

### Tier 6 — API 라우트 (`project_canvas/app/api/sketch-to-image/route.ts`)
- [ ] `input_sources?: Array<{ id, data, mime_type, role }>` 수신 및 render-server 전달

### Tier 7 — render-server (`render-server/src/routes/sketchToImage.ts`)
- [ ] `input_sources[]` 파싱 → `finalParts` 구성:
  ```ts
  const finalParts = input_sources?.length
    ? input_sources.map(src => ({
        inlineData: { mimeType: src.mime_type as AllowedMimeType, data: src.data }
      }))
    : [imagePart]; // 기존 단일 sketch_image fallback
  ```
- [ ] Phase 1 분석 프롬프트 수정 (다중 소스 감지 시):
  ```
  입력 소스: 2개
  소스 1 (평면도): 평면 공간 구성 및 치수 체계를 분석하세요.
  소스 2 (입면도): 파사드 기하학 및 층고 체계를 분석하세요.
  두 도면을 통합하여 3D 투시 관점의 analysis-spec을 생성하세요.
  ```
- [ ] `contents[].parts = [...finalParts, { text: analysisPrompt }]` 적용

---

## 6. 완료 기준

- [ ] image 아트보드 **1개** 선택 → Sketch-to-Image: INPUT IMAGES 섹션 미표시, 기존 동작 유지
- [ ] 아트보드 **2개** 선택 → ExpandedView 진입 시 INPUT IMAGES 섹션에 평면도/입면도 슬롯 자동 배치
- [ ] swap ⇄ 버튼: 양쪽 슬롯 모두 채워진 경우만 활성, 클릭 시 이미지 교환
- [ ] × 버튼: 개별 슬롯 비우기 → 빈 슬롯(점선) 표시, 슬롯 레이블 유지
- [ ] 양쪽 슬롯 모두 비어있으면 INPUT IMAGES 섹션 자동 숨김
- [ ] GENERATE → Phase 1에서 두 이미지 통합 analysis-spec 정상 생성
- [ ] Phase 2 건축 이미지 생성 성공
- [ ] 기존 단일 아트보드 → Sketch-to-Image 흐름 회귀 없음
- [ ] PRINT 노드 기존 동작 회귀 없음

---

## 7. 제약사항

- `getNodeBase64(n)` 추출 시 양쪽 슬롯 모두 동일한 우선순위 적용 (`generatedImageData ?? sketchData ?? thumbnailData`)
- 입면도가 핸드 스케치든 레퍼런스 이미지든 API 전송 방식 동일
- `nodeImageToSelectedImage` 유틸 참고 (`project_canvas/lib/printUtils.ts`)
- `sketch_image` 단일 입력 하위호환 필수 유지
- `sketchInputImages` 옵셔널 필드 → IndexedDB 마이그레이션 불필요
- Red Team Cut-off 기준 변경 없음 (N3: 3점)
- Gemini `parts[]` 복수 이미지 2개: 안전 범위 (공식 한도 확인 권장)
