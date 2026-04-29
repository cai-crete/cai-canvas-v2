# 작업지시서 — CAI.git Planners 통합 적용

> **완료일**: 2026-04-24  
> **빌드**: ✅ `npm run build` 통과

## 목적
`https://github.com/cai-crete/CAI.git` README.md(README_PLANNERS.md)에 기술된 3가지 기능을  
현재 `cai-canvas-v2` 앱에 완벽 적용한다.

## 3가지 기능 (이슈)
| 이슈 | 설명 |
|------|------|
| **이슈 1** | Planners 노드 클릭 시 우측 탭에 기획서 미리보기 표시 |
| **이슈 2** | Expand 뷰 재진입 시 대지/법규/건물 탭 데이터 유지 (InsightPanel 복원) |
| **이슈 3** | VWorld 지적도 데이터 수신 시 캔버스에 지적도 아트보드 노드 자동 생성 |

## 신규 생성 파일 (CAI.git에서 복사)
- [x] `project_canvas/planners/types.ts`
- [x] `project_canvas/planners/experts.ts`
- [x] `project_canvas/planners/utils.ts`
- [x] `project_canvas/planners/lib/lawApi.ts`
- [x] `project_canvas/planners/lib/lawKeywords.ts`
- [x] `project_canvas/planners/lib/parkingCalculator.ts`
- [x] `project_canvas/planners/lib/zoneLawMapping.ts`
- [x] `project_canvas/planners/PlannersPanel.tsx`
- [x] `project_canvas/components/panels/PlannersInsightPanel.tsx`
- [x] `project_canvas/app/api/planners/route.ts`

## 수정 파일 (cai-canvas-v2에 병합)
- [x] `project_canvas/types/canvas.ts` — cadastral NodeType, PlannerMessage, SavedInsightData 추가
- [x] `project_canvas/app/page.tsx` — plannerMessagesRef, plannerInsightDataRef, handleCadastralDataReceived 추가
- [x] `project_canvas/components/RightSidebar.tsx` — plannerMessages prop, PlannerReportPanel 추가
- [x] `project_canvas/components/ExpandedView.tsx` — planners/cadastral 라우팅, insight data 상태 추가

## 패키지 설치 (신규)
- [x] `lucide-react` — PlannersPanel, PlannersInsightPanel 아이콘
- [x] `react-markdown` + `remark-gfm` — PlannersPanel 마크다운 렌더링
- [x] `clsx` + `tailwind-merge` — planners/utils.ts cn() 헬퍼

## 핵심 주의사항
- `ExpandedView.tsx`: 기존 sketch-to-image, sketch-to-plan 처리는 반드시 유지
- `RightSidebar.tsx`: 기존 viewpoint 패널, disabled tab 로직 반드시 유지
- `page.tsx`: localforage 기반 storage, history {nodes, edges}, toast 시스템 반드시 유지
- `types/canvas.ts`: 기존 NODE_ORDER, ARTBOARD_COMPATIBLE_NODES 등 모든 상수 유지

## 콘솔 로그 기준표
| 로그 | 파일 | 의미 |
|------|------|------|
| `[지적도] 아트보드 생성 시작 — PNU: ..., 브이월드 N건 반환` | PlannersPanel.tsx | VWorld → 생성 콜백 전송 |
| `[지적도] 아트보드 생성 완료 — 노드 ID: ...` | page.tsx | 캔버스 노드 생성 성공 |
| `[지적도] 아트보드 생성 건너뜀 — 이미 존재하는 지적도 노드 있음` | page.tsx | 중복 방지 |
| `[지적도] 아트보드 생성 완료 — iframe 로드 성공` | ExpandedView.tsx | 토지이음 iframe 로드 성공 |

---
COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
