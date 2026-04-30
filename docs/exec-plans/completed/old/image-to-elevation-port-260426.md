# 작업지시서: IMAGE TO ELEVATION 노드 이식

**날짜**: 2026-04-26  
**출처**: https://github.com/cai-crete/ELEVATION  
**에이전트**: AGENT C (UI/UX) + AGENT A (API/Protocol)  
**참조 패턴**: `project_canvas/sketch-to-plan/`, `project_canvas/print/`

---

## 1. 목표

ELEVATION v7 레포지토리의 핵심 기능을 cai-canvas-v2에 `elevation` 노드로 이식한다.

- **입력**: 건물 이미지 (image 아트보드 노드의 generatedImageData)
- **처리**: Protocol A (Gemini Vision → AEPLSchema) → Protocol B (5방향 입면도 병렬 생성)
- **출력**: 5-view CrossGrid 썸네일 노드 + AEPL 분석 데이터

---

## 2. 소스 분석 요약

### ELEVATION 레포 핵심 구조
| 컴포넌트 | 역할 |
|----------|------|
| `Protocol/AEPS-v4.txt` | AEPLSchema 정의 (건물 치수·재료·분절 파라미터) |
| `Protocol/# sys-prompt-image to elevation-v7.txt` | Protocol A 시스템 프롬프트 |
| `Protocol/전개도작성 가이드라인.txt` | Protocol B 이미지 생성 가이드 |
| `api/analyze.ts` | Stage 1: Gemini Vision → AEPLSchema |
| `api/generate.ts` | Stage 2: 5방향 이미지 병렬 생성 |
| `src/components/CrossGrid.tsx` | 5-view 십자형 레이아웃 |
| `src/components/Sidebar.tsx` | 우측 컨트롤 패널 |

### AEPLSchema 핵심 필드 (이식 대상)
```
width, height, depth (비례 치수)
articulation.void_ratio (개구부 비율 0.0~1.0)
materials.base.color / secondary.color / glass.color
inferred_views (right/left/rear/top 추론 설명)
```

### CrossGrid 레이아웃
```
         [TOP]
[LEFT] [FRONT] [RIGHT]
         [REAR]
```

---

## 3. cai-canvas-v2 기존 패턴 분석

| 항목 | 현재 상태 |
|------|-----------|
| `NodeType = 'elevation'` | `types/canvas.ts`에 이미 정의됨 |
| `ARTBOARD_COMPATIBLE_NODES.image` | `elevation` 포함 |
| `NODES_NAVIGATE_DISABLED` | 현재 `['elevation', 'diagram']` → elevation 제거 필요 |
| `NODES_THAT_EXPAND` | 현재 elevation 미포함 → 추가 필요 |
| `project_canvas/elevation/` | 폴더 없음 → 신규 생성 |
| API route | `app/api/image-to-elevation/` 없음 → 신규 생성 |

---

## 4. 노드 생성 흐름 (전체)

```
[이미지 아트보드] → ELEVATION 탭 클릭
        ↓
  elevation 입력 노드 A 생성 (childNode, thumbnailData = 원본 이미지)
  + 즉시 ExpandedView 진입
        ↓
  ExpandedView: 원본 이미지 표시 + PROMPT 입력 + GENERATE
        ↓
  GENERATE 클릭 → 즉시 캔버스 복귀 + "ELEVATION GENERATING" toast
        ↓
  (백그라운드) API 호출 → Protocol A + Protocol B (5뷰 생성)
        ↓
  handleGenerateElevationComplete:
  - elevation 결과 노드 B 생성 (노드 A의 childNode)
  - thumbnailData = renderCrossGridThumbnail(images) 합성 이미지
  - elevationImages, elevationAeplData 저장
  - 엣지 A → B 연결
        ↓
  노드 B 캔버스 카드: CrossGrid 합성 이미지를 썸네일로 표시
        ↓
  노드 B expand → ExpandedView: CrossGrid 전체 화면 + EXPORT 버튼
```

---

## 5. 폴더 구조 (신규)

```
project_canvas/elevation/
├── ExpandedView.tsx                          ← 메인 컴포넌트 (신규)
└── _context/
    ├── protocol-image-to-elevation-v7.txt   ← Protocol A: 분석 시스템 프롬프트
    ├── knowledge-aeps-schema-v4.txt          ← AEPLSchema JSON 형식 정의
    └── knowledge-elevation-guide.txt         ← Protocol B: 입면도 생성 가이드
```

---

## 6. 체크리스트

### Phase 1 — 타입 & 상수 수정 (types/canvas.ts)

- [ ] `ElevationPanelSettings` 인터페이스 추가
  ```typescript
  export interface ElevationPanelSettings { prompt: string; }
  ```
- [ ] `ElevationImages` 인터페이스 추가
  ```typescript
  export interface ElevationImages {
    front: string; rear: string; left: string; right: string; top: string;
  }
  ```
- [ ] `ElevationAeplData` 인터페이스 추가
  ```typescript
  export interface ElevationAeplData {
    width: number; height: number; depth: number;
    voidRatio: number; baseMaterial: string; secondaryMaterial: string;
  }
  ```
- [ ] `CanvasNode`에 필드 추가
  - `elevationPanelSettings?: ElevationPanelSettings`
  - `elevationImages?: ElevationImages`
  - `elevationAeplData?: ElevationAeplData`
- [ ] `NODES_NAVIGATE_DISABLED`에서 `'elevation'` 제거
  - 변경 전: `['elevation', 'diagram']`
  - 변경 후: `['diagram']`
- [ ] `NODES_THAT_EXPAND`에 `'elevation'` 추가
  - 변경 전: `['image', 'plan', 'print', 'planners', 'cadastral']`
  - 변경 후: `['image', 'plan', 'print', 'planners', 'cadastral', 'elevation']`

---

### Phase 2 — _context 프로토콜 파일 생성

- [ ] `elevation/_context/protocol-image-to-elevation-v7.txt` 생성
  - ELEVATION 레포 `AEPS-v4.txt` + `sys-prompt-image-to-elevation-v7.txt` 핵심 내용 통합
  - cai-canvas-v2 Next.js API 포맷에 맞게 재작성
  - 출력 형식: JSON (AEPLSchema)
- [ ] `elevation/_context/knowledge-aeps-schema-v4.txt` 생성
  - AEPLSchema 전체 JSON 스키마 정의 (GPT 레퍼런스용)
- [ ] `elevation/_context/knowledge-elevation-guide.txt` 생성
  - Protocol B 이미지 생성 가이드 (view별 카메라 앵글, 재료 표현, PBR 설정)

---

### Phase 3 — API Route 생성

- [ ] `app/api/image-to-elevation/route.ts` 생성

#### 모델 상수
```typescript
const MODEL_ANALYSIS           = 'gemini-3.1-pro-preview';
const MODEL_IMAGE_GEN          = 'gemini-3.1-flash-image-preview';
const MODEL_ANALYSIS_FALLBACK  = 'gemini-2.5-pro-preview';
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image';
const TIMEOUT_ANALYSIS         = 90_000;   // ms
const TIMEOUT_IMAGE_GEN        = 120_000;  // ms
```

#### 요청/응답 스펙
- **요청**: `{ imageBase64: string, mimeType?: string, prompt?: string }`
- **Stage 1 (Protocol A)**:
  - `lib/prompt.ts`로 `_context/` 프로토콜 파일 로드
  - Gemini Vision 호출 → AEPLSchema JSON 파싱
  - 1차 모델 실패 시 폴백 자동 전환
- **Stage 2 (Protocol B)**:
  - 4방향 이미지 병렬 생성 (`Promise.all` × 4: rear/left/right/top)
  - front = 원본 이미지 passthrough
  - `responseModalities: ['IMAGE']` 설정
  - 1차 모델 실패 시 폴백 자동 전환
- **응답**: `{ success: true, aepl: ElevationAeplData, images: ElevationImages }`
- `GEMINI_API_KEY` 사용 (기존 `.env.local` 재사용)

---

### Phase 4 — Hook 생성

- [ ] `hooks/useElevationGeneration.ts` 생성
  ```typescript
  function useElevationGeneration(): {
    isLoading: boolean;
    error: string | null;
    generate(imageBase64: string, params: { prompt?: string }): Promise<{
      aepl: ElevationAeplData;
      images: ElevationImages;
    } | null>;
  }
  ```
  - POST `/api/image-to-elevation` 호출
  - 에러 처리 (네트워크, 모델 오류)

---

### Phase 5 — ExpandedView 컴포넌트 생성 (핵심)

- [ ] `elevation/ExpandedView.tsx` 생성

#### 레이아웃 구조
```
┌─────────────────────────────────────┬──────────────────┐
│          메인 콘텐츠 영역              │  ExpandedSidebar  │
│                                     │                  │
│  [입력 상태]                          │  PROMPT          │
│  원본 이미지 표시                       │  textarea        │
│                                     │                  │
│  [결과 상태]                          │  ELEVATION SPEC  │
│        [TOP]                        │  (AEPLSchema)    │
│  [LEFT][FRONT][RIGHT]               │                  │
│        [REAR]                       │  ────────────    │
│                                     │  [GENERATE]      │
│                                     │  ↓ 생성 완료 후   │
│                                     │  [EXPORT]        │
└─────────────────────────────────────┴──────────────────┘
```

#### Props
```typescript
interface ElevationExpandedViewProps {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  isGenerating?: boolean;
  onGenerateElevationComplete?: (params: {
    sketchBase64: string;     // 입력 이미지 (원본)
    aepl: ElevationAeplData;
    images: ElevationImages;
    nodeId: string;
  }) => void;
}
```

#### 메인 영역 동작
- **입력 상태** (`!node.elevationImages`):
  `node.thumbnailData ?? node.generatedImageData` (원본 이미지) 표시
  - 이미지 없을 시: "이미지를 선택한 후 GENERATE를 클릭하세요" 빈 카드
- **결과 상태** (`node.elevationImages` 존재):
  CrossGrid 5-view 전체 표시 (top/front/left/right/rear)

#### GENERATE 동작 흐름 (image/plan과 동일 패턴)
1. GENERATE 클릭
2. `onCollapseWithElevationSketch` 호출 → 캔버스 즉시 복귀
3. `onCollapse()` 호출
4. 백그라운드에서 API 호출 (hook: `useElevationGeneration`)
5. 완료 시: `onGenerateElevationComplete` 콜백 실행
6. 오류 시: toast 또는 error 처리

```typescript
const handleGenerate = async () => {
  if (effectiveIsGenerating) return;
  const sourceBase64 = node.thumbnailData ?? node.generatedImageData ?? '';
  if (!sourceBase64) return;

  onGeneratingChange?.(true);
  onCollapse(); // 즉시 캔버스 복귀

  const result = await generate(sourceBase64, { prompt: elevPrompt });
  if (result) {
    onGenerateElevationComplete?.({
      sketchBase64: sourceBase64,
      aepl: result.aepl,
      images: result.images,
      nodeId: node.id,
    });
  } else {
    onGeneratingChange?.(false);
  }
};
```

#### CrossGrid 인라인 컴포넌트
```
CSS Grid 3×3 (중앙 열/행에 콘텐츠, 빈 셀은 그냥 empty div)
gap: 4px, background: var(--color-app-bg)
각 셀:
  - image 표시 + objectFit: contain + background: #000
  - 좌상단 label (Bebas, 0.6rem, gray-400)
  - 모서리 bracket 장식 (선택적)
```

#### 우측 패널 섹션 (ExpandedSidebar 내부)
1. **PROMPT**: textarea (최대 1000자)
2. **ELEVATION SPEC**: AEPLSchema 파싱 결과 표시
   - `W × H × D` 비례 (Bebas)
   - `VOID RATIO` (%)
   - `BASE MATERIAL` + `SECONDARY MATERIAL` (색상 칩 + hex/이름)
   - 생성 전: "No report yet." 플레이스홀더

#### 하단 CTA 버튼 — 단일 버튼, 상태에 따라 전환
```typescript
const buttonMode: 'generate' | 'generating' | 'export' =
  effectiveIsGenerating   ? 'generating' :
  !!node.elevationImages  ? 'export'     : 'generate';
```

| 상태 | 스타일 | 동작 |
|------|--------|------|
| `generate` | 검정 pill (`var(--color-black)`) | API 호출 + 즉시 캔버스 복귀 |
| `generating` | 검정 pill, disabled, 스피너 | — |
| `export` | 아웃라인 pill (`var(--color-gray-500)` border, 투명 배경) | 5개 이미지 일괄 다운로드 |

- PROMPT 변경 시 버튼이 다시 `generate`로 리셋 (state로 관리)

#### 디자인 토큰
- 폰트: Bebas (섹션 레이블, 버튼), Pretendard (본문)
- 색상: `var(--color-black/white/gray-*)` 준수
- CTA 높이: `var(--h-cta-lg)`
- 테두리 반경: `var(--radius-pill)`, `var(--radius-box)`
- 로딩: 기존 `IconLoader` 패턴 재사용

---

### Phase 6 — components/ExpandedView.tsx 수정

- [ ] `ElevationExpandedView` import 추가
  ```typescript
  import ElevationExpandedView from '@/elevation/ExpandedView';
  ```
- [ ] Props에 elevation 콜백 추가
  ```typescript
  onGenerateElevationComplete?: (params: {
    sketchBase64: string;
    aepl: ElevationAeplData;
    images: ElevationImages;
    nodeId: string;
  }) => void;
  ```
- [ ] 라우팅 분기 추가
  ```typescript
  if (node.type === 'elevation') {
    return <ElevationExpandedView
      node={node}
      onCollapse={onCollapse}
      onGeneratingChange={onGeneratingChange}
      isGenerating={isGenerating}
      onGenerateElevationComplete={onGenerateElevationComplete}
    />;
  }
  ```
- [ ] `types/canvas.ts`에서 신규 타입 import

---

### Phase 7 — app/page.tsx 수정

#### 유틸리티 함수 추가
- [ ] `renderCrossGridThumbnail(images: ElevationImages): Promise<string>` 추가
  - Canvas API로 오프스크린 합성 (840×560px 기준, 3×2 cross)
  - TOP(1,0), LEFT(0,1), FRONT(1,1), RIGHT(2,1), REAR(1,2) 배치
  - 반환: base64 PNG

#### createChildNode 수정
- [ ] 반환값 추가: `string` (새 노드 ID)
  ```typescript
  const createChildNode = useCallback((...): string => { ... return newId; }, ...)
  ```

#### handleGenerateElevationComplete 핸들러 추가
- [ ] page.tsx에 추가
  ```typescript
  const handleGenerateElevationComplete = useCallback(async ({
    sketchBase64, aepl, images, nodeId,
  }) => {
    const currentNodes = nodes;
    const currentEdges = edgesRef.current;

    // 1. CrossGrid 합성 썸네일 생성
    const thumbnail = await renderCrossGridThumbnail(images);

    // 2. 결과 노드 생성 (노드 A의 자식)
    const existing = currentNodes.filter(n => n.type === 'elevation');
    const num = existing.length + 1;
    const newId = generateId();
    const { position, pushdowns } = placeNewChild(nodeId, currentNodes, currentEdges);

    const resultNode: CanvasNode = {
      id: newId,
      type: 'elevation',
      title: `${NODE_DEFINITIONS['elevation'].caption} #${num}`,
      position,
      instanceNumber: num,
      hasThumbnail: true,
      artboardType: 'image',
      parentId: nodeId,
      autoPlaced: true,
      thumbnailData: thumbnail,
      generatedImageData: images.front,
      elevationImages: images,
      elevationAeplData: aepl,
    };

    let nextNodes = [...currentNodes.map(n =>
      n.id === nodeId ? { ...n, hasThumbnail: true } : n
    ), resultNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }
    const newEdge: CanvasEdge = { id: generateId(), sourceId: nodeId, targetId: newId };
    pushHistory(nextNodes, [...currentEdges, newEdge]);
    setGeneratingNodeId(null);
  }, [nodes, pushHistory]);
  ```

#### 탭 클릭 핸들러 수정
- [ ] elevation을 `NODES_NAVIGATE_DISABLED`와 분리하여 전용 분기 처리
  ```typescript
  if (type === 'elevation') {
    if (selectedNode?.artboardType === 'image') {
      const sourceImage = selectedNode.generatedImageData ?? selectedNode.thumbnailData;
      const childId = createChildNode(selectedNode.id, type, 'image',
        { thumbnailData: sourceImage }
      );
      setExpandedNodeId(childId);
    }
    setActiveSidebarNodeType(null);
    return;
  }
  ```

#### 기타 수정
- [ ] `ExpandedView`에 `onGenerateElevationComplete` prop 전달
- [ ] import 목록에 신규 타입 추가 (`ElevationAeplData`, `ElevationImages`)
- [ ] GeneratingToast 라벨: elevation 케이스 추가
  ```typescript
  expandedNode?.type === 'elevation' ? 'ELEVATION GENERATING' : ...
  ```

---

### Phase 8 — lib/prompt.ts 수정

- [ ] `elevation/_context/` 경로 후보 배열에 추가
  ```typescript
  'elevation/_context/',   // image-to-elevation 프로토콜
  ```

---

### Phase 9 — 검증

- [ ] TypeScript 컴파일 오류 없음 (`npm run build`)
- [ ] elevation 탭 클릭 → 새 elevation 입력 노드 생성 + ExpandedView 열림 확인
- [ ] 원본 이미지 메인 영역 표시 확인
- [ ] GENERATE 클릭 → 즉시 캔버스 복귀 + "ELEVATION GENERATING" toast 표시
- [ ] 생성 완료 → CrossGrid 합성 썸네일을 가진 새 결과 노드 캔버스에 표시
- [ ] 결과 노드 expand → CrossGrid 5-view 메인 영역 표시
- [ ] 결과 노드 expand → 하단 버튼이 EXPORT로 표시 확인
- [ ] AEPL Spec 패널에 데이터 표시 확인
- [ ] EXPORT 클릭 → 5개 이미지 다운로드 확인

---

## 7. 주의사항

1. **모델 상수**: Phase 3 참조. 1차/폴백 모두 try-catch로 처리
2. **원본 이미지 전달**: elevation 입력 노드 생성 시 부모의 `generatedImageData`를 `thumbnailData`로 복사
3. **front 이미지**: Protocol B에서 전면부는 원본 이미지 passthrough (ELEVATION 레포 원칙 유지)
4. **CrossGrid 합성 썸네일**: Canvas API로 브라우저 측 합성 (OffscreenCanvas 미지원 시 일반 Canvas 폴백)
5. **Gemini 이미지 생성 모델**: `responseModalities: ['IMAGE']` 설정 필요

---

## 8. 미결 사항

- `GEMINI_API_KEY` `.env.local` 설정 여부 확인 (세션 15에서 보류)
- Protocol B 이미지 생성 모델 가용성 확인 후 폴백 모델 결정

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
