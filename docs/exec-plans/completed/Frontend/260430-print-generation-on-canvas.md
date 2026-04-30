# Print Node - Canvas Background Generation 로직 고도화

## 1. 개요
현재 Print 노드는 Canvas에서 'GENERATE' 버튼을 누르면 무조건 ExpandedView로 진입하여 "AI가 문서를 생성하고 있습니다..." 로딩 화면에 사용자를 가두는 구조입니다.
이를 개선하여 다른 생성 노드(sketch-to-image 등)와 마찬가지로 캔버스 상에서 토스트 바로 생성 진행 상황을 알리고, 백그라운드에서 문서 생성을 수행한 뒤 썸네일로 결과를 표시하도록 로직을 변경합니다. 또한, ExpandedView로 진입 후 문서를 수정한 뒤 캔버스로 나갈 때(우측 상단 `<-` 버튼) 별도의 '저장' 버튼 클릭 없이 자동 저장되도록 UI/UX를 고도화합니다.

## 2. 기술적 타당성 및 위험성 검토
- **기술적 타당성**: **가능함**. 현재 Print 기능은 `@cai-crete/print-components` 패키지에 종속되어 있으나, 이를 패키지 수준에서 캡슐화된 커스텀 훅(`usePrintProcessor`) 형태로 제공하면 Canvas가 비즈니스 로직을 몰라도 생성을 트리거할 수 있습니다.
- **위험성 및 보완책 (Risks & Mitigations)**:
  1. **의존성 파편화 (Shotgun Surgery)**: Canvas가 `splitHtmlPages` 등 개별 함수를 조립하면 결합도가 높아집니다. → **(보완)** 패키지에서 고수준 훅(`usePrintProcessor`) 하나만 노출하여 캡슐화를 보장합니다.
  2. **상태 불일치 및 레이아웃 깨짐**: 헤드리스 백그라운드 생성 시 DOM 환경의 부재로 인해 썸네일이나 레이아웃이 뷰어 진입 시와 다르게 계산될 수 있습니다. → **(보완)** 훅 내부에서 샌드박스 컨테이너를 `document.body`에 직접 append하되 `position: absolute; left: -9999px`로 배치하여, 브라우저 레이아웃 엔진이 실제 동작하는 조건에서 HTML 분할 및 `html2canvas` 썸네일 추출을 수행합니다. 작업 완료 후 컨테이너를 즉시 제거합니다.
  3. **자동 저장 시 데이터 유실 (Race Condition)**: 비동기 업로드 중 사용자가 `<-` 버튼을 눌러 컴포넌트가 언마운트되면 데이터가 증발할 수 있습니다. → **(보완)** `await tools.onSave()`가 완료될 때까지 라우팅을 차단하는 Pending UI(스피너)를 도입하고, 상태 변경이 없을 때만 즉시 닫히도록 `isDirty` 플래그를 추가합니다.
  4. **생성 중 이탈 및 뷰 전환 충돌**: 뷰 전환이나 브라우저 새로고침 시 생성 상태가 꼬일 수 있습니다. → **(보완)** 전역 `isGenerating` 상태 공유, 편집 패널 잠금(ReadOnly), 그리고 브라우저 '새로고침/강제 종료' 시 `beforeunload` 이벤트를 통한 경고 팝업 방어 기제를 적용합니다.

## 3. 단계별 실행 계획

### [Phase 1] `@cai-crete/print-components` (Print 패키지) 고도화 및 캡슐화
- **목표**: Canvas에 도메인 로직이 누출되지 않도록 패키지 내에 생성 오케스트레이션 훅을 구축합니다.
- **작업 내역**:
  1. `project.10_print/hooks/usePrintProcessor.ts` 생성:
     - 내부적으로 API 요청, Sandbox DOM(`document.body` append + `position: absolute; left: -9999px`)을 활용한 HTML 렌더링 및 `html2canvas` 썸네일 생성, 레이아웃 분할 처리를 모두 담당.
     - Canvas에는 `generatePrintAssets(images, settings)` 함수와 진행 상태만 반환.
     - **인터페이스 추가**: `onAbortControllerReady?: (controller: AbortController) => void` 옵션을 인자로 수용하여, 생성 시작 시 생성한 `AbortController` 인스턴스를 Canvas의 `abortControllerRef`에 전달할 수 있도록 합니다.
  2. **`PrintExpandedViewProps` 인터페이스 확장**:
     - `onGeneratingChange?: (v: boolean) => void` — 생성 시작·종료 시 Canvas에 알림 (현재 Props에 선언만 있고 미연결 상태).
     - `onDirtyChange?: (isDirty: boolean) => void` — 문서 편집 상태 변경 시 Canvas wrapper에 전달하여 `isDirty` 추적 가능하도록 합니다.
     - `onSave`의 타입을 `() => void`에서 `() => Promise<void>`로 변경하여 await 가능하게 합니다.
  3. `project.10_print/lib/index.ts`를 통해 `usePrintProcessor` 및 확장된 타입을 명시적으로 export.
  4. **패키지 발행**: 변경 사항을 버전업(예: `0.1.5`) 후 npm registry에 발행합니다.
  5. Canvas 프로젝트에서 `npm install @cai-crete/print-components@0.1.5` 실행 및 인터페이스 타입 점검.

### [Phase 2] Canvas 프론트엔드 - 통합 백그라운드 생성 및 방어 기제
- **목표**: Canvas에서 Print 패널의 'GENERATE' 클릭 시 백그라운드 캔버스 생성을 처리하고, 상태를 전역적으로 동기화합니다.
- **작업 내역**:
  1. `project_canvas/app/page.tsx` 연동:
     - 'GENERATE' 이벤트 수신 시 `setExpandedNodeId(selectedNodeId)` 강제 진입을 제거하여 ExpandedView로 넘어가지 않도록 변경.
     - 전역 상태 `setIsGenerating(true)` 호출 후 패키지의 `usePrintProcessor` 실행.
     - `generatingLabel` 설정: `page.tsx:1401`의 기존 `expandedNode?.type === 'print'` 조건 분기 대신, 백그라운드 생성 시 `expandedNode`가 print가 아닐 수 있으므로 별도 `generatingNodeType` 상태(또는 `setGeneratingLabel('PRINT GENERATING')` 직접 호출)로 레이블을 지정합니다.
     - `usePrintProcessor`의 `onAbortControllerReady` 콜백으로 생성된 `AbortController`를 `abortControllerRef.current`에 저장하여 토스트 취소 버튼과 연결합니다.
     - **레거시 코드 제거**: 백그라운드 생성 도입으로 불필요해진 `printAutoGenerate` 상태 및 `print/ExpandedView.tsx`의 DOM 자동 클릭 `useEffect`(lines 64–75)를 삭제합니다.
  2. 일관된 토스트 UI 및 재시도:
     - 토스트의 (X) 버튼은 `abortControllerRef.current?.abort()`로 연동되어 즉시 중단 기능 제공.
     - 실패 시 토스트 내 '재시도' 버튼 노출.
  3. **브라우저 이탈 방어 기제 추가**:
     - `isGenerating`이 `true`일 때 전역 `useEffect`로 `window.addEventListener('beforeunload', ...)`를 등록하여, 사용자가 새로고침이나 창 닫기를 시도할 경우 "문서 생성이 진행 중입니다. 페이지를 나가시겠습니까?" 경고 팝업 노출.
  4. 생성 완료 시 `onGeneratePrintComplete`를 통해 노드 상태 업데이트.

### [Phase 3] Print ExpandedView 자동 저장 (Auto-Save) 로직 개편
- **목표**: 생성 후 ExpandedView 진입 시, 수정을 거친 후 `<-` 버튼 클릭만으로 안전하게 자동 저장되도록 개선합니다.
- **작업 내역**:
  1. `project_canvas/print/ExpandedView.tsx` 수정:
     - `onGeneratingChange` prop을 실제 destructure하여 `PkgPrintExpandedView`로 전달 (현재 Props에는 선언되어 있으나 미연결 상태).
     - 패키지의 `onDirtyChange` 콜백으로 `isDirty` 로컬 상태를 추적하여, 변경 사항이 없으면 `<-` 버튼 클릭 시 저장 없이 즉시 `onCollapse()` 호출.
     - `renderToolbarWrapper` 내 `tools.onSave`를 `useRef`로 캡처.
     - `<-` 버튼 핸들러에서 클릭 시 `isSaving(true)` 로컬 상태로 스피너 UI 노출 (클릭 중복 차단).
     - `await tools.onSave()` 완료 → `handleSave` 내부의 `setNodes` 등 React 상태 업데이트가 flush되도록 `flushSync`를 감싸거나, `onSave` 완료 직후 `onCollapse()`를 호출 (React 18 automatic batching 환경에서 썸네일 반영 보장).
  2. 툴바 UI 정리 및 ReadOnly 처리:
     - 불필요해진 `<IconSave>` 저장 아이콘 버튼 제거. 저장은 `<-` 버튼을 통한 자동 저장으로만 수행.
     - `isGenerating` 상태가 `true`인 채로 ExpandedView에 진입한 경우, 에디터 영역 및 속성 컨트롤을 임시 비활성화(ReadOnly)하여 데이터 충돌(Edit Conflict) 사전 예방.

---

## 4. 세션별 상세 실행 계획

> **원칙**: 각 Step은 독립 대화 세션에서 실행 가능하도록 대상 파일과 변경 범위를 명시합니다.
> 한 세션에서 대형 파일을 여러 개 로드하지 않도록 파일 경계에서 Step을 나눕니다.

### Step 1 · [패키지] 타입 인터페이스 확장

- **대상 파일 (수정)**: `project.10_print/types/print-canvas.ts`
- **필독 파일**: 위 파일 1개
- **변경 내용**:
  - `PrintExpandedViewProps`에 콜백 3개 추가:
    ```ts
    onGeneratingChange?: (v: boolean) => void;
    onDirtyChange?: (isDirty: boolean) => void;
    onAbortControllerReady?: (controller: AbortController) => void;
    ```
  - ※ `PrintToolbarTools.onSave`는 이미 `() => Promise<void> | void`로 선언되어 있으므로 변경 불필요.
- **검증**: `npx tsc --noEmit` 오류 없음
- **토큰 부담**: 낮음 (파일 125줄)

---

### Step 2 · [패키지] Print_ExpandedView 콜백 연결

- **대상 파일 (수정)**: `project.10_print/components/Print_ExpandedView.tsx`
- **필독 파일**: 위 파일 1개 (대형)
- **변경 내용**:
  - Props에서 `onGeneratingChange`, `onDirtyChange` destructure 추가.
  - `handleGenerate` (line ~419): `setIsGenerating(true)` 직후 `onGeneratingChange?.(true)` 추가.
  - `handleGenerate` finally block (line ~449): `setIsGenerating(false)` 직후 `onGeneratingChange?.(false)` 추가.
  - `triggerGenerate` (line ~458, 방향 전환 자동 생성)에도 동일하게 적용.
  - History push(`setHistory`, line ~439) 이후 `onDirtyChange?.(true)` 추가.
  - 내부 `handleSave` 함수가 `Promise<void>`를 반환하는지 확인, 아니라면 `async` 변환.
- **검증**: 패키지 앱(`npm run dev`)에서 GENERATE 클릭 시 `onGeneratingChange` 콜백 호출 확인
- **토큰 부담**: 중간 (대형 파일, 수정 라인 위치가 명시되어 있어 절감 가능)

---

### Step 3 · [패키지] usePrintProcessor 훅 신규 생성

- **대상 파일 (신규)**: `project.10_print/hooks/usePrintProcessor.ts`
- **대상 파일 (수정)**: `project.10_print/lib/index.ts`
- **참조 파일 (읽기 전용)**: `lib/thumbnailUtils.ts`, `lib/types.ts`, `app/api/print/route.ts` (API 패턴 파악용)
- **변경 내용**:
  - `usePrintProcessor.ts` 구조:
    ```ts
    interface UsePrintProcessorOptions {
      apiBaseUrl: string;
      onAbortControllerReady?: (c: AbortController) => void;
      onGeneratingChange?: (v: boolean) => void;
    }
    // 반환: { generatePrintAssets(images, draft): Promise<PrintSaveResult>, isProcessing }
    ```
  - 내부 구현 순서:
    1. `AbortController` 생성 → `onAbortControllerReady?.(controller)` 호출
    2. `onGeneratingChange?.(true)` 호출
    3. `callPrintApi(...)` 실행 (기존 API 호출 패턴 재사용, `signal` 전달)
    4. 응답 후 `generateThumbnail(html, mode, orientation)` 호출 — `thumbnailUtils.ts`의 기존 함수 재사용 (이미 iframe + `document.body.appendChild` + `position:fixed; left:-(w+200)px` 샌드박스 구현됨)
    5. `PrintSaveResult` 조립 후 반환
    6. finally: `onGeneratingChange?.(false)`
  - `lib/index.ts`에 추가:
    ```ts
    export { usePrintProcessor } from '../hooks/usePrintProcessor';
    export type { UsePrintProcessorOptions } from '../hooks/usePrintProcessor';
    ```
- **검증**: `npx tsc --noEmit` 오류 없음, 훅 import 가능 확인
- **토큰 부담**: 중간 (신규 파일 + 참조 파일 3개)

---

### Step 4 · [패키지] 빌드 검증 · npm 발행 · Canvas 설치

- **대상 파일 (수정)**: `project.10_print/package.json` (버전 0.1.4 → 0.1.5)
- **실행 커맨드**:
  ```bash
  # 패키지 디렉터리
  cd cai-harness-print/project.10_print
  npm run build
  # package.json version 필드를 "0.1.5"로 수정 후
  npm publish

  # Canvas 디렉터리
  cd cai-crete-cai-canvas-v2-jw/project_canvas
  npm install @cai-crete/print-components@0.1.5
  npx tsc --noEmit
  ```
- **검증**: Canvas에서 `import { usePrintProcessor } from '@cai-crete/print-components'` 타입 오류 없음
- **토큰 부담**: 낮음 (커맨드 중심, 파일 읽기 최소)

---

### Step 5 · [Canvas] page.tsx 백그라운드 생성 전환

- **대상 파일 (수정)**: `project_canvas/app/page.tsx`
- **필독 파일**: 위 파일 1개 (대형), `project_canvas/print/ExpandedView.tsx` lines 64–75 (삭제 대상 확인용)
- **변경 내용**:

  | 위치 | 변경 전 | 변경 후 |
  |------|---------|---------|
  | 상단 imports | — | `usePrintProcessor` import 추가 |
  | line ~202 | — | `usePrintProcessor` hook 호출 추가 (`apiBaseUrl`, `onAbortControllerReady`, `onGeneratingChange` 연결) |
  | line ~209 | `printAutoGenerate` state | **삭제** |
  | `handlePrintSidebarAction` (line ~1009) | `setPrintAutoGenerate(true)` + `setExpandedNodeId(...)` | `generatePrintAssets(draft)` 직접 호출, `setExpandedNodeId` 미호출 |
  | line ~1401 | `expandedNode?.type === 'print' ? 'PRINT GENERATING' : generatingLabel` | `generatingLabel` 단독 사용 (usePrintProcessor 내부에서 `setGeneratingLabel('PRINT GENERATING')` 호출) |
  | JSX `<PrintExpandedView>` props | `autoGenerate={printAutoGenerate}` | **삭제** |

- **검증**: GENERATE 클릭 시 ExpandedView 진입 없이 토스트 표시, 완료 후 썸네일 업데이트 확인
- **토큰 부담**: 높음 (page.tsx 대형) — 수정 줄 위치가 명시되어 있으므로 해당 구간만 읽어 절감 가능

---

### Step 6 · [Canvas] print/ExpandedView.tsx 자동 저장 + UI 정리

- **대상 파일 (수정)**: `project_canvas/print/ExpandedView.tsx`
- **필독 파일**: 위 파일 1개 (290줄, 소형)
- **변경 내용**:
  1. Props 정리:
     - `onGeneratingChange` destructure 추가 (Props 선언은 있으나 현재 미연결)
     - `isGenerating?: boolean` prop 추가 (ReadOnly 오버레이용)
  2. 로컬 상태 추가:
     ```ts
     const [isDirty, setIsDirty] = useState(false);
     const [isSaving, setIsSaving] = useState(false);
     const toolsSaveRef = useRef<(() => Promise<void> | void) | null>(null);
     ```
  3. `renderToolbarWrapper` 수정:
     - `toolsSaveRef.current = tools.onSave` 캡처 라인 추가
     - `<IconSave>` 저장 버튼 블록 전체 **삭제**
  4. `renderSidebarWrapper`의 `<-` 버튼 `onClick` 교체:
     ```tsx
     onClick={async () => {
       if (!isDirty) { onCollapse(); return; }
       setIsSaving(true);
       try {
         await (toolsSaveRef.current?.() ?? Promise.resolve());
       } finally {
         setIsSaving(false);
         onCollapse();
       }
     }}
     disabled={isSaving}
     ```
     - `isSaving` 중 버튼 disabled + 스피너 표시 (아이콘을 스피너로 교체)
  5. `<PkgPrintExpandedView>` props 추가:
     ```tsx
     onGeneratingChange={onGeneratingChange}
     onDirtyChange={setIsDirty}
     ```
  6. `isGenerating === true`일 때 에디터 영역 위 ReadOnly 오버레이 추가 (pointer-events: none + 반투명 레이어)
- **검증**:
  - 변경 후 `<-` 클릭 → 저장 스피너 → Canvas 복귀 + 썸네일 업데이트 확인
  - 변경 없는 상태에서 `<-` 클릭 → 즉시 Canvas 복귀 (저장 스킵) 확인
- **토큰 부담**: 낮음 (파일 290줄, 변경 범위 집중적)

---

## 의존 관계 및 실행 순서

```
Step 1 (타입) ──→ Step 2 (콜백) ──┐
                                  ├──→ Step 4 (publish) ──→ Step 5 (page.tsx) ──→ Step 6 (ExpandedView)
Step 3 (훅) ──────────────────────┘
```

- **Step 1** 완료 후 **Step 2**, **Step 3** 병렬 진행 가능
- **Step 2**, **Step 3** 모두 완료 후 **Step 4** 진행
- **Step 5**, **Step 6**은 Step 4 완료 후 병렬 시작 가능 (파일 비중복)
- 각 Step 완료 시 `docs/exec-plans/progress/`에 진행 상황 저장
