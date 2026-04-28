# N07 — Viewpoint Analysis Report 템플릿 적용

**생성일:** 2026-04-25  
**상태:** 진행 중  
**담당:** AGENT C (프론트엔드) + AGENT A (API)

---

## 목적

Change Viewpoint 기능으로 생성된 이미지 노드를 클릭했을 때,  
우측 사이드바 Analysis Report 섹션에 **3섹션 구조화 표** 형식으로 분석 결과를 표시한다.

## 템플릿 구조 (template-analysis.txt 기준)

| 섹션 | 항목 수 | 내용 |
|---|---|---|
| 1. 관측 및 시점 파라미터 | 8개 | 촬영 시점, 방위각, 고도, 투시, 센서, 초점거리, 광선, 대비 |
| 2. 기하학 & 공간 구조 명세 | 7개 | 인피 시스템, 내·외부 파사드, 기본 매스, 하·중·상층부 |
| 3. 개념 & 시각적 속성 | 5개 | 디자인 알고리즘, 주조색, 형태 모티브, 형태적·감성적 대비 |

## 구현 전략: Option B (Phase 1.5 — 별도 추출 호출)

```
Phase 1: Gemini → executionPrompt (기존 유지)
Phase 1.5: Gemini → JSON report (executionPrompt 파싱) ← 신규
Phase 2: Gemini → generated_image (기존 유지)
```

Phase 1.5는 실패해도 non-fatal (viewpointReport = null → 기존 텍스트 폴백)

## 변경 파일 체크리스트

- [x] `docs/exec-plans/active/N07-viewpoint-analysis-report-template-260425.md` — 이 파일 (작업지시서)
- [x] `project_canvas/types/canvas.ts` — `ViewpointAnalysisReport` 타입 + `CanvasNode.viewpointReport` 필드 추가
- [x] `project_canvas/lib/prompt.ts` — `VIEWPOINT_REPORT_SCHEMA` 상수 + `buildReportExtractionPrompt()` 함수 추가
- [x] `project_canvas/app/api/change-viewpoint/route.ts` — Phase 1.5 JSON 추출 호출 추가, 응답에 `report` 필드 포함
- [x] `project_canvas/components/panels/ChangeViewpointPanel.tsx` — `viewpointReport` prop 추가, 3섹션 구조화 표 렌더링
- [x] `project_canvas/app/page.tsx` — `viewpointReport` 노드 저장 + RightSidebar 전달
- [x] 빌드 검증 (`npm run build` — TypeScript 0 errors)

## 타입 설계

```typescript
// ViewpointAnalysisReport (canvas.ts)
interface ViewpointAnalysisReport {
  optical: {
    viewpoint: string;   // 촬영 시점
    azimuth: string;     // 방위각
    altitude: string;    // 촬영 고도
    perspective: string; // 투시 왜곡
    sensor: string;      // 센서 포맷
    focalLength: string; // 이점 거리
    lighting: string;    // 광선 및 날씨
    contrast: string;    // 대비 강도
  };
  geometric: {
    skin: string;        // 인피 시스템
    innerFacade: string; // 내부 파사드
    outerFacade: string; // 외부 파사드
    baseMass: string;    // 기본 매스
    baseFloor: string;   // 하층부(1F)
    midBody: string;     // 중인층부
    roof: string;        // 상층부/루프
  };
  conceptual: {
    designAlgorithm: string; // 디자인 알고리즘
    colorPalette: string;    // 주조색
    formMotif: string;       // 형태 모티브
    formContrast: string;    // 형태적 대비
    moodContrast: string;    // 감성적 대비
  };
}
```

## API 응답 변경

```typescript
// 기존
{ generated_image: string; analysis: string; }

// 변경
{ generated_image: string; analysis: string; report: ViewpointAnalysisReport | null; }
```

## 완료 기준

- `npm run build` TypeScript 0 errors
- viewpoint 노드 클릭 시 3섹션 표가 사이드바에 표시됨
- Phase 1.5 실패 시 "분석 데이터 없음" placeholder 표시 (앱 크래시 없음)
