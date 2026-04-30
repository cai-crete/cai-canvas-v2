# 작업지시서: Print 생성 중단 토스트 및 Abort 로직 추가

**날짜:** 2026-04-29  
**담당:** AGENT C (프론트엔드) + AGENT A (API Route)  
**우선순위:** 중

---

## 1. 배경 및 목표

### 현재 상태 (AS-IS)

sketch-to-image 등의 생성 플로우는 생성 시작 시 하단 토스트 + X(취소) 버튼이 표시되며,
X 클릭 시 `AbortController.abort()` → fetch 중단 → 토큰 사용 정지가 완성된다.

**print 생성은 아래 3가지가 모두 빠진 채로 방치되어 있다:**

| 항목 | sketch-to-image | print (현재) |
|------|-----------------|--------------|
| 생성 중 토스트 표시 | ✅ | ❌ (`isGenerating`이 `true`로 설정되지 않음) |
| 취소 X 버튼 작동 | ✅ `AbortController` 연결 | ❌ `abortControllerRef.current`가 null |
| API 연결 중단 | ✅ fetch `signal` 전달 | ❌ 패키지 내부 fetch에 signal 없음 |

### 목표 (TO-BE)

1. print 생성 시작 → "PRINT GENERATING" 토스트 즉시 표시  
2. 토스트 X 버튼 클릭 → 토스트 사라짐 + 외부 print API fetch 중단  
3. 취소 후 재생성 가능한 상태 유지

---

## 2. 현황 분석 (코드 레벨)

### 2.1 토스트 렌더링 — 이미 print 분기 준비됨

`project_canvas/app/page.tsx:1218-1225`:
```tsx
{isGenerating && (
  <GeneratingToast
    label={expandedNode?.type === 'print' ? 'PRINT GENERATING' : generatingLabel}
    onCancel={() => {
      abortControllerRef.current?.abort();  // ← print용 컨트롤러가 null
      setIsGenerating(false);
    }}
  />
)}
```
라벨 분기는 이미 구현됨. **문제는 `isGenerating`이 `true`가 되지 않는 것.**

### 2.2 isGenerating이 true가 되지 않는 원인

`project_canvas/print/ExpandedView.tsx` Props (line 15):
```typescript
onGeneratingChange?: (v: boolean) => void;  // Props 타입에는 있음
```

하지만 컴포넌트 함수 본문에서 `onGeneratingChange`가 **파라미터로 구조분해되지도, 호출되지도 않는다.**
`PkgPrintExpandedView`에도 해당 prop을 전달하지 않는다.

### 2.3 패키지 API 조사 결과

`@cai-crete/print-components` (`PkgPrintExpandedView`) 소스: `cai-harness-print/project.10_print/`

**`PrintExpandedViewProps`에 abort/generating 관련 prop 전무:**
- `onGeneratingChange` ❌
- `abortSignal` ❌  
- `onAbortControllerReady` ❌

**패키지 내부 fetch (`cai-harness-print/project.10_print/components/Print_ExpandedView.tsx`):**
- line ~114: `fetch('/api/print', { method: 'POST', body: formData })` — signal 없음
- line ~283: `fetch('/api/library', { method: 'GET' })` — signal 없음

### 2.4 프록시 라우트 현재 signal 처리

`project_canvas/app/api/print-proxy/api/print/route.ts:61`:
```typescript
signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
```
클라이언트 연결 끊김(`req.signal`) 전파 없음.

---

## 3. 구현 계획

### 전체 변경 파일 목록

| # | 파일 | 저장소 | 변경 유형 |
|---|------|--------|----------|
| 1 | `cai-harness-print/project.10_print/types/print-canvas.ts` | cai-harness-print | Props 타입 확장 |
| 2 | `cai-harness-print/project.10_print/components/Print_ExpandedView.tsx` | cai-harness-print | 생성 콜백 + AbortSignal 연결 |
| 3 | `project_canvas/print/ExpandedView.tsx` | canvas | AbortController 생성·전달 |
| 4 | `project_canvas/components/ExpandedView.tsx` | canvas | onAbortControllerReady prop 중계 |
| 5 | `project_canvas/app/page.tsx` | canvas | onAbortControllerReady 연결 |
| 6 | `project_canvas/app/api/print-proxy/api/print/route.ts` | canvas | req.signal 전파 |

---

### Phase 1: 패키지 수정 (`cai-harness-print`)

**목적:** `PkgPrintExpandedView`가 생성 상태를 알리고, 외부 abort signal을 수신할 수 있도록 확장.

#### 1-A. `types/print-canvas.ts` — Props 타입 확장

`PrintExpandedViewProps` 인터페이스에 추가:
```typescript
// 생성 시작/종료 시 호출 (true = 시작, false = 완료/실패/취소)
onGeneratingChange?: (generating: boolean) => void;

// 외부에서 전달하는 AbortSignal — abort() 시 생성 fetch가 중단됨
abortSignal?: AbortSignal;
```

#### 1-B. `components/Print_ExpandedView.tsx` — 생성 로직에 연결

**구조분해 추가:**
```typescript
const { ..., onGeneratingChange, abortSignal } = props;
```

**fetch 앞뒤에 콜백 호출:**
```typescript
// 생성 시작 시
onGeneratingChange?.(true);

const res = await fetch(`${apiBaseUrl}/api/print`, {
  method: 'POST',
  body: formData,
  signal: abortSignal,   // ← 외부 signal 전달
});

// 성공 시
onGeneratingChange?.(false);
```

**abort/에러 처리:**
```typescript
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') {
    onGeneratingChange?.(false);  // 취소도 false로 정상 종료
    return;
  }
  onGeneratingChange?.(false);
  // 기존 에러 처리 유지
}
```

**검증:** `onGeneratingChange`가 반드시 대칭으로 호출되는지 확인 (true 이후 반드시 false).

---

### Phase 2: Canvas 래퍼 수정 (`project_canvas/print/ExpandedView.tsx`)

**목적:** 패키지에서 오는 생성 상태를 받아 AbortController를 생성하고, 상위로 전달.

#### Props 타입 수정 (line 12-20)

```typescript
interface Props {
  node: CanvasNode;
  onCollapse: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onGeneratePrintComplete?: (result: PrintGenerateResult) => void;
  onPrintNodeUpdate?: (updates: Partial<CanvasNode>) => void;
  autoGenerate?: boolean;
  initialDraftState?: PrintDraftState | null;
  onAbortControllerReady?: (ctrl: AbortController) => void;  // ← 추가
}
```

#### 구조분해에 추가 (line 45-52)

```typescript
export default function PrintExpandedView({
  node,
  onCollapse,
  onGeneratingChange,          // ← 추가
  onGeneratePrintComplete,
  onPrintNodeUpdate,
  autoGenerate,
  initialDraftState,
  onAbortControllerReady,      // ← 추가
}: Props) {
```

#### AbortController 관리 로직 추가

> **[피드백 반영]** `useRef`로 AbortController를 관리하면 값이 바뀌어도 리렌더링이 발생하지 않아,
> `abortSignal={abortCtrlRef.current?.signal}`이 항상 최초 렌더 시점의 `undefined`를 전달한다.
> **`useState`로 변경하여 컨트롤러 할당 시 리렌더링을 강제한다.**

```typescript
const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
```

생성 상태 핸들러:
```typescript
const handleGeneratingChange = useCallback((generating: boolean) => {
  if (generating) {
    const ctrl = new AbortController();
    setAbortCtrl(ctrl);          // state 업데이트 → 리렌더 → 패키지에 signal 전달
    onAbortControllerReady?.(ctrl);
  } else {
    setAbortCtrl(null);
    hasAutoGenerated.current = false;  // [피드백 반영] 취소 후 재생성 허용
  }
  onGeneratingChange?.(generating);
}, [onGeneratingChange, onAbortControllerReady]);
```

#### `PkgPrintExpandedView`에 prop 전달 (line 271-282)

```tsx
<PkgPrintExpandedView
  selectedImages={selectedImages}
  savedState={node.printSavedState}
  apiBaseUrl="/api/print-proxy"
  initialAction={autoGenerate ? 'generate' : undefined}
  initialDraftState={initialDraftState ?? undefined}
  onSave={handleSave}
  onDelete={onCollapse}
  onCurrentImagesChange={handleImagesChange}
  renderToolbarWrapper={renderToolbarWrapper}
  renderSidebarWrapper={renderSidebarWrapper}
  onGeneratingChange={handleGeneratingChange}   // ← 추가
  abortSignal={abortCtrl?.signal}               // ← 추가 (state이므로 리렌더 시 최신값 전달)
/>
```

---

### Phase 3: ExpandedView 중계 (`project_canvas/components/ExpandedView.tsx`)

`onAbortControllerReady`를 Props에 추가하고 `PrintExpandedView`에 전달.

**추가할 위치:** line 38 근처 (기존 `onGeneratingChange` 옆)
```typescript
onAbortControllerReady?: (ctrl: AbortController) => void;
```

**전달:** line 223-231 `<PrintExpandedView>` 렌더링 시
```tsx
<PrintExpandedView
  ...
  onAbortControllerReady={onAbortControllerReady}  // ← 추가
/>
```

---

### Phase 4: page.tsx 연결 (`project_canvas/app/page.tsx`)

`<ExpandedView>` (line ~1130)에 prop 추가:
```tsx
onAbortControllerReady={handleAbortControllerReady}
```

`handleAbortControllerReady` (line 649-651)는 이미 존재:
```typescript
const handleAbortControllerReady = useCallback((ctrl: AbortController) => {
  abortControllerRef.current = ctrl;
}, []);
```

**추가 변경 없음.** 기존 취소 로직이 그대로 작동한다:
```typescript
onCancel={() => {
  abortControllerRef.current?.abort();  // print AbortController가 연결됨
  setIsGenerating(false);
}}
```

> **[피드백 확인 — 전역 ref 레이스 컨디션]**
> `abortControllerRef`는 모든 생성 타입(sketch-to-image, plan, viewpoint, print)이 공유하는 전역 ref다.
> print 생성 중 사용자가 다른 노드 탭을 조작해 다른 AbortController가 ref를 덮어쓸 경우,
> print 토스트 X 클릭이 엉뚱한 프로세스를 취소하는 레이스 컨디션이 이론적으로 가능하다.
> **그러나 이 문제는 현재 아키텍처 전반의 기존 제약이며 print 도입과 무관하게 존재한다.**
> `isGenerating`이 `true`인 동안 다른 생성 버튼이 비활성화되는 기존 UI 가드가 주요 방어선이다.
> 생성 타입별 분리된 abort ref 체계로의 전환은 별도 리팩터링 작업으로 분리한다.

---

### Phase 5: 프록시 라우트 req.signal 전파 (`project_canvas/app/api/print-proxy/api/print/route.ts`)

**목적:** 클라이언트(패키지 내부 fetch)가 abort되면 → 프록시도 upstream 연결을 끊음.

**현재 (line 57-62):**
```typescript
const upstream = await fetch(TARGET_URL, {
  method:  'POST',
  headers: forwardHeaders,
  body:    buffer,
  signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
});
```

**변경 후:**
```typescript
// 클라이언트 abort 신호 + 타임아웃을 결합
let combinedSignal: AbortSignal;
if (typeof AbortSignal.any === 'function') {
  // Node.js 20.3+
  combinedSignal = AbortSignal.any([req.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
} else {
  // Node.js 18 fallback
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(new DOMException('TimeoutError', 'TimeoutError')), UPSTREAM_TIMEOUT_MS);
  req.signal.addEventListener('abort', () => { ctrl.abort(req.signal.reason); clearTimeout(timeoutId); }, { once: true });
  combinedSignal = ctrl.signal;
}

const upstream = await fetch(TARGET_URL, {
  method:  'POST',
  headers: forwardHeaders,
  body:    buffer,
  signal:  combinedSignal,
});
```

**에러 핸들러 업데이트 (line 75-87):**
```typescript
} catch (err) {
  const elapsed = Date.now() - startTime;
  const isTimeout = err instanceof Error && err.name === 'TimeoutError';
  const isAbort   = err instanceof Error && err.name === 'AbortError';

  if (isTimeout) {
    console.error(`[print-bff] ✕ TIMEOUT (${elapsed}ms)`);
    return NextResponse.json({ error: 'Print 서버 응답 시간 초과' }, { status: 504 });
  }
  if (isAbort) {
    console.log(`[print-bff] ✕ CLIENT CANCELLED (${elapsed}ms)`);
    // [피드백 반영] 499는 비표준 → 모니터링 툴 오탐 방지를 위해 204 사용
    return new NextResponse(null, { status: 204 });
  }
  console.error(`[print-bff] ✕ FETCH FAILED (${elapsed}ms):`, err);
  return NextResponse.json(
    { error: `Print 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}` },
    { status: 502 },
  );
}
```

---

## 4. 성공 기준 (검증 체크리스트)

- [ ] print 생성 버튼 클릭 → 하단에 "PRINT GENERATING" 토스트 즉시 표시
- [ ] 생성 완료 시 토스트 자동 소멸 (`onGeneratingChange(false)` 호출 확인)
- [ ] 토스트 X 버튼 클릭 → 토스트 사라짐
- [ ] X 클릭 후 브라우저 네트워크 탭 → `/api/print-proxy/api/print` 요청이 **cancelled** 표시
- [ ] X 클릭 후 서버 로그 → `[print-bff] ✕ CLIENT CANCELLED` 출력
- [ ] 취소 후 노드 상태 변경 없음 (썸네일 업데이트 안 됨)
- [ ] 취소 후 재생성 가능 (GENERATE 버튼 재클릭 정상 작동 — `hasAutoGenerated` 리셋 확인)

---

## 5. 의존성 및 주의사항

### 5.1 패키지 빌드 및 반영 순서
1. `cai-harness-print`에서 변경 후 패키지 빌드
2. `project_canvas`에서 패키지 업데이트 (`npm install` 또는 workspace link)
3. canvas 래퍼 코드 변경

### 5.2 abortSignal prop 전달 타이밍 [피드백 반영 — 해결됨]
~~`useRef`로 관리 시 리렌더 없이 signal이 undefined로 전달되는 문제.~~
→ Phase 2에서 `useState`로 변경하여 해결. `setAbortCtrl(ctrl)` 호출 시 리렌더링이 발생하고,
다음 렌더에서 `abortSignal={abortCtrl?.signal}`에 최신 signal이 전달된다.

### 5.3 hasAutoGenerated ref 리셋 [피드백 반영 — 해결됨]
~~취소 후 `hasAutoGenerated.current`가 `true`로 남으면 재생성 불가.~~
→ Phase 2의 `handleGeneratingChange(false)` 내부에 `hasAutoGenerated.current = false` 명시.
autoGenerate 플래그로 시작한 뒤 취소해도 재생성 가능.

### 5.4 전역 abortControllerRef 레이스 컨디션 [피드백 확인 — 기존 아키텍처 제약]
이번 PR의 직접 문제는 아님. Phase 4 주의사항 참조.
생성 타입별 분리된 ref 체계 도입은 별도 리팩터링 이슈로 기록.

### 5.5 `AbortSignal.any()` 호환성
- Node.js 20.3.0 이상: 네이티브 지원
- Node.js 18.x: 미지원 → Phase 5 fallback 코드 반드시 포함
- **구현 전 `package.json engines` 또는 `.nvmrc` 확인 후, 프로젝트 최소 Node.js 버전에 맞춰 분기 처리할 것**

### 5.6 204 응답과 클라이언트 측 처리
`@cai-crete/print-components` 내부 fetch가 204를 에러로 처리하는지 확인 필요.
일반적으로 fetch는 2xx를 성공으로 간주하므로, 패키지가 응답 body를 파싱하려다 실패할 수 있다.
**패키지 소스의 fetch 후처리 코드를 확인하여, abort 시 응답을 별도로 핸들링하는지 검토할 것.**

---

## 6. 범위 외 (Out of Scope)

- print 라이브러리(`/api/library`) fetch의 abort — 생성 요청이 아니므로 제외
- 취소 후 토스트 메시지 변경 ("취소됨" 등) — 현재 UI 패턴 유지
- 기타 노드 타입(elevation, viewpoint 등)의 abort 로직 — 별도 작업
