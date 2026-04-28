# Exec Plan — MCP 법규 · 3D Map · 주차 산정 · 용도지역 파라미터 통합 수정

> 이 문서는 살아있는 문서(living document)입니다.
> 작업을 진행하면서 발견, 결정, 진행 상황을 이 문서에 지속적으로 업데이트합니다.
> 이전 맥락이나 기억 없이, 이 문서만으로 작업을 완수할 수 있을 만큼 자급자족해야 합니다.
>
> 작업 완료 시 `completed/` 폴더로 이동합니다.

---

## 개요

- **작업 유형**: 버그 수정 + 기능 개선 (5개 이슈 통합)
- **시작일**: 2026-04-28
- **목표**: MCP 법규 검색 정상화, 3D Map 노드 작동, 주차 산정 로직 수정, 건폐율/용적률 파라미터 표시, 지자체조례 MCP 정상화

---

## 이슈 목록 및 작업 우선순위

### 우선순위 결정 근거

지자체조례(이슈5)가 작동하지 않으면 건폐율/용적률(이슈4), 주차 산정(이슈3), 법규 검토(이슈1) 전부 무의미.
따라서 **5 → 1 → 4 → 3 → 2** 순서로 진행.

---

## ISSUE 5+1 통합 — 지자체조례 MCP + 법제처 MCP 정상화 (최우선)

### 근본 원인 분석 (2026-04-28 완료)

**아키텍처 전체 흐름:**
```
CAI_CANVAS (Next.js) → /api/planners 프록시 → cai-planners-v2.vercel.app (Planners_harness)
                                                  ├── api/generate.ts (Gemini API)
                                                  ├── api/law.ts (법제처/공공데이터/브이월드 직접 API)
                                                  ├── api/mcp-proxy.ts (korean-law-mcp.fly.dev 프록시)
                                                  └── src/lib/gemini.ts (토론 생성 + MCP Agent Loop)
```

**문제 1: 법제처 bylr API는 메타데이터만 반환**
- `api/law.ts:86-107` `fetchBylrInfo()` — 법제처 자치법규 API(target=bylr) 호출
- 이 API는 법령명, 시행일, 공포번호 같은 **메타데이터만 반환**
- 실제 조문 내용(건폐율 60%, 용적률 200%, 높이 제한 등)은 **반환하지 않음**
- 따라서 `parkingCalculator.ts:92-105` `parseOrdinanceAreaPerSpace()`는 **항상 실패** → 폴백 동작

**문제 2: 메인 토론(generateDiscussion)은 MCP를 전혀 사용하지 않음**
- `src/lib/gemini.ts:524` `generateDiscussion()` — 스트리밍 호출, 도구 없음
- 법령 데이터는 `prefetchApiData()` → `fetchRelevantLaws()` → `api/law.ts`로 직접 조회
- 조회된 정적 데이터가 `{{RELEVANT_LAWS}}`로 프롬프트에 주입될 뿐
- 기획자 에이전트들은 추가 법규 검색 **수단이 없음** → "법규를 검토해야 한다"고만 말함

**문제 3: MCP Agent Loop는 InsightPanel에서만 사용**
- `src/lib/gemini.ts:936` `getZoneAnalysis()` — MCP 도구를 사용하는 유일한 함수
- `InsightPanel.tsx:292`에서 용도지역 감지 시 자동 호출
- 하지만 CAI_CANVAS의 `PlannersInsightPanel.tsx`에는 이 호출이 **없음**

### 해결 전략

**A. `getZoneAnalysis()` MCP Agent Loop의 결과를 메인 파이프라인에 통합**
  - `prefetchApiData()` 단계에서 `getZoneAnalysis()`를 호출하여 MCP 조례 검색 결과를 확보
  - 결과를 `{{RELEVANT_LAWS}}`에 추가 주입 → 기획자 에이전트가 실제 조례 데이터로 토론

**B. CAI_CANVAS PlannersInsightPanel에 MCP 규제 분석 결과 표시**
  - Planners_harness InsightPanel의 `getZoneAnalysis()` 호출 패턴을 CAI_CANVAS에 이식
  - 또는 Planners_harness 백엔드에 전용 API 엔드포인트 추가

**C. `ZONE_REGULATIONS` 하드코딩은 폴백으로 유지**
  - MCP 조례 검색 실패 시 서울 기준 하드코딩 폴백 (현행 유지)

### 작업 항목
- [ ] 5-1: `prefetchApiData()`에서 `getZoneAnalysis()` 호출 통합 — 용도지역 감지 시 MCP로 조례 검색
- [ ] 5-2: MCP 조례 결과를 `{{RELEVANT_LAWS}}`에 추가 주입
- [ ] 5-3: CAI_CANVAS `PlannersInsightPanel`에 MCP 규제 분석 결과 표시 연동
- [ ] 5-4: `api/planners/route.ts` 프록시에 MCP 관련 엔드포인트 추가 (필요 시)
- [ ] 5-5: `ZONE_REGULATIONS` 하드코딩 폴백 유지

---

## ISSUE 1 — (ISSUE 5와 통합됨)

> 근본 원인이 ISSUE 5와 동일하므로 위 ISSUE 5+1 통합 섹션에서 함께 처리합니다.
> 핵심: `generateDiscussion()`이 MCP를 사용하지 않는 것이 원인. 정적 데이터만 주입됨.

---

## ISSUE 4 — 건폐율/용적률 → 대지면적 기준 파라미터(㎡) 표시

### 현상
- 용도지역지구(예: 제2종일반주거지역)에서 건폐율 60%, 용적률 200% 표시는 되지만
- **대지면적 기준 최대 건축면적(㎡), 최대 연면적(㎡)** 이 산출·표시되지 않음
- 건축물 높이, 면적 관련 법규가 최상단에 나타나야 함

### 현재 코드 상태
- `PlannersInsightPanel.tsx:209-236` — `ZoneItem` 컴포넌트: 건폐율/용적률 % 표시
- `PlannersInsightPanel.tsx:292-302` — 대지면적(`landCharacteristics.landArea`) 이미 가져옴
- 대지면적 × 건폐율 = 최대 건축면적, 대지면적 × 용적률 = 최대 연면적 → 계산 가능

### 작업 항목
- [ ] 4-1: `ZoneItem` 컴포넌트에 대지면적(landArea) props 전달
- [ ] 4-2: 최대 건축면적 = landArea × bcr%, 최대 연면적 = landArea × far% 계산 로직 추가
- [ ] 4-3: 하단에 "최대 건축면적 N㎡ / 최대 연면적 N㎡" 파라미터 카드 추가
- [ ] 4-4: 건축물 높이·면적 관련 법규를 법령정보 섹션 최상단으로 재배치
- [ ] 4-5: Planners_harness 쪽 `InsightPanel.tsx`에도 동일 적용

---

## ISSUE 3 — 주차 산정: 사용자 의도 용도 기준으로 변경

### 현상
- 현재: 건축물대장의 기존 건물 용도(`mainPurpsCdNm`)로 주차 대수 산정
- 원하는 것: **사용자가 프롬프트에 입력한 의도된 용도** 기준으로 산정

### 현재 코드 상태
- **CAI_CANVAS**: `project_canvas/planners/lib/parkingCalculator.ts`
  - `calculateParkingRequirement(buildingUse, totalFloorArea, ...)` — buildingUse가 건축물대장 기준
  - `calculateParkingFromBuildingData(buildings, ...)` — 건축물대장에서 용도 추출
- **Planners_harness**: `src/lib/parkingCalculator.ts` — 동일 구조
- 주차 산정 호출: `PlannersInsightPanel.tsx:422` — `calculateParkingFromBuildingData(buildings, ...)`

### 작업 항목
- [ ] 3-1: 사용자 프롬프트에서 의도된 용도를 추출하는 로직 추가 (Gemini 응답 또는 프롬프트 파싱)
- [ ] 3-2: `calculateParkingRequirement` 함수에 `intendedUse` 파라미터 추가 — 이것이 우선, 없으면 건물대장 폴백
- [ ] 3-3: `PlannersInsightPanel.tsx` — ParkingSection에 의도된 용도 전달
- [ ] 3-4: Planners_harness 쪽 `parkingCalculator.ts`에도 동일 적용
- [ ] 3-5: UI에 "기획 용도 기준" vs "기존 건물 용도 기준" 표시

---

## ISSUE 2 — 3D Map 노드 미작동

### 현상
- 캔버스에서 3D Map 노드가 작동하지 않음
- Planners_harness에는 구현 완료 상태 (`Map3DNode.tsx`, `Map3DView.tsx`, `roadApi.ts`)
- CAI_CANVAS에는 해당 파일이 없거나 연결 안 됨

### 현재 코드 상태
- **Planners_harness** (구현 완료):
  - `src/components/nodes/Map3DNode.tsx` ✅
  - `src/components/Map3DView.tsx` ✅
  - `src/lib/roadApi.ts` ✅
  - `api/vworld-map.ts` — road-wfs 액션 ✅
  - `src/types/vworld.d.ts` ✅
  - `src/types/nodes.ts` — Map3DNodeData 타입 ✅
- **CAI_CANVAS**: 3D Map 관련 코드 **없음** (Grep 결과 0건)

### 원인 분석
- Planners_harness에서 개발 완료되었지만 CAI_CANVAS로 이식되지 않음
- 또는 CAI_CANVAS가 Planners_harness를 직접 참조하는 구조라면, 연결 파이프라인 문제

### 작업 항목
- [ ] 2-1: CAI_CANVAS ↔ Planners_harness 관계 확인 (직접 참조 vs 코드 이식)
- [ ] 2-2: Map3DNode 관련 코드를 CAI_CANVAS에 이식 또는 연결
- [ ] 2-3: Canvas.tsx에 map3dNode 타입 등록
- [ ] 2-4: useStore.ts에 Map3DNode 자동 생성 로직 추가
- [ ] 2-5: 빌드 검증

---

## 영향 범위 요약

| 파일 | 이슈 | 변경 유형 |
|------|------|-----------|
| `Planners_harness/src/lib/mcpClient.ts` | 5, 1 | 수정 |
| `Planners_harness/api/mcp-proxy.ts` | 5, 1 | 확인 |
| `Planners_harness/api/generate.ts` | 5, 1 | 수정 |
| `Planners_harness/api/_protocols.ts` | 5, 1 | 수정 |
| `Planners_harness/src/components/InsightPanel.tsx` | 4, 3 | 수정 |
| `Planners_harness/src/lib/parkingCalculator.ts` | 3 | 수정 |
| `CAI_CANVAS/project_canvas/components/panels/PlannersInsightPanel.tsx` | 4, 3 | 수정 |
| `CAI_CANVAS/project_canvas/planners/lib/parkingCalculator.ts` | 3 | 수정 |
| `CAI_CANVAS/project_canvas/planners/lib/zoneLawMapping.ts` | 5, 4 | 수정 |
| `CAI_CANVAS/project_canvas/` (3D Map 관련 신규 파일) | 2 | 신규/이식 |

---

## 진행 방식

1. 각 이슈별 원인 분석 → 코드 수정 → 검증 순서
2. 이슈 간 의존성: **5 → 1 → 4 → 3 → 2**
3. CAI_CANVAS와 Planners_harness 양쪽 동기화 필수

---

## Progress

- [x] ISSUE 5+1 — 지자체조례 MCP + 법제처 MCP 정상화 (서버사이드 MCP 통합 완료)
- [x] ISSUE 4 — 건폐율/용적률 파라미터(㎡) 표시 + 법령 정렬
- [x] ISSUE 3 — 주차 산정 로직 변경 (의도된 용도 기준)
- [x] ISSUE 2 — 3D Map 노드 CAI_CANVAS 이식/작동

---

## Surprises & Discoveries

_(작업 중 발견사항 기록)_

---

## Decision Log

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-28 | 작업 순서 5→1→4→3→2 | 지자체조례가 모든 법규 기능의 근간 |
| 2026-04-28 | ZONE_REGULATIONS 하드코딩은 폴백으로 유지 | MCP 조례 조회 실패 시 안전장치 |

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
