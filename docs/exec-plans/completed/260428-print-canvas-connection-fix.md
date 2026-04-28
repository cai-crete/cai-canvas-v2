# Canvas ↔ Print 노드 연결 불량 원인 분석 및 수정 계획서

> **작성일**: 2026-04-28  
> **근거 레포**: `https://github.com/cai-crete/CAI2-print` (정상 작동 참조)  
> **대상 프로젝트**: `project_canvas/` (cai-canvas-v2-jw)  
> **확정 방향**: **경로 A (@cai-crete/print-components 패키지 통합) + BFF 전용 라우트**

---

## 1. 진단 요약

참조 레포(`CAI2-print`)에서는 정상 연결되었으나 현재 프로젝트에서 연결이 안 되는 이유는  
**3개의 Critical 결함과 3개의 High/Medium 결함**이 복합적으로 작용하고 있기 때문이다.

---

## 2. 원인 분석 (심각도 순)

### ❶ [Critical] PRINT_API_URL 환경변수 미설정

**파일**: `project_canvas/app/api/print-proxy/[...path]/route.ts` (line 6)

```typescript
const PRINT_API_URL = process.env.PRINT_API_URL!;  // ← 값이 없으면 undefined
```

- `.env.local.example`에 `PRINT_API_URL` 항목 자체가 없음
- 환경변수가 없으면 proxy URL이 `undefined/api/print` → **즉시 502 오류** 발생

---

### ❷ [Critical] API 응답 파싱 형식 불일치

**파일**: `project_canvas/print/ExpandedView.tsx` (line 84~91)

```typescript
// 현재 코드 — 이미지 배열 기대
const resultPages: string[] =
  Array.isArray(data.pages)       ? (data.pages  as string[]) :
  Array.isArray(data.images)      ? (data.images as string[]) :
  typeof data.result === 'string' ? [data.result]             :
  typeof data.url    === 'string' ? [data.url]                : [];

if (resultPages.length === 0) throw new Error('결과 데이터가 없습니다.');
```

**실제 print 서버 응답** (`POST /api/print` — work-instruction.md §4 기준):

```json
{
  "html": "<!DOCTYPE html>...(완성 HTML, 인라인 Base64 이미지 포함)...",
  "slotMapping": { ... },
  "masterData": { ... },
  "executionLog": { ... },
  "videoUri": "..."
}
```

- `data.pages`, `data.images`, `data.result`, `data.url` 어느 것도 존재하지 않음
- `resultPages`는 항상 `[]` → **항상 "결과 데이터가 없습니다." 에러** 발생
- → 경로 A에서 npm 패키지 컴포넌트로 교체하여 해결

---

### ❸ [Critical] CANVAS_API_SECRET 환경변수 미설정

**파일**: `project_canvas/app/api/print-proxy/[...path]/route.ts` (line 7, 26)

```typescript
const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET;
if (CANVAS_API_SECRET) forwardHeaders.set('x-canvas-api-secret', CANVAS_API_SECRET);
```

- `.env.local`에 `CANVAS_API_SECRET`이 없으면 헤더 미전달 → **401 Unauthorized**
- Print 서버에 설정된 값과 정확히 일치해야 함

---

### ❹ [High] @cai-crete/print-components 패키지 미설치

| 항목 | 참조 레포 (CAI2-print) | 현재 프로젝트 (cai-canvas-v2-jw) |
|------|----------------------|--------------------------------|
| `package.json` | `@cai-crete/print-components` 의존성 포함 | 미포함 |
| `node_modules/@cai-crete/` | 설치됨 | **없음** |
| `print/ExpandedView.tsx` | 패키지에서 re-export | 자체 작성 (API 계약 불일치) |
| `.npmrc` | GitHub Packages 레지스트리 설정됨 | **없음** |

---

### ❺ [High] next.config.ts 패키지 설정 누락

**필요한 설정** (참조 레포 기준):

```typescript
transpilePackages: ['@cai-crete/print-components'],
webpack alias 8개: @/app, @/types/print-canvas, @/lib/types, @/lib/export,
                   @/lib/saves, @/lib/imageUtils, @/lib/thumbnailUtils,
                   @/lib/htmlUtils, @/lib/agentErrors
```

---

### ❻ [Medium] print-tokens.css 전역 미import

**파일**: `project_canvas/app/layout.tsx`

- CSS 변수(`--print-color-*`, `--print-font-*` 등)가 없으면 Print UI가 깨짐
- 참조 레포 `Print-Handover_Report-260424.md` §4 "트러블 슈팅"에서 동일 문제 보고됨

---

### ❼ [보안] [High] 개방형 catch-all 프록시 — BFF로 교체 대상

**파일**: `project_canvas/app/api/print-proxy/[...path]/route.ts`

`[...path]` catch-all 구조는 클라이언트가 임의 경로를 지정할 수 있어  
SSRF(서버사이드 요청 위조) 위험이 있음.

**위험 목록**:
1. 클라이언트가 `print-proxy/내부망/admin` 등 임의 경로 지정 가능
2. 모든 클라이언트 헤더를 print 서버로 포워딩 (불필요한 헤더 노출)
3. 요청 크기 제한 없음 (대용량 요청 DoS 가능)
4. `CANVAS_API_SECRET` 없을 때도 요청이 통과됨 (조건부 처리)

→ **BFF 전용 라우트로 교체**: 허용 경로 고정, Content-Type 검증, 크기 제한 추가

---

## 3. 결함 맵 (수정 후 흐름)

```
사용자가 GENERATE 클릭
       │
       ▼
[@cai-crete/print-components — PrintExpandedView]  ← npm 패키지 (print 팀 관리)
       │
       ▼ POST /api/print-proxy/api/print  (고정 경로, 변경 불가)
[BFF: app/api/print-proxy/api/print/route.ts]       ← Canvas 팀 관리
       │ ✔ Content-Type 검증 (multipart/form-data만 허용)
       │ ✔ 크기 제한 (20MB)
       │ ✔ CANVAS_API_SECRET 항상 주입 (조건부 아닌 필수)
       │ ✔ 허용된 헤더만 포워딩
       ▼
[cai-print-v3.vercel.app/api/print]                 ← Print 팀 관리
       │
       ▼
{ html, slotMapping, masterData, executionLog, videoUri }
```

---

## 4. 확정 수정 방향 — 경로 A + BFF

### 경로 A: `@cai-crete/print-components` npm 패키지 통합
- UI 컴포넌트는 print 팀이 관리하는 npm 패키지 사용
- API 계약 변경 시 `npm update` 한 번으로 대응
- Canvas 팀은 API 경로/인증 계층만 유지

### BFF (Backend for Frontend) 전용 라우트
- 기존 `app/api/print-proxy/[...path]/route.ts` (개방형 프록시) → **제거**
- 신규 `app/api/print-proxy/api/print/route.ts` (단일 엔드포인트 전용) → **생성**
- 신규 엔드포인트 필요 시 파일 단위로 추가 (명시적 허용 목록 방식)

**각 팀 책임 분리**:
| 계층 | 담당 | 변경 단위 |
|------|------|----------|
| UI 컴포넌트 | Print 팀 | `npm update` |
| BFF 라우트 (인증/검증) | Canvas 팀 | 파일 단위 |
| Print 비즈니스 로직 | Print 팀 | print 서버 배포 |

---

## 5. 수정 체크리스트

> **즉시 가능** = Print 팀 협조 없이 진행 가능  
> **선행 필요** = Print 팀 제공 값 또는 외부 조건 필요

### Phase 0 — 사전 준비 (선행 필요, 외부 의존)

- [ ] Print 서버팀으로부터 `CANVAS_API_SECRET` 실제 값 수령 (보안 채널)
- [ ] Print 서버 배포 URL 확인 (`https://cai-print-v3.vercel.app` 또는 `http://localhost:3777`)
- [ ] `@cai-crete/print-components` GitHub Packages 배포 완료 여부 확인 (Print 팀)
- [ ] `GITHUB_TOKEN` (`packages:read` 권한) 준비

### Phase 1 — .env.local.example 업데이트 (즉시 가능)

- [x] `project_canvas/.env.local.example` 업데이트:
  ```
  # Gemini API Key (서버사이드 전용 - 클라이언트에 노출 금지)
  GEMINI_API_KEY=your_gemini_api_key_here

  # Print 서버 연동
  PRINT_API_URL=https://cai-print-v3.vercel.app
  CANVAS_API_SECRET=your_canvas_api_secret_here

  # GitHub Packages (npm install @cai-crete/print-components 시 필요)
  GITHUB_TOKEN=your_github_token_here
  ```
- [ ] 실제 `.env.local`에 위 변수 추가 (Phase 0 완료 후)

### Phase 2 — .npmrc 생성 (즉시 가능)

- [x] `project_canvas/.npmrc` 파일 생성:
  ```ini
  @cai-crete:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
  ```

### Phase 3 — next.config.ts 업데이트 (즉시 가능)

- [x] `project_canvas/next.config.ts` 수정:
  - `import path from 'path'` 추가
  - `transpilePackages: ['@cai-crete/print-components']` 추가
  - webpack alias 8개 추가
- [x] `project_canvas/tsconfig.json` paths 추가:
  - `@/app/*`, `@/types/print-canvas`, `@/lib/types` 등 9개 패키지 경로 매핑
  - `tsc --noEmit` 오류 0건 확인

### Phase 4 — BFF 전용 라우트 교체 (즉시 가능)

- [x] `project_canvas/app/api/print-proxy/api/print/route.ts` 생성:
  - POST 전용, Content-Type 검증, 20MB 제한, `CANVAS_API_SECRET` 필수 주입, 허용 헤더만 포워딩
- [x] `project_canvas/app/api/print-proxy/api/library/route.ts` 생성:
  - GET 전용, `CANVAS_API_SECRET` 주입 (패키지가 `${apiBaseUrl}/api/library` 호출)
- [x] `project_canvas/app/api/print-proxy/[...path]/route.ts` 제거

### Phase 5 — app/layout.tsx 업데이트

- [x] `project_canvas/app/layout.tsx` 수정:
  ```typescript
  import '@cai-crete/print-components/styles/print-tokens.css';
  import './globals.css';
  ```

### Phase 6 — print/ExpandedView.tsx 교체

- [x] `project_canvas/print/ExpandedView.tsx` 교체:
  - `PrintExpandedView` 패키지 컴포넌트 래핑
  - `renderToolbarWrapper`로 닫기 버튼 + 툴바 주입
  - `CanvasNode` → `SelectedImage[]` 변환 (node.generatedImageData ?? node.thumbnailData)
  - `onSave(PrintSaveResult.thumbnail)` → `onGeneratePrintComplete({ thumbnailBase64 })` 매핑
  - `apiBaseUrl="/api/print-proxy"` 고정
- [x] `PrintGenerateResult` 타입 유지 (components/ExpandedView.tsx 하위 호환)

### Phase 7 — npm 패키지 설치

- [x] `GITHUB_TOKEN` 제공 후 `@cai-crete/print-components@0.1.0` 설치 완료
- [x] `node_modules/@cai-crete/print-components/` 존재 확인

### Phase 8 — 로컬 연동 테스트

- [x] `.env.local`에 `PRINT_API_URL`, `CANVAS_API_SECRET` 설정 완료 확인
- [x] Canvas 개발 서버(`http://localhost:3900`) 실행 → 200 OK
- [x] BFF `/api/print-proxy/api/print` → Print 서버 연결 확인 (500: 빈 body 거부 = 정상 연결)
- [x] GET 차단: `/api/print-proxy/api/print` GET → 405
- [x] 임의 경로 차단: `/api/print-proxy/other-path` → 404
- [x] trailing slash 버그 수정: `PRINT_API_URL` 말미 `/` 제거 처리 추가
- [x] 브라우저에서 Print 노드 클릭 → ExpandedView 열림 확인 ✅
- [x] GENERATE 버튼 클릭 → 실제 이미지로 문서 생성 확인 ✅ (품질 개선은 추후)
- [ ] SAVE 후 이미지 슬롯 및 썸네일 버그 수정 (Phase 10 참조)
- [ ] 생성 완료 후 SAVE → Canvas 썸네일 정상 표시 확인

### Phase 9 — Vercel 환경변수 설정 (배포 시)

- [ ] Vercel Dashboard → Settings → Environment Variables:
  - `PRINT_API_URL=https://cai-print-v3.vercel.app`
  - `CANVAS_API_SECRET=<실제 값>`
  - `GITHUB_TOKEN=<packages:read 권한>`

---

## 7. SAVE 후 발생한 신규 버그 (2026-04-28 발견)

### 버그 ❶ — SAVE 후 이미지 슬롯 내용이 print 썸네일로 대체됨

**증상**: Print ExpandedView에서 이미지를 삽입 후 GENERATE → SAVE 하면, Canvas로 돌아와 Print 노드를 다시 열었을 때 INSERT IMAGE 슬롯에 원본 삽입 이미지가 아닌 print 문서 썸네일이 채워짐.

**원인 추적**:

```
SAVE 클릭
  └→ Print_ExpandedView.tsx: handleSave()
       └→ generateThumbnail(firstPageHtml) → "data:image/jpeg;base64,..."
       └→ props.onSave({ thumbnail: "data:image/jpeg;base64,..." })
            └→ print/ExpandedView.tsx: handleSave()
                 └→ onGeneratePrintComplete({ thumbnailBase64: result.thumbnail })
                      └→ page.tsx: handleGeneratePrintComplete()
                           └→ setNodes: { thumbnailData: thumbnailBase64,
                                          generatedImageData: thumbnailBase64 }  ← ❌ 문제!

다음 재진입 시:
  └→ print/ExpandedView.tsx line 45:
       sourceImage = node.generatedImageData ?? node.thumbnailData
       = "data:image/jpeg;base64,...(print 썸네일)"  ← 원본 이미지 아님!
  └→ selectedImages = [parseNodeImage("..print 썸네일..")] → 패키지에 전달
  └→ Print_ExpandedView.tsx useEffect: setImages([File(print썸네일)])  ← ❌
```

**결론**: `handleGeneratePrintComplete`가 `generatedImageData`를 print 문서 썸네일로 덮어쓰는 것이 원인. `generatedImageData`는 canvas 이미지 원본 참조용 필드인데, print 출력물 썸네일을 저장하는 데 오용됨.

**수정 방향**:

| 필드 | 역할 구분 (수정 후) |
|------|-------------------|
| `thumbnailData` | Canvas 카드(NodeCard)에 표시할 썸네일 — print 저장 시 업데이트 |
| `generatedImageData` | 원본 소스 이미지 (편집 재진입 시 슬롯 복원용) — **print 저장 시 건드리지 않음** |

**수정 파일 2개**:

1. **`project_canvas/app/page.tsx`** — `handleGeneratePrintComplete` (line ~569):
   ```typescript
   // 수정 전
   ? { ...n, hasThumbnail: true, thumbnailData: thumbnailBase64, generatedImageData: thumbnailBase64 }
   // 수정 후 — thumbnailData 덮어쓰기 전에 원본 소스를 generatedImageData에 보존
   ? {
       ...n, hasThumbnail: true, thumbnailData: thumbnailBase64,
       generatedImageData: n.generatedImageData ?? n.thumbnailData,
     }
   ```

2. **`project_canvas/print/ExpandedView.tsx`** — `sourceImage` (line ~45):
   ```typescript
   // 수정 전 — 저장 후 thumbnailData = print 썸네일이라 슬롯에 잘못 주입됨
   const sourceImage = node.generatedImageData ?? node.thumbnailData;
   // 수정 후 — generatedImageData만 사용 (저장 후 print 썸네일 오주입 방지)
   const sourceImage = node.generatedImageData;
   ```

**⚠️ 아키텍처 한계 (print 팀 협업 필요)**:

| 케이스 | canvas-side 수정 후 동작 |
|--------|------------------------|
| canvas 이미지 아트보드 → print 노드 (`thumbnailData` 있음) | 저장 전 원본 이미지가 `generatedImageData`에 보존 → 재진입 시 슬롯에 원본 표시 ✓ |
| fresh print 노드 (blank → print, 사용자가 직접 업로드) | `File[]` 객체는 패키지 로컬 상태에만 존재 → 닫는 순간 소멸 → 재진입 시 슬롯 빈 상태 ✗ |

**fresh 노드 슬롯 복원을 위해 print 패키지 업데이트 필요**:
- `PrintExpandedViewProps`에 `onCurrentImagesChange?: (images: SelectedImage[]) => void` 콜백 추가
- `Print_ExpandedView.tsx`에서 `images` state 변경 시 이 콜백 호출
- Canvas에서 수신 → `CanvasNode.generatedImageData`에 저장 → 재진입 시 `selectedImages`로 주입

---

### 버그 ❷ — Canvas 카드에 print 썸네일이 깨져서 표시됨

**증상**: SAVE 후 Canvas 화면으로 돌아오면 Print 노드 카드의 썸네일이 심하게 깨져(픽셀화) 보임.

**원인 추적**:

```
generateThumbnail() 반환값:
  = thumbCanvas.toDataURL('image/jpeg', 0.65)
  = "data:image/jpeg;base64,/9j/4AA..."   ← 완전한 data URL

handleGeneratePrintComplete:
  thumbnailData = "data:image/jpeg;base64,..."  ← 완전한 data URL 저장됨

NodeCard.tsx hasThumbnail 브랜치 (line ~278):
  <img src={`data:image/png;base64,${node.thumbnailData}`} />
  = <img src="data:image/png;base64,data:image/jpeg;base64,/9j/4AA..." />  ← ❌ 이중 중첩!
```

**결론**: `NodeCard.tsx`의 `hasThumbnail` 브랜치가 `thumbnailData`를 항상 raw base64로 가정하고 `data:image/png;base64,` prefix를 덧붙임. 그러나 print thumbnail은 이미 완전한 data URL이므로 이중 중첩이 발생해 이미지 로드 실패 또는 깨진 표시.

> `artboardType === 'image'` 브랜치(line 263~270)에는 이미 `startsWith('data:')` 체크가 있으나, `hasThumbnail` 브랜치(print/planners용)에는 없어서 발생하는 불일치.

**부차적 원인**: `generateThumbnail`의 출력 해상도가 320×240 (65% JPEG)으로 고정되어 있어 Retina 환경에서 흐리게 보일 수 있음. 이 부분은 print 패키지(`thumbnailUtils.ts`) 내부이므로 현재 Sprint에서는 data URL 버그만 수정.

**수정 파일 1개**:

**`project_canvas/components/NodeCard.tsx`** — `hasThumbnail` 브랜치 (line ~278):
```typescript
// 수정 전
src={`data:image/png;base64,${node.thumbnailData}`}

// 수정 후 — data URL 중복 방지 (artboardType=image 브랜치와 동일한 처리)
src={node.thumbnailData.startsWith('data:') ? node.thumbnailData : `data:image/png;base64,${node.thumbnailData}`}
```

---

### Phase 10 — 버그 수정 (즉시 가능)

- [x] `project_canvas/app/page.tsx` `handleGeneratePrintComplete`: `generatedImageData` 업데이트 제거
- [x] `project_canvas/print/ExpandedView.tsx` `sourceImage`: `thumbnailData` fallback 제거
- [x] `project_canvas/components/NodeCard.tsx` `hasThumbnail` 브랜치: `startsWith('data:')` 체크 추가
- [ ] 수정 후 테스트:
  - GENERATE → SAVE → Canvas 복귀 → 썸네일 정상 표시 확인
  - Print 노드 재진입 → 이미지 슬롯에 print 썸네일 미표시 확인

---

## 6. 관련 파일 목록

| 파일 | 현재 상태 | 조치 | Phase |
|------|----------|------|-------|
| `project_canvas/.env.local.example` | 항목 누락 | **업데이트 완료** | 1 |
| `project_canvas/.npmrc` | 없음 | **생성 완료** | 2 |
| `project_canvas/next.config.ts` | `transpilePackages`, webpack alias 없음 | **업데이트 완료** | 3 |
| `project_canvas/app/api/print-proxy/api/print/route.ts` | 없음 | **생성 완료** ✅ | 4 |
| `project_canvas/app/api/print-proxy/[...path]/route.ts` | 개방형 프록시 | **제거 완료** ✅ | 4 |
| `project_canvas/app/layout.tsx` | `print-tokens.css` 미import | 패키지 설치 후 업데이트 | 5 |
| `project_canvas/print/ExpandedView.tsx` | 자체 구현 (API 불일치) | 패키지 설치 후 교체 | 6 |
| `project_canvas/package.json` | `@cai-crete/print-components` 없음 | 패키지 설치 시 자동 업데이트 | 7 |
| `project_canvas/.env.local` | `PRINT_API_URL`, `CANVAS_API_SECRET` 없음 | Phase 0 완료 후 수동 추가 | 1 |
| `project_canvas/app/page.tsx` | `generatedImageData` 잘못 덮어씀 | Phase 10에서 수정 | 10 |
| `project_canvas/print/ExpandedView.tsx` | `thumbnailData` fallback 제거 필요 | Phase 10에서 수정 | 10 |
| `project_canvas/components/NodeCard.tsx` | data URL 이중 prefix 버그 | Phase 10에서 수정 | 10 |

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
