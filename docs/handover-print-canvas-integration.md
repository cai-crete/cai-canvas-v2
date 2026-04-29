# 인수인계 보고서: Print ↔ Canvas 통합

**작성일**: 2026-04-28  
**작성자**: cai@cre-te.com  
**대상**: Canvas 초기 버전에서 작업 중인 개발자

---

## 1. 개요

이 보고서는 `cai-canvas-v2-jw` 브랜치에서 완성된 **Print ↔ Canvas 통합 작업**을 다른 Canvas 프로젝트에 이식할 때 필요한 모든 정보를 담고 있습니다.

### 통합으로 추가된 기능

| 기능 | 설명 |
|------|------|
| Print 노드 사이드바 | Canvas 우측 사이드바에서 print 탭 클릭 시 Print 전용 패널 표시 |
| Print Expanded View | `@cai-crete/print-components` 패키지의 뷰를 Canvas 스타일로 래핑 |
| Image → Print 자동 연결 | image 아트보드 선택 후 print 탭 클릭 시 이미지 자동 삽입 + print 노드 생성 |
| BFF(Backend For Frontend) | Canvas 서버에서 Print API로 요청을 프록시하는 API Route 2개 |
| 버그 수정 | print 노드 선택 시 사이드바에 planners가 아닌 print 패널이 열리도록 수정 |

---

## 2. 사전 준비: GitHub Packages 인증

`@cai-crete/print-components`는 **GitHub Packages**에 호스팅된 비공개 패키지입니다. `npm install` 전에 반드시 인증 토큰을 설정해야 합니다. 토큰 없이 설치하면 `401 Unauthorized` 오류가 발생합니다.

### 2-1. GitHub Personal Access Token 발급

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. **Generate new token (classic)** 클릭
3. 권한(Scope) 중 **`read:packages`** 체크
4. 생성된 토큰 값 복사 (`ghp_xxxxxxxxxxxx` 형태)

> 이 패키지에 접근 권한이 있는 GitHub 계정의 토큰이어야 합니다. 권한이 없다면 **저장소 관리자(cai@cre-te.com)** 에게 `@cai-crete` 조직의 패키지 접근 권한을 요청하세요.

### 2-2. 토큰 설정 방법 (3가지 중 하나 선택)

**방법 A — 환경변수로 설정 (권장):**
```bash
# macOS/Linux
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxxxxxxxxxxx"
```
이후 `npm install` 실행. `.npmrc`가 `${GITHUB_TOKEN}`을 자동으로 읽습니다.

**방법 B — `.npmrc`에 직접 기입 (토큰이 git에 커밋되지 않도록 주의):**
```
@cai-crete:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_xxxxxxxxxxxx
```
> `.npmrc`는 이미 프로젝트에 포함되어 있습니다(`project_canvas/.npmrc`). `${GITHUB_TOKEN}` 부분만 실제 토큰 값으로 교체하면 됩니다. **단, 이 파일을 git에 커밋하지 마세요.**

**방법 C — npm 글로벌 로그인:**
```bash
npm login --scope=@cai-crete --auth-type=legacy --registry=https://npm.pkg.github.com
# Username: GitHub 아이디
# Password: 발급한 Personal Access Token
# Email: GitHub 이메일
```

### 2-3. 설치 확인

```bash
cd project_canvas
npm install
# @cai-crete/print-components가 포함된 node_modules 생성 확인
ls node_modules/@cai-crete/print-components
```

---

## 3. 이식 대상 파일 목록

### 3-A. 신규 생성 파일 (그대로 복사)

| 파일 경로 | 역할 |
|-----------|------|
| `project_canvas/print/ExpandedView.tsx` | Print Expanded View 래퍼 컴포넌트 |
| `project_canvas/lib/printUtils.ts` | base64/SelectedImage 변환 유틸 |
| `project_canvas/app/api/print-proxy/api/print/route.ts` | Print API BFF (이미지 생성 프록시) |
| `project_canvas/app/api/print-proxy/api/library/route.ts` | Library API BFF (라이브러리 조회 프록시) |

### 3-B. 기존 파일 수정 (변경 내용 아래 §4에서 상세 설명)

| 파일 경로 | 수정 규모 |
|-----------|-----------|
| `project_canvas/package.json` | 패키지 추가 (~1줄) |
| `project_canvas/next.config.ts` | 빌드 설정 추가 (~4줄) |
| `project_canvas/types/canvas.ts` | 타입 필드 추가 (~3줄) |
| `project_canvas/components/RightSidebar.tsx` | print 패널 연결 (~15줄) |
| `project_canvas/components/ExpandedView.tsx` | print 뷰 라우팅 추가 (~15줄) |
| `project_canvas/app/page.tsx` | 상태·핸들러 추가 (~80줄) |

---

## 4. 파일별 변경 사항 상세

### 4-1. `package.json` — 패키지 설치

```diff
"dependencies": {
+  "@cai-crete/print-components": "^0.1.1",
   ...
}
```

설치 후 실행:
```bash
npm install
```

---

### 4-2. `next.config.ts` — 빌드 설정

```diff
const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: { unoptimized: true },
+ transpilePackages: ['@cai-crete/print-components'],
+ experimental: {
+   serverActions: {
+     bodySizeLimit: '50mb',   // 이미지 업로드 413 방지
+   },
+ },
  ...
};
```

> **왜 필요한가?** `@cai-crete/print-components`는 ESM 패키지라 Next.js가 transpile하지 않으면 빌드 오류가 발생합니다. `bodySizeLimit`이 없으면 이미지 POST 시 Next.js가 1MB 초과 요청을 BFF route handler에 도달하기 전에 413으로 차단합니다.

---

### 4-3. `types/canvas.ts` — CanvasNode 타입 확장

파일 상단에 import 추가:
```typescript
import type { SelectedImage, PrintSavedState } from '@cai-crete/print-components';
```

`CanvasNode` 인터페이스에 아래 두 필드 추가:
```typescript
export interface CanvasNode {
  // ... 기존 필드들 ...
  printSavedState?: PrintSavedState;      // 생성 완료 후 저장되는 HTML/썸네일/메타데이터
  printSelectedImages?: SelectedImage[];  // Canvas 노드에 연결된 이미지 목록 (IndexedDB 저장)
}
```

`ARTBOARD_COMPATIBLE_NODES`에 print 이미 포함되어 있는지 확인:
```typescript
// thumbnail 아트보드: planners와 print 둘 다 허용해야 함
thumbnail: ['planners', 'print'],
```

---

### 4-4. `lib/printUtils.ts` — 신규 파일 (그대로 복사)

```typescript
import type { SelectedImage } from '@cai-crete/print-components';

// Canvas 노드의 generatedImageData(base64 dataUri) → SelectedImage 변환
export function nodeImageToSelectedImage(raw: string, id: string): SelectedImage {
  let base64 = raw;
  let mimeType: SelectedImage['mimeType'] = 'image/jpeg';
  if (raw.startsWith('data:')) {
    const semi  = raw.indexOf(';');
    const comma = raw.indexOf(',');
    if (semi !== -1 && comma !== -1) {
      mimeType = raw.slice(5, semi) as SelectedImage['mimeType'];
      base64   = raw.slice(comma + 1);
    }
  }
  return { id, base64: base64.replace(/\s/g, ''), mimeType, filename: `image_${id}.jpg` };
}

// SelectedImage[] → File[] (비동기, Base64 → Blob → File)
export async function selectedImagesToFiles(images: SelectedImage[]): Promise<File[]> {
  return Promise.all(images.map(async (img) => {
    const dataUri = img.base64.startsWith('data:')
      ? img.base64
      : `data:${img.mimeType};base64,${img.base64}`;
    const res  = await fetch(dataUri);
    const blob = await res.blob();
    return new File([blob], img.filename || `image_${img.id}.jpg`, { type: img.mimeType });
  }));
}
```

---

### 3-5. `print/ExpandedView.tsx` — 신규 파일 (그대로 복사)

이 파일은 `@cai-crete/print-components`의 `PrintExpandedView`를 Canvas 스타일로 래핑합니다.

**핵심 구조:**
- `renderToolbarWrapper`: 패키지 기본 툴바 대신 Canvas 스타일 좌측 수직 툴바 렌더링 (X 버튼 제거)
- `renderSidebarWrapper`: `←` 버튼 + `PRINT` 탭 헤더를 가진 Canvas 스타일 우측 사이드바 렌더링
- `autoGenerate` prop: `true`이면 마운트 후 300ms 뒤 DOM에서 GENERATE 버튼을 찾아 자동 클릭
- `initialDraftState` prop: Canvas 사이드바에서 입력한 설정을 Expanded 진입 시 복원
- `apiBaseUrl="/api/print-proxy"`: BFF를 통해 Print API와 통신

**Props 인터페이스:**
```typescript
interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onGeneratePrintComplete?: (result: { thumbnailBase64: string }) => void;
  onPrintNodeUpdate?: (updates: Partial<CanvasNode>) => void;
  autoGenerate?: boolean;
  initialDraftState?: PrintDraftState | null;
}
```

---

### 3-6. API BFF Routes — 신규 파일 (그대로 복사)

**디렉토리 구조:**
```
project_canvas/app/api/print-proxy/
├── api/
│   ├── print/route.ts      ← POST: 이미지 생성 요청 프록시
│   └── library/route.ts    ← GET: 라이브러리 조회 프록시
```

**필요한 환경변수** (`.env.local`에 추가):
```env
PRINT_API_URL=http://[print-server-host]:[port]
CANVAS_API_SECRET=[print-server와 공유하는 인증 시크릿]
```

> **동작 원리:** Canvas 클라이언트(`/api/print-proxy/api/print`)로 요청 → BFF가 `PRINT_API_URL/api/print`로 포워딩 + `x-canvas-api-secret` 헤더 첨부 → Print 서버 응답 반환

---

### 3-7. `components/RightSidebar.tsx` — print 패널 연결

**추가할 import:**
```typescript
import { PrintCanvasSidebarPanel } from '@cai-crete/print-components';
import type { PrintSavedState, PrintDraftState } from '@cai-crete/print-components';
```

**Props 인터페이스에 추가:**
```typescript
interface Props {
  // ... 기존 props ...
  printSavedState?: PrintSavedState;
  onPrintAction?: (action: 'generate' | 'export' | 'saves', draft: PrintDraftState) => void;
}
```

**isPanelMode 분기에서 print 처리 추가** (기존 `isPlanners` 분기 옆에):
```typescript
const isPrint = activeSidebarNodeType === 'print';

// 패널 본문 렌더링 부분:
{isViewpoint ? (
  <ChangeViewpointPanel ... />
) : isPlanners ? (
  <PlannerReportPanel ... />
) : isPrint ? (
  <PrintCanvasSidebarPanel savedState={printSavedState} onAction={onPrintAction!} />
) : (
  <NodePanel ... />
)}
```

---

### 3-8. `components/ExpandedView.tsx` — print 뷰 라우팅

**추가할 import:**
```typescript
import PrintExpandedView, { type PrintGenerateResult } from '@/print/ExpandedView';
import type { PrintDraftState } from '@cai-crete/print-components';
```

**Props 인터페이스에 추가:**
```typescript
interface Props {
  // ... 기존 props ...
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
  onPrintNodeUpdate?: (updates: Partial<CanvasNode>) => void;
  autoGeneratePrint?: boolean;
  printDraftState?: PrintDraftState | null;
}
```

**라우팅 분기에 print 케이스 추가** (다른 노드 타입 분기들 사이에):
```typescript
/* ── print 전용 뷰 */
if (node.type === 'print') {
  return (
    <PrintExpandedView
      node={node}
      onCollapse={onCollapse}
      onGeneratingChange={onGeneratingChange}
      onGeneratePrintComplete={onGeneratePrintComplete}
      onPrintNodeUpdate={onPrintNodeUpdate}
      autoGenerate={autoGeneratePrint}
      initialDraftState={printDraftState}
    />
  );
}
```

---

### 3-9. `app/page.tsx` — 상태 및 핸들러

**추가할 import:**
```typescript
import type { PrintDraftState } from '@cai-crete/print-components';
import { nodeImageToSelectedImage } from '@/lib/printUtils';
```

**추가할 상태 (기존 `activeSidebarNodeType` 옆에):**
```typescript
const [printDraftState,   setPrintDraftState]   = useState<PrintDraftState | null>(null);
const [printAutoGenerate, setPrintAutoGenerate] = useState(false);
```

**추가할 핸들러 1 — print 노드 부분 업데이트:**
```typescript
const handlePrintNodeUpdate = useCallback((updates: Partial<CanvasNode>) => {
  if (!expandedNodeId) return;
  setNodes(prev => prev.map(n =>
    n.id === expandedNodeId ? { ...n, ...updates } : n
  ));
}, [expandedNodeId]);
```

**추가할 핸들러 2 — print 사이드바 액션 (GENERATE/EXPORT 클릭):**
```typescript
const handlePrintSidebarAction = useCallback((action: 'generate' | 'export' | 'saves', draft: PrintDraftState) => {
  if (!selectedNodeId) return;
  if (action === 'generate') {
    setPrintDraftState(draft);
    setPrintAutoGenerate(true);
  } else {
    setPrintAutoGenerate(false);
  }
  setExpandedNodeId(selectedNodeId);
  setActiveSidebarNodeType(null);
}, [selectedNodeId]);
```

**수정할 핸들러 — `handleNodeCardSelect` 버그 수정:**
```typescript
// 수정 전
if (node.artboardType === 'thumbnail') {
  setActiveSidebarNodeType('planners');
}

// 수정 후 (print 노드와 planners 노드를 구분)
if (node.artboardType === 'thumbnail') {
  setActiveSidebarNodeType(node.type === 'print' ? 'print' : 'planners');
}
```

**수정할 핸들러 — `handleNodeTabSelect`에 print + image 선택 로직 추가:**

`handleNodeTabSelect` 함수 내부 맨 앞(기존 로직 위)에 아래 블록을 추가합니다:
```typescript
/* print + image 아트보드 선택(단일/다중) → print 노드 생성 + expanded 진입 */
if (type === 'print') {
  const imageNodes = selectedNodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is CanvasNode => !!n && n.artboardType === 'image');

  if (imageNodes.length > 0) {
    const num = nodes.filter(n => n.type === 'print').length + 1;
    const newId = generateId();
    const { position, pushdowns } = placeNewChild(imageNodes[0].id, nodes, edgesRef.current);

    const preloadedImages = imageNodes.flatMap(n => {
      const raw = n.generatedImageData ?? n.thumbnailData;
      return raw ? [nodeImageToSelectedImage(raw, n.id)] : [];
    });

    const printNode: CanvasNode = {
      id: newId, type: 'print',
      title: `${NODE_DEFINITIONS['print'].caption} #${num}`,
      position, instanceNumber: num, hasThumbnail: false,
      artboardType: 'thumbnail',
      parentId: imageNodes[0].id, autoPlaced: true,
      printSelectedImages: preloadedImages,
    };

    let nextNodes = [...nodes, printNode];
    if (pushdowns.size > 0) {
      nextNodes = nextNodes.map(n => {
        const np = pushdowns.get(n.id);
        return np ? { ...n, position: np } : n;
      });
    }
    const newEdges: CanvasEdge[] = imageNodes.map(imgNode => ({
      id: generateId(), sourceId: imgNode.id, targetId: newId,
    }));

    pushHistory(nextNodes, [...edgesRef.current, ...newEdges]);
    setExpandedNodeId(newId);
    setActiveSidebarNodeType(null);
    return;
  }
}
```

**수정할 핸들러 — `handleGeneratePrintComplete` (generatedImageData 보존):**
```typescript
const handleGeneratePrintComplete = useCallback(({ thumbnailBase64 }: { thumbnailBase64: string }) => {
  if (!expandedNodeId) return;
  setNodes(prev => prev.map(n =>
    n.id === expandedNodeId
      ? {
          ...n,
          hasThumbnail: true,
          thumbnailData: thumbnailBase64,
          // 원본 소스 이미지를 generatedImageData에 보존 (썸네일 덮어쓰기 전)
          generatedImageData: n.generatedImageData ?? n.thumbnailData,
        }
      : n
  ));
}, [expandedNodeId]);
```

**`handleCollapse`(또는 expanded view 닫기 핸들러)에 상태 초기화 추가:**
```typescript
setPrintDraftState(null);
setPrintAutoGenerate(false);
```

**`ExpandedView` 컴포넌트 호출부에 props 추가:**
```tsx
<ExpandedView
  // ... 기존 props ...
  onGeneratePrintComplete={handleGeneratePrintComplete}
  onPrintNodeUpdate={handlePrintNodeUpdate}
  autoGeneratePrint={printAutoGenerate}
  printDraftState={printDraftState}
/>
```

**`RightSidebar` 컴포넌트 호출부에 props 추가:**
```tsx
<RightSidebar
  // ... 기존 props ...
  printSavedState={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.printSavedState : undefined}
  onPrintAction={handlePrintSidebarAction}
/>
```

---

## 4. 환경변수 설정

`.env.local` 파일에 아래 두 변수를 추가합니다:

```env
# Print 서버 베이스 URL (trailing slash 없이)
PRINT_API_URL=http://localhost:3910

# Print 서버와 공유하는 인증 시크릿 (Print 서버의 CANVAS_API_SECRET과 동일한 값)
CANVAS_API_SECRET=your-shared-secret-here
```

> Print 서버 개발자에게 위 두 값을 확인해야 합니다.

---

## 5. 이식 검증 체크리스트

이식 후 아래 항목을 순서대로 확인합니다:

```
[ ] 1. npm install 완료, 빌드 오류 없음
[ ] 2. .env.local에 PRINT_API_URL, CANVAS_API_SECRET 설정 완료
[ ] 3. print 노드 카드 클릭 → 우측 사이드바에 'PRINT' 탭 표시 (planners 아님)
[ ] 4. 'PRINT' 탭의 '→' 버튼 클릭 → Print Expanded View 진입
[ ] 5. Print Expanded View 좌측 툴바에 'X' (닫기) 버튼 없음
[ ] 6. Print Expanded View 우측 상단에 '←' 버튼 있고, 클릭 시 Canvas 복귀
[ ] 7. image 아트보드 선택 → print 탭 클릭 → print 노드 자동 생성 + Expanded 진입
[ ] 8. Expanded에서 GENERATE 클릭 → API 통신 → 썸네일 생성 완료
[ ] 9. Canvas 돌아왔을 때 print 노드에 썸네일 표시
```

---

## 6. 알려진 구현 결정 및 주의사항

### autoGenerate 방식
`PrintExpandedView`가 마운트된 후 300ms 뒤 DOM에서 GENERATE 버튼을 직접 찾아 클릭합니다. 패키지의 `initialAction='generate'` prop이 no-op으로 구현되어 있어 이 방식을 사용합니다. `hasAutoGenerated` ref로 중복 실행을 방지합니다.

### PrintDraftState 직렬화 불가
`PrintDraftState.images`는 `File[]` 타입으로 IndexedDB에 저장할 수 없습니다. 따라서 `printDraftState`는 세션 메모리(`useState`)에만 유지되며, 페이지 새로고침 시 초기화됩니다.

### BFF 필요 이유
`@cai-crete/print-components`는 클라이언트에서 직접 Print API를 호출합니다. CORS 및 인증 시크릿 노출 방지를 위해 Canvas Next.js 서버가 중간에서 프록시 역할을 합니다.

### 사이드바 레이아웃 충돌 방지
`renderSidebarWrapper`에서 `display: flex, flexDirection: column, height: 100%`를 명시적으로 설정해야 합니다. 패키지 내부 `Sidebar.tsx`가 `h-full` 클래스를 사용하는데, Canvas의 CSS 컨텍스트에서 높이 상속이 끊어지기 때문입니다.

---

## 7. 파일 위치 요약

```
project_canvas/
├── app/
│   ├── api/
│   │   └── print-proxy/
│   │       └── api/
│   │           ├── print/route.ts       ← 신규 복사
│   │           └── library/route.ts     ← 신규 복사
│   └── page.tsx                         ← 수정 (§3-9)
├── components/
│   ├── ExpandedView.tsx                 ← 수정 (§3-8)
│   └── RightSidebar.tsx                 ← 수정 (§3-7)
├── lib/
│   └── printUtils.ts                    ← 신규 복사
├── print/
│   └── ExpandedView.tsx                 ← 신규 복사
├── types/
│   └── canvas.ts                        ← 수정 (§3-3)
├── next.config.ts                       ← 수정 (§3-2)
└── package.json                         ← 수정 (§3-1)
```

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`