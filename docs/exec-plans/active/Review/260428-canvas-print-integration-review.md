# Canvas ↔ Print 연동 구현 검토 보고서 및 개선 계획서

> **작성일**: 2026-04-28  
> **검토 범위**: `260428-print-canvas-connection-fix.md` + `260428-generate-413-fix.md` 전체 구현물  
> **검토 기준**: 하드코딩 여부 / 팀간 재현성 / 오류 위험 / 보안 / 장기 유지보수성

---

## 1. 진행 현황 요약

| 단계 | 항목 | 상태 |
|------|------|------|
| Phase 0 | 환경변수 수령 | ✅ 완료 |
| Phase 1-3 | `.env.local.example`, `.npmrc`, `next.config.ts` | ✅ 완료 |
| Phase 4 | BFF 전용 라우트 교체 | ✅ 완료 |
| Phase 5-6 | `layout.tsx`, `print/ExpandedView.tsx` 교체 | ✅ 완료 |
| Phase 7 | 패키지 설치 (0.1.1) | ✅ 로컬 경로로 설치 |
| Phase 8 | 로컬 연동 테스트 전 항목 | ✅ 통과 |
| Phase 10 | 버그 수정 (썸네일 이중 prefix, generatedImageData) | ✅ 완료 |
| Phase 9 | Vercel 환경변수 설정 | ⏳ 배포 시 필요 |
| — | **package.json 로컬 경로 → GitHub Packages 버전 교체** | ❌ **미완료** |

---

## 2. 발견된 이슈

### ❶ [Critical] package.json 로컬 경로 의존성

**파일**: [project_canvas/package.json](../../../project_canvas/package.json) line 13

```json
"@cai-crete/print-components": "file:../../cai-harness-print/project.10_print"
```

**문제**:
- 다른 개발자가 이 레포를 클론 후 `npm install`을 실행하면 `../../cai-harness-print/project.10_print` 경로가 없어 **즉시 실패**
- Vercel CI/CD에서 빌드 시 `cai-harness-print` 레포가 체크아웃되지 않으므로 **배포 불가**
- `package-lock.json`이 로컬 경로를 기록하므로 팀 간 lock 파일 불일치 발생

**영향**: 현재 로컬에서는 동작하지만 **다른 개발자 재현 불가 / Vercel 배포 불가**

---

### ❷ [High] `@/app/*` webpack alias — 현재 프로젝트 `app/` 경로 충돌 위험

**파일**: [project_canvas/next.config.ts](../../../project_canvas/next.config.ts) line 23

```typescript
'@/app': `${PRINT_PKG}/app`,
```

**문제**: `@/app`은 Next.js 프로젝트의 표준 경로다. 미래에 Canvas 측 개발자가 `@/app/something`을 import하면 print-components 내부로 리디렉션된다. 현재는 프로젝트 소스에서 `@/app/`을 사용하는 파일이 없어 무증상이지만 **잠재적 트랩**이다.

**tsconfig.json도 동일**:
```json
"@/app/*": ["./node_modules/@cai-crete/print-components/app/*"]
```
`@/app/*`가 `@/*` 보다 먼저 선언되어 있어, Canvas 자체 `app/` 디렉토리 파일을 `@/app/`로 참조하는 순간 print-components 내부로 잘못 라우팅된다.

---

### ❸ [High] `CanvasNode.printSelectedImages` 타입 중복 정의 — 패키지 타입과 분리됨

**파일**: [project_canvas/types/canvas.ts](../../../project_canvas/types/canvas.ts) line 174-179

```typescript
printSelectedImages?: Array<{
  id: string;
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  filename?: string;
}>;
```

패키지의 `SelectedImage` 타입과 구조를 중복 정의하고 있다. `print/ExpandedView.tsx`에서:

```typescript
const selectedImages: SelectedImage[] = node.printSelectedImages
  ? (node.printSelectedImages as SelectedImage[])  // ← as 캐스팅으로 억지로 맞춤
  : ...
```

패키지가 `SelectedImage` 필드를 추가/변경하면 Canvas 측 타입이 조용히 어긋나고, `as` 캐스팅이 컴파일러 경고를 억압한다.

---

### ❹ [High] `printSavedState.mode` 타입 하드코딩 — 패키지 타입과 분리됨

**파일**: [project_canvas/types/canvas.ts](../../../project_canvas/types/canvas.ts) line 168-173

```typescript
printSavedState?: {
  html: string;
  mode: 'REPORT' | 'PANEL' | 'DRAWING' | 'VIDEO';  // ← 패키지와 독립 정의
  prompt?: string;
  savedAt: string;
  metadata?: Record<string, unknown>;
};
```

패키지가 새 mode 값(예: `'SECTION'`)을 추가하면 Canvas 측에서 TypeScript 오류 없이 저장하지만, 재진입 시 패키지가 알 수 없는 mode 값을 받아 **런타임 오류** 또는 상태 초기화 가능.

---

### ❺ [Medium] BFF fetch에 타임아웃 없음

**파일**: [project_canvas/app/api/print-proxy/api/print/route.ts](../../../project_canvas/app/api/print-proxy/api/print/route.ts) line 55

```typescript
const upstream = await fetch(TARGET_URL, {
  method:  'POST',
  headers: forwardHeaders,
  body:    buffer,
  // ← AbortSignal 없음
});
```

Print 서버가 무응답이거나 느리면 `maxDuration: 300`(5분) 전체를 소모한다. Vercel 유료 플랜에서 실행 시간만큼 비용 발생.

---

### ❻ [Medium] `library/route.ts` `maxDuration` 미설정

**파일**: [project_canvas/app/api/print-proxy/api/library/route.ts](../../../project_canvas/app/api/print-proxy/api/library/route.ts)

`print/route.ts`에는 `export const maxDuration = 300;`이 있지만 `library/route.ts`에는 없다. Vercel 기본값(무료 10s / Pro 15s)에 의존해 느린 library API 응답 시 타임아웃 실패 가능.

---

### ❼ [Medium] `next.config.ts` `bodySizeLimit` 주석 오해 소지

**파일**: [project_canvas/next.config.ts](../../../project_canvas/next.config.ts) line 12

```typescript
bodySizeLimit: '50mb', // BFF proxy route handler도 적용 (Next.js 15.1+)
```

이 설정은 **server actions handler**가 multipart POST를 인터셉트할 때의 크기 제한이다. Route handler 자체의 크기 제한이 아니며, 이 설정으로 action handler가 50MB 이하의 multipart 요청을 413 없이 통과시켜 BFF route handler가 실행될 수 있게 되는 것이다. 주석이 동작 원리를 오해하게 유도한다.

---

### ❽ [Low] `reactStrictMode: false` — Strict Mode 비활성화

**파일**: [project_canvas/next.config.ts](../../../project_canvas/next.config.ts) line 7

```typescript
reactStrictMode: false,
```

개발 중 의도적으로 비활성화한 것으로 보이나, React Strict Mode는 `useEffect` 이중 실행 등을 통해 부작용 버그를 조기에 감지한다. Print 패키지 컴포넌트가 Strict Mode에서 동작하는지 검증되지 않은 상태.

---

### ❾ [Low] `content-length` 헤더 수동 설정

**파일**: [project_canvas/app/api/print-proxy/api/print/route.ts](../../../project_canvas/app/api/print-proxy/api/print/route.ts) line 50

```typescript
forwardHeaders.set('content-length', String(buffer.byteLength));
```

Node.js의 `fetch()`는 `body`가 `ArrayBuffer`일 때 `content-length`를 자동 계산한다. 수동 설정 시 일부 환경에서 중복 설정 경고가 발생할 수 있다. 실질적 오류 위험은 낮다.

---

## 3. 종합 평가

| 관점 | 평가 | 비고 |
|------|------|------|
| 보안 (BFF SSRF 차단) | ✅ 양호 | 고정 경로, 인증 필수, 허용 헤더만 포워딩 |
| 보안 (환경변수 관리) | ✅ 양호 | `.npmrc`가 `${GITHUB_TOKEN}` 참조 방식 사용 |
| 로컬 동작 | ✅ 완전히 동작 | 테스트 전 항목 통과 |
| 팀간 재현성 | ❌ **불가** | `file:` 로컬 경로 의존 |
| CI/CD 배포 | ❌ **불가** | 동일 이유 |
| 타입 안전성 | ⚠️ 불완전 | 패키지 타입과 분리된 중복 정의 |
| 장기 유지보수 | ⚠️ 주의 필요 | `@/app` 별칭 충돌 잠재 위험 |
| 코드 품질 | ✅ 양호 | 불필요한 하드코딩 없음 |

---

## 4. 개선 계획

### Phase A — 즉시 수정 (Print 팀 패키지 배포 완료 후, 배포 전 필수)

#### A-1. `package.json` 로컬 경로 → GitHub Packages 버전으로 교체

**선행 조건**: Print 팀이 `@cai-crete/print-components@0.1.1`을 GitHub Packages에 배포 완료

```bash
# project_canvas/ 에서 실행
npm install @cai-crete/print-components@0.1.1
```

결과: `package.json`에 `"@cai-crete/print-components": "^0.1.1"` 기록, `file:` 경로 제거

- [ ] `package.json` `file:` 경로 제거 확인
- [ ] `npm install` 깨끗하게 성공 확인 (다른 경로 없이)
- [ ] `package-lock.json` 커밋

**⚠️ A-1 후에도 남는 전제 조건 — 인수인계 가이드 필수 작성**

`file:` 경로가 제거되어도 다른 개발자가 프로젝트를 받으려면 여전히 세 가지 전제가 필요하다:

| 전제 조건 | 미충족 시 결과 |
|----------|-------------|
| `GITHUB_TOKEN` (packages:read 권한) | `npm install` 실패 → **Print 노드 ExpandedView 열리지 않음** |
| `PRINT_API_URL` 환경변수 | BFF 503 → GENERATE 버튼 동작 안 함 |
| `CANVAS_API_SECRET` 환경변수 | BFF 503 → 동일 |

> **Print 노드 데이터(thumbnailData, printSavedState, printSelectedImages)는 브라우저 localStorage에 저장되므로 패키지 설치 방식과 무관하게 유지된다.** 패키지 미설치 시 노드 '데이터'가 사라지는 것이 아니라, Print ExpandedView UI가 열리지 않는 것이다.

- [ ] `README.md` 또는 별도 `SETUP.md`에 신규 개발자 온보딩 절차 작성:
  1. GitHub Token 발급 방법 (Personal Access Token → packages:read)
  2. `.env.local` 환경변수 3개 기입 방법 (Print 팀에서 `PRINT_API_URL`, `CANVAS_API_SECRET` 수령)
  3. `npm install` 실행
  4. `npm run dev` (port 3900)

---

#### A-2. `CanvasNode` 타입 — 패키지 타입 직접 참조로 교체

**파일**: [project_canvas/types/canvas.ts](../../../project_canvas/types/canvas.ts)

```typescript
// 추가 (상단 import)
import type { SelectedImage } from '@cai-crete/print-components';

// 변경 전
printSelectedImages?: Array<{
  id: string;
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  filename?: string;
}>;

// 변경 후
printSelectedImages?: SelectedImage[];
```

**`printSavedState.mode` 처리**: 패키지가 `PrintSavedState` 타입을 export하면 동일하게 import 적용. 미export 시 현행 유지하되 주석으로 수동 동기화 필요성 표시.

- [ ] `types/canvas.ts`에서 `SelectedImage` import 후 `printSelectedImages` 타입 교체
- [ ] `print/ExpandedView.tsx`의 `as SelectedImage[]` 캐스팅 제거
- [ ] `tsc --noEmit` 오류 0건 확인
- [ ] `print/ExpandedView.tsx`의 `selectedImages` 구성 시 Optional Chaining + 기본값 방어 코딩 확인
  - 예: `base64: img.base64 ?? ''`, `mimeType: img.mimeType ?? 'image/jpeg'`
  - 이유: `localStorage`에 저장된 기존 데이터는 패키지 `SelectedImage` 구조 변경을 인지하지 못하므로, 타입 import 방식과 무관하게 런타임 불일치가 발생할 수 있음

---

### Phase B — 권장 수정 (릴리즈 전)

#### B-1. `@/app` webpack alias 이름 변경

**파일**: [project_canvas/next.config.ts](../../../project_canvas/next.config.ts) + [tsconfig.json](../../../project_canvas/tsconfig.json)

`@/app` 대신 패키지 내부 경로명이 명확하게 드러나도록 alias 이름 변경:

```typescript
// next.config.ts — 변경 전
'@/app': `${PRINT_PKG}/app`,

// 변경 후 — 패키지 내부 참조임을 명시
'@cai-crete/print-components/app': `${PRINT_PKG}/app`,
```

> **⚠️ 주의**: 이 alias는 print-components 패키지 *내부* 파일들이 `@/app`으로 자기 자신을 참조할 때 해소하기 위해 만든 것이다. alias 이름 변경 시 패키지 내부 import가 해소되지 않아 빌드 실패 가능. **Print 팀과 실제 패키지 내부 import 경로 및 빌드 방식 확인 후 진행** 할 것.
>
> **추가 확인 사항** (외부 검토 반영): 패키지가 빌드 후 배포되는 경우(`tsc` 또는 번들러로 `@/` 경로가 상대 경로로 이미 컴파일됨), alias가 런타임에 불필요해진다. 반대로 소스 형태로 배포(현재 `file:` 방식)되면 webpack alias가 반드시 필요하다. Print 팀에 **"패키지가 소스 배포인가, 빌드 배포인가"** 를 확인하는 것이 alias 전략의 핵심 전제다.
>
> 즉각 수정보다는 Canvas 프로젝트에서 `@/app/`으로 시작하는 import를 **절대 사용하지 않는다**는 팀 규칙 수립이 현실적.

- [ ] Print 팀에 패키지 빌드 방식(소스 배포 vs 번들 배포) 및 내부 `@/app` import 사용 여부 확인
- [ ] Canvas 프로젝트 코드 규칙: `@/app/`으로 시작하는 import 금지 명문화

---

#### B-2. BFF fetch 타임아웃 추가

**파일**: [project_canvas/app/api/print-proxy/api/print/route.ts](../../../project_canvas/app/api/print-proxy/api/print/route.ts)

```typescript
// 변경 전
const upstream = await fetch(TARGET_URL, {
  method:  'POST',
  headers: forwardHeaders,
  body:    buffer,
});

// 변경 후 — 타임아웃 추가 (값은 Print 서버 응답 시간 측정 후 결정)
const upstream = await fetch(TARGET_URL, {
  method:  'POST',
  headers: forwardHeaders,
  body:    buffer,
  signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
});
```

**타임아웃 값 결정 방법**: 서버 로그(`[print-bff] ◀ ${upstream.status} (${elapsed}ms)`)에서 실제 Print 서버 응답 시간을 측정한 후, 평균 응답 시간의 2~3배로 설정. 측정 전 임시값은 `120_000`(120초)으로 시작.

> **외부 검토 의견 수정**: "120초 이전에 Vercel 504 발생" 주장은 사실 오류다. `maxDuration = 300`(5분)이 설정되어 있으므로 fetch timeout(120초)은 항상 maxDuration 이내에 발생하고, AbortError를 catch하여 502를 반환한다. Vercel 504는 maxDuration 초과 시에만 발생한다(300 > 120이므로 발생 불가). 단, UX 관점에서 타임아웃 값을 실제 응답 시간 기반으로 단축하는 원칙 자체는 유효하다.

- [ ] Print 서버 평균 응답 시간을 로그에서 측정 (최소 3회 샘플)
- [ ] 측정값 기반으로 `UPSTREAM_TIMEOUT_MS` 확정 (측정 불가 시 `120_000` 사용)
- [ ] `print/route.ts` fetch에 `signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)` 추가
- [ ] 타임아웃 시 AbortError → 기존 catch 블록이 502 반환함을 확인

---

#### B-3. `library/route.ts` `maxDuration` 추가

**파일**: [project_canvas/app/api/print-proxy/api/library/route.ts](../../../project_canvas/app/api/print-proxy/api/library/route.ts)

```typescript
// 추가
export const maxDuration = 30;
```

- [ ] `library/route.ts` 상단에 `export const maxDuration = 30;` 추가

---

#### B-5. BFF catch 블록 로깅 세분화 (신규)

**파일**: [project_canvas/app/api/print-proxy/api/print/route.ts](../../../project_canvas/app/api/print-proxy/api/print/route.ts)

현재 catch 블록은 모든 fetch 실패를 동일하게 처리한다. AbortError(타임아웃)와 네트워크 단절을 구분하면 운영 중 Vercel 로그에서 원인 진단이 빠르다.

```typescript
// 변경 전
} catch (err) {
  const elapsed = Date.now() - startTime;
  console.error(`[print-bff] ✕ FETCH FAILED (${elapsed}ms):`, err);
  return NextResponse.json(
    { error: `Print 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}` },
    { status: 502 },
  );
}

// 변경 후
} catch (err) {
  const elapsed = Date.now() - startTime;
  const isTimeout = err instanceof Error && err.name === 'TimeoutError';
  if (isTimeout) {
    console.error(`[print-bff] ✕ TIMEOUT (${elapsed}ms): upstream did not respond`);
    return NextResponse.json({ error: 'Print 서버 응답 시간 초과' }, { status: 504 });
  }
  console.error(`[print-bff] ✕ FETCH FAILED (${elapsed}ms):`, err);
  return NextResponse.json(
    { error: `Print 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}` },
    { status: 502 },
  );
}
```

> **참고**: `AbortSignal.timeout()`이 발생시키는 에러는 `name === 'TimeoutError'`다 (`AbortError`와 구별). 타임아웃은 504(Gateway Timeout), 네트워크 단절은 502(Bad Gateway)로 분리해 클라이언트가 재시도 여부를 판단하기 쉽게 한다.

- [ ] `print/route.ts` catch 블록에 `TimeoutError` 분기 추가 (B-2 완료 후 함께 적용)

---

#### B-4. `next.config.ts` `bodySizeLimit` 주석 정정

**파일**: [project_canvas/next.config.ts](../../../project_canvas/next.config.ts)

```typescript
// 변경 전
bodySizeLimit: '50mb', // BFF proxy route handler도 적용 (Next.js 15.1+)

// 변경 후
// Next.js action-handler가 multipart/form-data POST를 인터셉트할 때의 크기 제한.
// 이 값이 없으면 기본 1MB → 이미지 업로드 시 413 발생 후 BFF route handler가 실행조차 안 됨.
bodySizeLimit: '50mb',
```

- [ ] `next.config.ts` 주석 수정

---

### Phase C — 장기 개선 (배포 안정화 이후)

#### C-1. `reactStrictMode: true` 검증 후 활성화

1. **별도 브랜치**에서 `next.config.ts`의 `reactStrictMode: true` 변경
2. Print ExpandedView에서 `useEffect` 이중 실행으로 인한 부작용(API 이중 호출 등) 확인
3. Canvas 전체 기능 회귀 테스트 (Strict Mode는 이중 실행이 개발 환경에서만 발생하나, 예상치 못한 side-effect 가능)
4. 문제 없으면 main 병합, 문제 발생 시 Print 팀과 패키지 수정 협의 후 병합

#### C-2. `content-length` 헤더 제거 (선택)

**파일**: [project_canvas/app/api/print-proxy/api/print/route.ts](../../../project_canvas/app/api/print-proxy/api/print/route.ts)

```typescript
// 제거 — Node.js fetch가 ArrayBuffer에서 자동 계산
forwardHeaders.set('content-length', String(buffer.byteLength));
```

실질적 영향이 없으므로 다른 변경과 묶어서 처리.

#### C-3. 에러 응답 언어 통일

현재 BFF 오류 메시지가 한국어로 작성되어 있어(`'Print 서버 URL이 설정되지 않았습니다.'`) 로그 파싱, 다국어 지원 시 불편. 영문 에러 코드 + 한국어 description 병행 사용 검토.

---

## 5. 수정 우선순위 요약

| 우선순위 | 항목 | 파일 | 선행 조건 |
|---------|------|------|----------|
| 🔴 P0 (배포 전 필수) | A-1. `file:` 경로 → GitHub Packages | `package.json` | Print 팀 패키지 배포 |
| 🟠 P1 (릴리즈 전 권장) | A-2. `CanvasNode` 타입 패키지 직접 참조 + 방어 코딩 | `types/canvas.ts` | A-1 완료 후 |
| 🟠 P1 | B-2. BFF fetch 타임아웃 (응답 시간 측정 후 확정) | `print/route.ts` | 없음 |
| 🟠 P1 | B-3. library `maxDuration` | `library/route.ts` | 없음 |
| 🟠 P1 | B-5. BFF catch 블록 TimeoutError 분기 | `print/route.ts` | B-2 완료 후 |
| 🟡 P2 | B-4. `bodySizeLimit` 주석 수정 | `next.config.ts` | 없음 |
| 🟡 P2 | B-1. `@/app` alias 위험 대응 (빌드 방식 확인 후) | 팀 규칙 + Print 팀 | Print 팀 확인 |
| 🟢 P3 (선택) | C-1. Strict Mode 활성화 검증 (별도 브랜치) | `next.config.ts` | 안정화 후 |
| 🟢 P3 | C-2. `content-length` 제거 | `print/route.ts` | P1 완료 묶음 |

---

## 6. 현재 코드에서 잘 된 것

- BFF 구조 자체는 **설계가 올바름**: 고정 경로, 인증 헤더 필수 주입, 허용 헤더만 포워딩, 크기 제한 → SSRF 위험 제거
- `PRINT_API_URL` trailing slash 제거 처리 (`replace(/\/+$/, '')`) — 실수 방지
- 환경변수 미설정 시 503 반환 (undefined proxy URL로 요청 시도하지 않음) — 즉각 진단 가능
- `printSelectedImages` / `printSavedState` 분리 저장으로 재진입 상태 복원 완성
- `thumbnailData`와 `generatedImageData` 역할 분리 수정이 정확함
- NodeCard `startsWith('data:')` 체크로 data URL 이중 prefix 방지

---

---

## 7. 외부 검토 의견 반영 기록 (2026-04-28)

외부 개발자 검토 4건 + 추가 제언 1건에 대한 반영 여부 판단.

| # | 의견 요약 | 판단 | 반영 내용 |
|---|----------|------|----------|
| ❶ | 패키지 빌드 방식(External 처리) 확인 필요 | **부분 반영** | B-1 체크리스트에 "소스 배포 vs 번들 배포" 확인 항목 추가 (위험은 이미 계획서에 기술되어 있었음) |
| ❷ | 타입 참조 방식 변경 시 저장 데이터 구조 불일치 → White Out 위험 | **반영 (전제 수정)** | A-2에 Optional Chaining + 기본값 방어 코딩 추가. 단, "TypeScript가 통과되어도 화면이 깨진다"는 전제는 오류 — 패키지 타입 직접 import 시 컴파일 타임에 감지됨. 저장 데이터 불일치 위험 자체는 유효 |
| ❸ | 120초 이전에 Vercel 504 발생 가능 | **반영 (사실 오류 수정)** | "504 before 120s" 주장은 오류 (maxDuration=300 > timeout=120이므로 발생 불가). 단, 실제 응답 시간 기반 타임아웃 조정 원칙은 유효 → B-2에 측정 절차 추가 |
| ❹ | Strict Mode는 별도 브랜치에서 회귀 테스트 후 병합 | **반영** | C-1에 별도 브랜치 + 회귀 테스트 절차 명시 (계획서에 이미 위험 기술됨, 실행 절차 보강) |
| ➕ | BFF catch 블록에서 실패 단계 구분 로깅 추가 | **반영** | B-5 신규 항목 추가: TimeoutError vs 네트워크 실패 분기, 각각 504/502 반환 |

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
