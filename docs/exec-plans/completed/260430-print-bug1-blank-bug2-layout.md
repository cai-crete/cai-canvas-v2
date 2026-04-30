
# 작업지시서: Print 버그 재발 분석 및 근본 수정 계획

**작성일**: 2026-04-30  
**상태**: 승인 대기  
**요청자**: bzoo@cre-te.com  
**분석 범위**: cai-harness-print (로컬) + @cai-crete/print-components (npm 패키지)

---

## 이전 수정의 한계

| 버그 | 이전 수정 내용 | 재발 이유 |
|------|----------------|-----------|
| Bug 1 | `htmlUtils.ts` regex → `\bpage\b` → `(?:[^"]*\s+)?page(?:\s+[^"]*)?` | Gemini가 내부 div에 `class="page desc-area"` 같이 "page"를 공백으로 구분된 첫 토큰으로 붙이면 여전히 오탐. 더 근본적으로: 중첩 div도 regex에 걸리면 별도 페이지로 추출하는 구조 자체가 문제 |
| Bug 2 | orientation 캐시 구조(`resultByOrientation`) + `triggerGenerate` | API 재호출 자체는 구현됐으나, AGENT-2 Phase 1/2 입력에 orientation이 빠져 있어 Gemini가 항상 landscape HTML을 생성 |

---

## Bug 1: REPORT 빈 더미 페이지

### 실제 근본 원인

`splitHtmlPages` → `pageRegex`로 HTML 전체를 스캔 → **중첩된 div도 매칭되면 별도 페이지로 추출**.

Gemini가 생성한 HTML에 아래처럼 실제 페이지 내부에 "page"가 포함된 클래스의 div가 있을 경우:

```html
<div class="page">              ← 실제 페이지 (정상 매칭)
  <div class="page desc-area"> ← 내부 div — "page"가 첫 토큰 → 오탐!
    설명 텍스트...
  </div>
</div>
```

현재 regex `(?:[^"]*\s+)?page(?:\s+[^"]*)?`는 `class="page desc-area"` 를 완전히 허용함.
결과: 내부 `<div class="page desc-area">` 에서 `extractBalancedDiv`가 설명 텍스트만 추출 → "직전 페이지 텍스트처럼 보이는 빈 페이지"로 표시됨.

### 수정 대안

#### 대안 A: regex 강화 — class 첫 토큰이 정확히 "page"일 때만 매칭

```typescript
// 수정 전
const pageRegex = /<div\s[^>]*class="(?:[^"]*\s+)?page(?:\s+[^"]*)?"[^>]*>/gi

// 수정 후 (대안 A)
const pageRegex = /<div\s[^>]*class="page(?:\s[^"]*)?"[^>]*>/gi
```

**매칭 결과**:

| class 값 | 결과 |
|----------|------|
| `class="page"` | ✅ |
| `class="page a0-landscape"` | ✅ |
| `class="page a0-portrait"` | ✅ |
| `class="page desc-area"` | ✅ — **여전히 오탐 가능** |
| `class="page-desc-area"` | ❌ |
| `class="editable page"` | ❌ |

**단점**: Gemini가 내부 div의 첫 클래스에 "page"를 붙이면 여전히 오탐.  
**장점**: 변경 규모 최소 (1줄). 이전 수정보다 범위를 줄임.

---

#### 대안 B: 순차 추출 — 중첩 매치 자동 제거 ✅ 권장

```typescript
// 현재: matches 배열의 모든 항목을 독립적으로 추출
for (let i = 0; i < matches.length; i++) {
  const pageBlock = extractBalancedDiv(html, matches[i].index)
  pages.push(...)
}

// 수정 후 (대안 B): 이미 추출된 범위 내 중첩 매치는 건너뜀
let nextAllowedIndex = 0
for (const match of matches) {
  if (match.index < nextAllowedIndex) continue  // 이전 페이지 내부 → 스킵
  const pageBlock = extractBalancedDiv(html, match.index)
  nextAllowedIndex = match.index + pageBlock.length   // 다음 허용 시작점 갱신
  const pageHtml = `<!DOCTYPE html>\n<html>\n${head}\n<body ...>\n${pageBlock}\n</body>\n</html>`
  pages.push(pageHtml)
}
```

**효과**: regex가 어떤 클래스를 매칭하든, 이미 추출된 페이지 div 내부에 있는 매치는 무조건 제거.  
**장점**: regex 패턴과 무관하게 작동 → Gemini의 어떤 클래스 조합에도 강건.  
**단점**: 변경 규모 소폭 증가 (loop 구조 변경 ~5줄).

---

#### 대안 C: 대안 A + 대안 B 복합 ✅ 가장 강건

regex를 대안 A로 좁히고 + 순차 추출(대안 B)로 중첩 방어.  
이중 방어 구조로 어떤 경우도 내부 div가 별도 페이지로 추출되지 않음.

---

### 수정 대상 파일 (Bug 1)

두 위치 동일하게 수정:
1. `cai-harness-print/project.10_print/lib/htmlUtils.ts` — `splitHtmlPages` 함수
2. `project_canvas/node_modules/@cai-crete/print-components/lib/htmlUtils.ts` — `splitHtmlPages` 함수

변경 규모: 각 파일 5~10줄 수정

---

## Bug 2: PANEL 방향 전환 시 레이아웃 여백 폭증

### 실제 근본 원인

#### 원인 1: AGENT-2에 orientation 미전달

`route.ts`의 AGENT-2 Phase 1 / Phase 2 호출부:

```typescript
// Phase 1 입력 (현재)
{ text: `[SCHEMA A]\n...\n\nMode: ${mode}, PageCount: ${pageCount ?? 'N/A'}${templatePart}` }
//                                        ↑ orientation 없음

// Phase 2 입력 (현재)  
{ text: `[SCHEMA A]\n...\n[SCHEMA B]\n...\n[SCHEMA C]\n...${templatePart}` }
//                                                          ↑ orientation 없음
```

AGENT-1에는 `Orientation: ${orientation}` 이 포함되어 있으나, AGENT-1의 Schema A 출력에는 orientation 필드가 없음.  
→ AGENT-2는 orientation을 알 수 없음 → 항상 landscape HTML 생성.

#### 원인 2: Panel 템플릿이 JavaScript 기반

`Panel_template.html`의 레이아웃 정보가 `<script>` 내 `pagesData` 배열에만 있음:

```javascript
const pagesData = [
  { type: "a0-landscape", cols: "373mm 373mm 181.5mm 181.5mm", rows: "75mm 45mm ...", html: `...` },
  { type: "a0-portrait",  cols: "repeat(4, 192.5mm)",          rows: "75mm 45mm ...", html: `...` },
];
```

Gemini는 `<script>` 무시 지시를 받으므로, 어떤 grid를 사용해야 하는지 파악하기 어려움.  
→ "추측으로" HTML 생성 → 잘못된 grid 치수 → 레이아웃 깨짐.

#### 결과: DocumentFrame 치수와 HTML 치수 불일치

```
portrait 요청 → triggerGenerate('PORTRAIT') → API 반환 HTML에 <div class="page a0-landscape"> (4494×3179px)
DocumentFrame(orientation='PORTRAIT') → iframe 크기 = 3179×4494px
→ landscape 콘텐츠(4494px wide)가 portrait iframe(3179px wide) 안에 → 우측이 잘림 or 여백 폭증
```

### 수정 대안

#### 대안 A: AGENT-2 Phase 1/2 입력에 orientation 추가 (최소 변경)

```typescript
// route.ts — Phase 1 입력 수정
{ text: `[SCHEMA A]\n...\n\nMode: ${mode}, Orientation: ${orientation}, PageCount: ${pageCount ?? 'N/A'}${templatePart}` }

// route.ts — Phase 2 입력 수정  
{ text: `[SCHEMA A]\n...\n[SCHEMA B]\n...\n[SCHEMA C]\n...\n\nMode: ${mode}, Orientation: ${orientation}${templatePart}` }
```

**효과**: AGENT-2 Phase 1이 `templateType: "panel-portrait"` 또는 `"panel-landscape"` 를 올바르게 출력 → Phase 2가 올바른 레이아웃 섹션 선택.  
**단점**: 템플릿이 JavaScript 기반이라 Gemini가 올바른 grid 치수를 선택할지 여전히 불확실.  
**변경 규모**: route.ts 2줄.

---

#### 대안 B: Panel 템플릿 분리 — 가로/세로 별도 정적 HTML 파일

`Panel_template.html`의 JavaScript 기반 레이아웃을 orientation별 정적 HTML로 분리:

```
sources/document_template/
  Panel_landscape_template.html  ← a0-landscape 정적 HTML
  Panel_portrait_template.html   ← a0-portrait 정적 HTML
```

각 파일은 Gemini가 직접 읽을 수 있는 정적 구조:

```html
<!-- Panel_landscape_template.html -->
<div class="page a0-landscape">
  <div class="grid-container" style="grid-template-columns: 373mm 373mm 181.5mm 181.5mm; grid-template-rows: 75mm 45mm 130mm 25mm 195mm 281mm; width:100%;height:100%;display:grid;gap:10mm;">
    <!-- 실제 슬롯 구조 -->
    <div class="img-box" style="grid-column: 1 / 3; grid-row: 1 / 6;">...</div>
    ...
  </div>
</div>
```

`loadTemplate(mode, orientation?)` 함수 수정:
```typescript
function loadTemplate(mode: PrintMode, orientation?: string): string {
  const filename = mode === 'PANEL'
    ? (orientation === 'PORTRAIT' ? 'Panel_portrait_template.html' : 'Panel_landscape_template.html')
    : TEMPLATE_FILES[mode]
  // ...
}
```

**효과**: Gemini가 명확한 정적 HTML 구조를 기반으로 생성 → grid 치수 오류 없음.  
**단점**: 템플릿 파일 2개 신규 생성 필요. `loadTemplate` 시그니처 변경 필요 (route.ts 1곳).  
**변경 규모**: 템플릿 파일 2개 + `prompt.ts` 10줄 + `route.ts` 3줄.

---

#### 대안 C: 대안 A + 대안 B 복합 ✅ 가장 안정적

orientation을 AGENT-2에 명시적으로 전달하면서, 동시에 올바른 정적 템플릿을 제공.  
이중 보장: "무엇을 만들어야 하는지" (orientation) + "어떻게 만들어야 하는지" (static template).

---

### 수정 대상 파일 (Bug 2)

| 파일 | 수정 내용 |
|------|----------|
| `cai-harness-print/project.10_print/app/api/print/route.ts` | AGENT-2 Phase 1/2 입력에 orientation 추가 (대안 A) |
| `cai-harness-print/project.10_print/lib/prompt.ts` | `loadTemplate` orientation 파라미터 추가 (대안 B) |
| `cai-harness-print/project.10_print/sources/document_template/Panel_landscape_template.html` | 신규 생성 (대안 B) |
| `cai-harness-print/project.10_print/sources/document_template/Panel_portrait_template.html` | 신규 생성 (대안 B) |

---

## 권장 수정 방향 요약

| | 대안 | 변경 규모 | 안정성 | 권장 |
|-|------|-----------|--------|------|
| **Bug 1** | A (regex만) | 최소 | 보통 | |
| **Bug 1** | B (순차 추출) | 소 | 높음 | ✅ |
| **Bug 1** | C (A+B) | 소 | 최고 | ✅✅ |
| **Bug 2** | A (orientation 전달만) | 최소 | 보통 | |
| **Bug 2** | B (템플릿 분리만) | 중 | 높음 | ✅ |
| **Bug 2** | C (A+B) | 중 | 최고 | ✅✅ |

---

## 완료 기준

- [ ] REPORT 6장 생성 시 표지+목차+내지 6장 = 총 8페이지 (빈 더미 페이지 없음)
- [ ] PANEL LANDSCAPE 생성 후 PORTRAIT 전환 시 portrait 레이아웃 (grid 치수 정확) 으로 표시됨
- [ ] PANEL PORTRAIT 생성 후 LANDSCAPE 전환 시 landscape 레이아웃으로 표시됨
- [ ] 전환 시 여백 폭증 없음
- [ ] REPORT 모드 회귀 없음

---

## 승인 후 구현 계획 (대안 C 선택 시)

**Phase 1** — Bug 1: `htmlUtils.ts` regex 강화 + 순차 추출 구조로 전환 (2곳)  
**Phase 2** — Bug 2-A: `route.ts` AGENT-2 Phase 1/2 입력에 orientation 추가  
**Phase 3** — Bug 2-B: `Panel_landscape_template.html`, `Panel_portrait_template.html` 생성, `prompt.ts` 수정  
**Phase 4** — 테스트: REPORT 8페이지 확인, PANEL landscape/portrait 레이아웃 확인

승인 전 구현하지 않습니다.
