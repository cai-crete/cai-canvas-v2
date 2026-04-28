# Fix: Planners 기획서 영어 출력 및 토론 형식 이슈

- 상태: **✅ 완료**
- 날짜: 2026-04-27

---

## 대상 파일

| 파일 | 프로젝트 | 변경 유형 |
|------|---------|----------|
| `api/planners.ts` | `Planners_harness\N01.Planners` (백엔드) | 핵심 수정 |
| `planners/PlannersPanel.tsx` | `cai-canvas-v2-main` (프론트엔드) | 정규식 4줄 수정 |

---

## 결정 사항

| # | 질문 | ��정 |
|---|------|------|
| 1 | 프로토콜 섹션 제목 한국어화 방식 | **(A)** 프로토콜 한국어 + 프론트엔드 정규식도 한국어 매칭으로 변경 |
| 2 | 모드 분석 추가 API 호출 (1~2초 지연) | 허용 |
| 3 | `_protocols.ts` 동기화 | 인라인 수정만 (프로토콜을 이 APP으로 가져오지 않음) |
| 4 | 배포 | 별도 진행 (사용자가 직접) |

---

## 작업 목록

### 작업 1: 프로토콜 한국어 강제 규칙 추가 (백엔드 `planners.ts`)
- `PLANNER_PROTOCOL` 상수 수정:
  - 최상단에 "⚠️ 언어 규칙" 섹션 추가: "모든 출력은 반드시 한국어로 작성"
  - `[[FINAL_PLAN]]` 섹션 제목 한국어화:
    - `### Final Output: 통합 전략 기획서` → `### 통합 전략 기획서`
    - `### Metacognitive Definition` → `### 메타인지 정의`
    - `### Workflow Simulation Log` → `### 워크플로우 시뮬레이션 로그`
    - `### Metacognitive Transparency Report` → `### 메타인지 투명성 보고서`
  - Layer 0 (불문율)에 "한국어 출력 절대 준수" 항목 추가
  - "사실 기반 토론" 규칙 추가: 안건에 언급되지 않은 내용을 가정/추측 금지

### 작업 2: 14인 전문가 프로필 데이터 주입 (백엔드 `planners.ts`)
- 새 상수 `EXPERT_PROFILES` 추가
- 소스: `experts.ts` (T01~T08, P01~P06) — `id`, `name`, `description`, `keywords` 포함
- `AVAILABLE_PROFILES` 플레이스홀더에 주입

### 작업 3: 모드�� 시너지 랭킹 데이터 주입 (백엔드 `planners.ts`)
- 새 상수 `SYNERGY_DATA: Record<'A'|'B'|'C', { label, trios, pairs }>`
- 소스: `Protocol/SQUAD_SYNERGY_RANKING.md`
- 모드 분석 결과에 따라 동적 선택하여 `OPTIMAL_TRIOS`, `SYNERGY_PAIRS` 플레이스홀더에 주입

### 작업 4: `relevantLaws` 수신 및 프로토콜 주입 (백엔드 `planners.ts`)
- `const { userInput }` → `const { userInput, relevantLaws }`
- `RELEVANT_LAWS` 플레이스홀더에 `relevantLaws || '(관련 법령 정보 없음)'` 주입

### 작업 5: 모드 분석(A/B/C) 사전 호출 추가 (백엔드 `planners.ts`)
- `analyzeMode()` 함수 신규 추가
- 소스: `Protocol/protocol-mode-analyzer.txt`
- Gemini API 1회 추가 호출 (temperature: 0.1) → 'A'/'B'/'C' 반환
- 실패 시 기본값 'B' (논리 심화)

### 작업 6: `[[SQUAD]]` 파싱 → expertId 할당 (백엔드 `planners.ts`)
- `parseSquadIds()` 유틸리티 신규 추가
- 응답 첫 줄 `[[SQUAD]] T01, T05, P02, T08`에서 ID 추출
- 할당 순서: [0]=thesis, [1]=antithesis, [2]=synthesis, [3]=support

### 작업 7: 누락 태그 추출 및 완전한 응답 구조 반환 (백엔드 `planners.ts`)
- 추가 추출: `METAC_DEF`, `CITED_LAWS`, `SUMMARY`, `KEYWORDS`
- 추가 유틸리티:
  - `parseCitedLaws()`: `N. [출처] 법령명 — 이유` → `{ id, source, lawName, reason }[]`
  - `convertCiteMarkers()`: `[[CITE:N]]` → `[CITE_REF:N]` (프론트엔드 호환)
- 완전한 응답 구조:
  ```
  { turn, metacognitiveDefinition, thesis, antithesis, synthesis, support,
    finalOutput, shortFinalOutput, workflowSimulationLog,
    citedLaws, parsedCitations, aggregatedKeywords }
  ```

### 작업 8: CORS 허용 오리진 추가 (백엔드 `planners.ts`)
- `https://cai-canvas-v2.vercel.app` 추가

### 작업 9: 프론트엔드 정규식 한국어 매칭 (프론트엔드 `PlannersPanel.tsx`)
- `reorderLegacyFinalOutput()` 함수 (237~254행) 수정:
  - `Final Output` → `통합 전략 기획서` (영어도 병행 매칭 유지)
  - `Metacognitive Definition` → `메타인지 정의`
  - `Workflow Simulation Log` → `워크플로우 시뮬레이션 로그`
  - `Metacognitive Transparency Report` → `메타인지 투명성 보고서`
- 기존 영어 매칭도 OR로 유지하여 레거시 호환

---

## 체크리스트

- [x] 작업 1: 프로토콜 한국어 강제 + 섹션 제목 한국어화 + 사실 기반 토론 규칙
- [x] 작업 2: 14인 전문가 프로필 상수
- [x] 작업 3: 모드별 시너지 랭킹 상수
- [x] 작업 4: `relevantLaws` 수신 및 주입
- [x] 작업 5: `analyzeMode()` 함수 + 모드 분석 프로토콜
- [x] 작업 6: `parseSquadIds()` + expertId 할당
- [x] 작업 7: 누락 태그 추출 + 유틸리티 + 완전한 응답 구조
- [x] 작업 8: CORS 오리진 추가
- [x] 작업 9: 프론트엔드 정규식 한국어 매칭
