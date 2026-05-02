# 작업지시서: Print PANEL·REPORT 5건 버그 수정 계획

**작성일**: 2026-04-30  
**상태**: 승인 대기  
**선행 작업**: `docs/exec-plans/completed/260430-print-dynamic-flex-layout.md`  

---

## 버그 목록 및 우선순위

| # | 모드 | 문제 | 심각도 | 우선순위 |
|---|------|------|--------|----------|
| **R2** | REPORT | 더미 빈 페이지 생성 (내지 2배) | 🔴 Critical | **1순위** |
| **R1** | REPORT | 목차 내용 누락 ("서론"만 출력) | 🟠 High | 2순위 |
| **P1** | PANEL | 이미지 크기 과대 + 하단 잘림 | 🟠 High | 3순위 |
| **P2** | PANEL | Landscape↔Portrait 비연동 | 🟡 Medium | 4순위 |
| **P3** | PANEL | 프리뷰바 페이지수 6장 오류 표시 | 🟡 Medium | 5순위 |

---

## 1. 근본 원인 분석

### R2. REPORT 더미 빈 페이지 생성 (🔴 1순위)

**증상**: 4장 설정 → 표지 1 + 목차 1 + 내지 2 예상 → 실제로 표지 1 + 목차 1 + 내지 4장(더미 2장 포함) 출력

**원인 경로**:

1. **AI(AGENT-2)가 `<script>` 블록을 실행하지 않고 복사함**  
   - `Report_template.html` 109~128행의 내지 페이지들은 `<script>document.write(...)` 로 동적 생성
   - AI(Gemini)는 이 `<script>` 블록을 **실행하지 않고 텍스트로 복사** → 동시에 정적 HTML도 별도 생성 → **이중 출력**

2. **`splitHtmlPages()` 파서가 중복 page div를 모두 독립 페이지로 인식**  
   - `htmlUtils.ts` 의 `splitHtmlPages()`는 `<div class="page"` 패턴을 정규식으로 탐색
   - script 내부 문자열도 매칭되어 빈 페이지로 분리됨

3. **프롬프트에 "script 태그를 제거하고 정적 HTML만 출력하라"는 지시가 없음**

**해결 방안**:

| 방안 | 설명 | 위험성 | 판정 |
|------|------|--------|------|
| **A** | Report_template.html에서 `<script>document.write()`를 **정적 HTML로 변환** + 프롬프트 지시 강화 | 낮음 | ✅ **채택** |
| B | `splitHtmlPages()`에서 빈 내용 페이지 필터링 | 높음 — 더미 페이지에 텍스트가 포함되어 필터링 불가 + 자동 삭제는 정상 페이지 훼손 위험 | ❌ 불채택 |
| C | 프롬프트만 수정 | 높음 — AI가 100% 따르지 않을 수 있음 | ❌ 불채택 |

> **방안 A 단독 채택** — 템플릿 정적 변환으로 이중 생성의 구조적 원인을 제거하여 근본 해결

---

### R1. REPORT 목차 내용 누락

**증상**: 목차 페이지에 "서론"이라고만 출력

**원인**:
- 98~106행의 목차 항목도 `<script>for` 루프 → AI가 실행 못함 → 빈 목차 인식 → placeholder만 출력
- AGENT-2 Phase 2에서 목차 슬롯에 텍스트 바인딩하는 명시적 규칙 부재

**해결 방안**: R2와 함께 Report_template.html 정적 변환 + 프롬프트에 목차↔내지 연동 지시 추가

---

### P1. PANEL 이미지 크기 과대 + 하단 잘림

**증상**: 이미지 2장인데 둘 다 크게 들어가며 아래 이미지 잘림

**원인**:
- Flexbox 템플릿의 img-box가 고정 개수(landscape 5개, portrait 7개)로 하드코딩
- 이미지 2장 시 AI가 5개 슬롯 유지하면서 2장을 크게 넣어 overflow 발생
- 프롬프트의 "유동적 조립" 지시에 구체적인 flex 비율/overflow 규칙 부재

**해결 방안**: 템플릿에 N장별 분기 가이드 명시 + overflow 방어선 추가

---

### P2. Landscape↔Portrait 비연동

**원인**: 양 방향 템플릿이 완전히 독립적 구조. 방향 전환 시 별도 API 호출로 완전히 새로운 HTML 생성

**해결 방안**: 양 방향 템플릿의 이미지-텍스트 비율 통일 + 프롬프트 제약 추가

---

### P3. 프리뷰바 페이지수 6장 오류 표시

**원인**:
- savedState 복원 시 이전 mode의 pageCount(6=REPORT 기본값)가 유지됨
- handleModeChange에서 mode별 pageCount를 설정하지만, savedState 복원 시 이 로직 미경유
- PANEL/REPORT 모두 사용자가 자유롭게 장수를 선택할 수 있으므로 특정 값으로 강제하면 안 됨

**해결 방안**: savedState 복원 시 저장된 pageCount를 함께 복원. savedState에 pageCount가 없으면 mode 기반 기본값 적용(REPORT=6, DRAWING=1, 그 외=사용자 설정 유지). DRAWING만 1장 강제.

---

## 2. 수정 대상 파일 맵

| 파일 | 위치 | 수정 내용 | 관련 버그 |
|------|------|-----------|-----------|
| `Report_template.html` | `sources/document_template/` | script→정적 HTML 변환 | R1, R2 |
| `route.ts` | `app/api/print/` | REPORT/PANEL 프롬프트 지시 강화 | R1, R2, P1 |
| `Panel_landscape_template.html` | `sources/document_template/` | N장 기반 분기 구조 + overflow 방어 | P1, P2 |
| `Panel_portrait_template.html` | `sources/document_template/` | N장 기반 분기 구조 + overflow 방어 | P1, P2 |
| `Print_ExpandedView.tsx` | `components/` | savedState 복원 시 pageCount 보정 | P3 |

> **프로토콜 충돌**: 없음. `ai_generation_protocol-v4.0.md` 자체는 수정하지 않음. `route.ts`의 `templateInstruction`(User Input 계층)으로 지시 보강하므로 프로토콜 위에서 안전하게 동작.

---

## 3. 실행 계획 (3단계)

### Phase 1 — REPORT 더미 페이지 근절 (R2 + R1) ⏱ 1세션

> **최우선. Report 관련 2건을 묶어 처리**

1. **Report_template.html 정적 변환**
   - 109~128행 `<script>document.write(...)` 내지 → 정적 `<div class="page">` 2개로 변환
   - 98~106행 목차 `<script>for` → 정적 HTML 6개 항목으로 변환
   - 181~207행 이미지업로드/텍스트리밋 script 유지 (AI에게 "이 script는 무시" 지시)

2. **route.ts REPORT 프롬프트 강화**
   - "totalPages = PageCount와 정확히 일치. 표지 1 + 목차 1 + 내지 (PageCount-2)장"
   - "목차 챕터 제목은 내지 page-title과 1:1 매핑"
   - "빈 페이지/더미 페이지 생성 절대 금지"
   - "PageCount가 템플릿 내지 수보다 많을 경우, 기존 `.page` 구조를 복제하여 확장하되 Header/Sub-header/Description 구조는 유지하라"

**검증**: REPORT 4장 → 표지 1 + 목차 1 + 내지 2 = 정확히 4장

---

### Phase 2 — PANEL 이미지 배치 정상화 (P1 + P2) ⏱ 1세션

1. **Panel_landscape_template.html 재설계**
   - N=1~2: hero 영역만, `flex: 1` 균등 분배
   - N=3~4: hero 1 + sub 나머지, `flex: 2`/`flex: 1`
   - 모든 img-box에 `overflow: hidden; object-fit: cover` 보장

2. **Panel_portrait_template.html 동기화**
   - landscape와 동일한 N장 기반 분기 구조 적용

3. **route.ts PANEL 프롬프트 강화**
   - "이미지 N장에 정확히 맞춰 img-box 개수 조절. 남는 슬롯 생성 금지"
   - "모든 이미지는 overflow:hidden + object-fit:cover"

**검증**: 이미지 2장 → landscape/portrait 각각 잘림 없이 배치

---

### Phase 3 — 프리뷰바 페이지수 정상화 (P3) ⏱ 0.5세션

1. **Print_ExpandedView.tsx** savedState 복원 시 저장된 pageCount를 함께 복원 (savedState에 pageCount 필드 추가 저장/로드)
2. **Print_ExpandedView.tsx** savedState에 pageCount가 없는 레거시 데이터의 경우 mode 기반 기본값 적용 (REPORT=6, DRAWING=1, PANEL/VIDEO=사용자 설정 유지)
3. **DRAWING만 1장 강제** — PANEL·REPORT는 사용자 설정 자유

**검증**: PANEL 3장 생성 → 나갔다 들어오기 → 프리뷰바 3장, 사이드바 3장 정상 유지

---

## 4. 위험성 평가

| 위험 | 영향도 | 완화 방안 |
|------|--------|-----------|
| Report_template.html 정적 변환 시 기존 브라우저 뷰어 깨짐 | 낮음 | AI 프롬프트 용도이므로 브라우저 단독 뷰어 미사용 |
| 프롬프트 강화 후에도 AI가 PageCount를 미준수할 가능성 | 중간 | 템플릿 정적 변환으로 이중 생성 구조적 원인 제거가 근본 방어. 프롬프트 강화는 추가 방어선 |
| PANEL 템플릿 변경 시 savedState 비호환 | 낮음 | savedState는 생성된 HTML 저장이므로 템플릿 변경 무관 |
| 대형 리포트(10장+) 요청 시 AI가 정적 템플릿을 확장하지 못함 | 낮음 | 프롬프트에 ".page 구조 복제 확장" 지시 명시 |

---

## 5. 타 개발자 피드백 반영 내역

| # | 피드백 | 반영 | 사유 |
|---|--------|------|------|
| 1 | splitHtmlPages 필터링 시 이미지 전용 페이지 오삭제 방지 | 🚫 불필요 | 방안 B(필터링) 자체를 불채택하였으므로 해당 없음 |
| 2 | 템플릿 정적화 후 대형 리포트 확장 지시 추가 | ✅ 반영 | Phase 1 route.ts 프롬프트에 `.page 구조 복제 확장` 지시 추가 |
| 3 | P2 context 데이터 정형화 강제 | 🚫 불필요 | 이미 Schema A로 동일 인덱스 공유. 근본 원인은 템플릿 비율 차이이며 Phase 2에서 해결 |
