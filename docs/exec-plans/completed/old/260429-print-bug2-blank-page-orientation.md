
# 작업지시서: Print 버그 2종 분석 및 수정 계획

**작성일**: 2026-04-29  
**상태**: 승인 대기  
**요청자**: bzoo@cre-te.com  
**분석 범위**: cai-print-v3 (GitHub) + cai-harness-print (로컬) + @cai-crete/print-components (npm 패키지)

---

## 보고된 문제

| # | 모드 | 증상 |
|---|------|------|
| 1 | REPORT | 6장 선택 시 내용은 6장이나, 내지(표지·목차 제외) 각 페이지 뒤에 "직전 페이지 텍스트를 복사한 흰색 빈 페이지"가 추가 생성됨 |
| 2 | PANEL | 가로 생성 후 세로 전환(또는 반대)해도 대지 비율만 바뀌고 내부 레이아웃이 재배치되지 않아 내용이 잘림 |

---

## 버그 1: Report 빈 페이지 삽입

### 근본 원인

**파일**: `project.10_print/lib/htmlUtils.ts` — line 36

```typescript
// 현재 코드 (버그)
const pageRegex = /<div\s[^>]*class="[^"]*\bpage\b[^"]*"[^>]*>/gi
```

이 정규식은 class 속성에 `page`가 **단어 경계(word boundary)** 내에 있으면 모두 매칭한다.  
`\b`(word boundary)는 `-`(하이픈)도 비단어 문자로 처리하므로, **`class="page-desc-area"`도 매칭된다.**

#### 오탐 발생 경로

`Report_template.html`의 각 내지 페이지에는 다음 구조가 반복된다:

```html
<div class="page">                    ← 정상 매칭 (실제 페이지 div)
  ...
  <div class="page-desc-area" ...>   ← 오탐 매칭 (page-desc-area의 "page"가 \b에 걸림)
    페이지 설명 텍스트
  </div>
  ...
</div>
```

결과적으로 내지 6페이지에 대해:
- 실제 페이지 div: 6개 매칭 → 6개 정상 페이지
- `page-desc-area` div: 6개 오탐 → 6개 가짜 페이지 (설명 텍스트만 있는 거의 빈 페이지)

사용자는 "직전 페이지의 글" 처럼 보이는 이유: 가짜 페이지에 담긴 내용이 직전 실제 페이지의 설명 영역 텍스트이기 때문.

표지·목차에는 `page-desc-area` 클래스가 없어 오탐이 발생하지 않음 → 증상과 일치.

### 수정 방안

`page`가 **클래스 토큰으로서 정확히 독립적으로 존재**하는 div만 매칭하도록 정규식 강화.  
클래스 값에서 `page`는 반드시 앞에 시작 또는 공백, 뒤에 끝 또는 공백이 있어야 함.

```typescript
// 수정 후
const pageRegex = /<div\s[^>]*class="(?:[^"]*\s+)?page(?:\s+[^"]*)?"[^>]*>/gi
```

매칭 검증:

| 클래스 값 | 결과 |
|-----------|------|
| `class="page"` | ✅ 매칭 |
| `class="page a0-landscape"` | ✅ 매칭 |
| `class="cover page"` | ✅ 매칭 |
| `class="page-desc-area"` | ❌ 미매칭 (수정됨) |
| `class="inner-page-header"` | ❌ 미매칭 (수정됨) |
| `class="a0-page"` | ❌ 미매칭 (수정됨) |

### 수정 대상 파일

1. **`cai-print-v3` 레포** (소스 원본): `project.10_print/lib/htmlUtils.ts` — line 36
2. **`cai-harness-print` 로컬**: `project.10_print/lib/htmlUtils.ts` — line 36  
3. **npm 패키지 패치**: `project_canvas/node_modules/@cai-crete/print-components/lib/htmlUtils.ts` — line 36

> 변경 규모: 1줄 수정

---

## 버그 2: Panel 방향 전환 시 레이아웃 미재배치

### 근본 원인

**2개의 독립적 원인이 결합된 문제**

#### 원인 A: orientation이 API 요청에 전달되지 않음

`Print_ExpandedView.tsx`의 생성 함수:

```typescript
const data = await callPrintApi(
  apiBaseUrl, mode, images, videoStartImage, videoEndImage, prompt, pageCount
  // ↑ orientation이 빠져 있음
)
```

Gemini는 orientation 정보 없이 HTML을 생성한다. Panel_template.html에는 `a0-landscape` 레이아웃과 `a0-portrait` 레이아웃이 모두 정의되어 있으나, Gemini는 어느 쪽을 사용할지 프롬프트로 지시받지 못한다 → 항상 기본값(LANDSCAPE) 레이아웃으로 생성됨.

#### 원인 B: orientation 전환 시 재생성 트리거 없음

```typescript
// 현재: 상태 변경만 됨
onOrientationChange={setOrientation}
```

orientation 변경 시 `DocumentFrame`의 `w, h`만 바뀌고(4494×3179 ↔ 3179×4494), iframe 내부 HTML은 최초 생성된 LANDSCAPE 레이아웃 그대로 유지된다.

Panel의 HTML 구조:
```html
<!-- LANDSCAPE 생성 시 고정된 그리드 -->
<div class="page a0-landscape">
  <div class="grid-container" style="grid-template-columns: 373mm 373mm 181.5mm 181.5mm; ...">
```

CSS 클래스(`.a0-landscape`)와 grid 치수가 HTML에 고정되어 있으므로, `DocumentFrame`이 외부 치수를 바꾸는 것만으로는 내부 레이아웃이 재배치되지 않는다.

### 수정 방안

#### 전략: Orientation별 결과 캐시 + savedState 포함

orientation마다 생성 결과를 별도로 저장하고, Canvas 저장 시 양쪽 결과를 모두 포함한다.  
재진입 시 두 orientation 모두 즉시 전환 가능하며, Generate(재생성) 시에만 캐시를 초기화한다.

```
[LANDSCAPE 생성] → resultByOrientation.LANDSCAPE = data1
→ PORTRAIT 전환 → 캐시 없음 → API 호출 → resultByOrientation.PORTRAIT = data2
→ LANDSCAPE 전환 → 캐시 있음 → 즉시 표시 (API 없음)
→ [저장] → savedState = { resultByOrientation: { LANDSCAPE: data1, PORTRAIT: data2 }, ... }
→ [Canvas 재진입] → 두 orientation 모두 복원됨 → 즉시 전환 가능

[재생성(이미지·프롬프트 변경)] → resultByOrientation = {} (전체 초기화) → 현재 orientation만 생성
```

#### Step 1: orientation을 API 요청에 추가

`callPrintApi` 함수 시그니처에 `orientation` 파라미터 추가, API route에서 FormData로 수신 후 프롬프트/템플릿 선택에 반영.

```typescript
// Print_ExpandedView.tsx — callPrintApi 호출부
const data = await callPrintApi(
  apiBaseUrl, mode, images, videoStartImage, videoEndImage, prompt, pageCount, orientation
  //                                                                           ↑ 추가
)

// route.ts — FormData 수신
const orientationRaw = formData.get('orientation') as string | null
const orientation = orientationRaw === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE'
```

프롬프트 또는 템플릿 선택 로직에서 orientation에 따라 `a0-landscape` / `a0-portrait` 레이아웃을 지정.

#### Step 2: resultByOrientation 상태 구조 도입

```typescript
// 현재: result 단일 상태
const [result, setResult] = useState<PrintResult | null>(null)

// 수정 후: orientation별 캐시
const [resultByOrientation, setResultByOrientation] = useState<{
  LANDSCAPE?: PrintResult
  PORTRAIT?: PrintResult
}>({
  LANDSCAPE: savedState?.resultByOrientation?.LANDSCAPE,
  PORTRAIT:  savedState?.resultByOrientation?.PORTRAIT,
})

// 현재 orientation에 해당하는 result (기존 result 참조부 하위호환)
const result = resultByOrientation[orientation] ?? null
```

#### Step 3: Generate 핸들러 — 캐시 초기화 후 현재 orientation 생성

```typescript
const handleGenerate = useCallback(async () => {
  // ...기존 검증 로직...
  setIsGenerating(true)
  setResultByOrientation({})          // 전체 캐시 초기화
  try {
    const data = await callPrintApi(..., orientation)
    setResultByOrientation({ [orientation]: data })
    // 히스토리는 현재 orientation 결과만 기록
  } finally {
    setIsGenerating(false)
  }
}, [..., orientation])
```

#### Step 4: orientation 변경 핸들러 — 캐시 히트 시 즉시, 미스 시 생성

```typescript
const handleOrientationChange = useCallback((newOrientation: PanelOrientation) => {
  setOrientation(newOrientation)
  if (mode === 'PANEL' && !resultByOrientation[newOrientation]) {
    // 해당 orientation 캐시 없을 때만 생성
    triggerGenerate(newOrientation)
  }
  // 캐시 있으면 setOrientation만으로 즉시 전환됨
}, [mode, resultByOrientation])
```

`triggerGenerate(targetOrientation)`: `handleGenerate` 내부 로직을 orientation 인수를 받도록 분리.  
캐시 초기화 없이 `resultByOrientation[targetOrientation]`만 업데이트.

#### Step 5: savedState에 resultByOrientation 포함

```typescript
// handleSave
onPrintNodeUpdate?.({
  printSavedState: {
    resultByOrientation,   // ← 추가 (LANDSCAPE/PORTRAIT 양쪽 포함)
    mode,
    orientation,           // 마지막으로 선택된 orientation
    prompt,
    pageCount,
    // ...기존 필드
  }
})
```

```typescript
// 초기화 (savedState 복원)
const [resultByOrientation, setResultByOrientation] = useState({
  LANDSCAPE: savedState?.resultByOrientation?.LANDSCAPE,
  PORTRAIT:  savedState?.resultByOrientation?.PORTRAIT,
})
```

#### UX 동작 정리

| 상황 | 동작 |
|------|------|
| orientation 전환 — 캐시 있음 | 즉시 전환, API 호출 없음 |
| orientation 전환 — 캐시 없음 | 로딩 표시 후 생성, 완료 시 전환 |
| Generate(재생성) | 전체 캐시 초기화 → 현재 orientation만 생성 |
| Canvas 저장 | resultByOrientation 전체(두 orientation 모두) 포함 |
| Canvas 재진입 | savedState에서 두 orientation 복원 → 즉시 전환 가능 |

### 수정 대상 파일

**`cai-print-v3` 레포 / `cai-harness-print` 로컬:**

1. `project.10_print/components/Print_ExpandedView.tsx`  
   — `result` → `resultByOrientation` 상태 구조 변경  
   — `handleGenerate`: 캐시 초기화 + orientation 파라미터 전달  
   — `handleOrientationChange`: 캐시 히트/미스 분기  
   — `handleSave`: `resultByOrientation` 포함

2. `project.10_print/app/api/print/route.ts`  
   — FormData에서 orientation 파라미터 수신  
   — 프롬프트/템플릿 지시에 orientation 반영

3. `project.10_print/lib/types.ts` (또는 해당 타입 파일)  
   — `PrintSavedState` 타입에 `resultByOrientation` 필드 추가

**npm 패키지 패치 (canvas 연동용):**

4. `project_canvas/node_modules/@cai-crete/print-components/components/Print_ExpandedView.tsx`
5. `project_canvas/node_modules/@cai-crete/print-components/lib/types.ts`

> 변경 규모: Print_ExpandedView.tsx 약 40줄, route.ts ~5줄, types.ts ~5줄

---

## 수정 순서 및 범위 요약

| 순서 | 버그 | 파일 | 변경 규모 | 비고 |
|------|------|------|-----------|------|
| 1 | Bug 1 | `htmlUtils.ts` × 3곳 | 1줄 | 동일 수정 3회 적용 |
| 2 | Bug 2 - Step 1 | `route.ts` × 2곳 | ~5줄 | API 파라미터 추가 |
| 3 | Bug 2 - Step 2 | `types.ts` × 2곳 | ~5줄 | PrintSavedState 타입 확장 |
| 4 | Bug 2 - Step 3 | `Print_ExpandedView.tsx` × 2곳 | ~40줄 | resultByOrientation 캐시 구조 + 핸들러 |

---

## 완료 기준

- [ ] REPORT 6장 생성 시 표지+목차+내지 6장 = 총 8페이지만 생성됨 (가짜 페이지 없음)
- [ ] PANEL LANDSCAPE 생성 후 PORTRAIT 전환 시 API 호출 → PORTRAIT 레이아웃으로 표시됨
- [ ] PANEL PORTRAIT 생성 후 LANDSCAPE 전환 시 캐시 있으면 즉시 전환 (API 호출 없음)
- [ ] orientation 전환 중 로딩 인디케이터 표시됨 (캐시 미스 시)
- [ ] Canvas 저장 후 재진입 시 두 orientation 모두 복원됨 (즉시 전환 가능)
- [ ] Generate(재생성) 시 캐시 초기화 → 현재 orientation만 새로 생성됨
- [ ] REPORT 모드에서 orientation 캐시 로직 미적용 (PANEL 전용)
- [ ] 기존 REPORT/PANEL 단순 생성 플로우 회귀 없음

---

## 승인 후 구현 계획

**Phase 1** — Bug 1: `htmlUtils.ts` 정규식 수정 (1줄, 3곳)  
**Phase 2** — Bug 2: `route.ts` orientation 파라미터 수신  
**Phase 3** — Bug 2: `types.ts` PrintSavedState에 `resultByOrientation` 필드 추가  
**Phase 4** — Bug 2: `Print_ExpandedView.tsx` resultByOrientation 캐시 구조 전환 + 핸들러 재작성  

승인 전 구현하지 않습니다.
