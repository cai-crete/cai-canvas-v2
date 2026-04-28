# N05 Change Viewpoint — cai-change-viewpoint-v5 백엔드 연결 계획

> **작성일**: 2026-04-24  
> **작성자**: AGENT A  
> **Frontend**: `https://cai-canvas-v2.vercel.app/`  
> **Backend**: `https://cai-change-viewpoint-v5.vercel.app/`

---

## 아키텍처 구조

```
[cai-canvas-v2] (Frontend)              [cai-change-viewpoint-v5] (Backend)
─────────────────────────────────       ──────────────────────────────────────
사용자 사이드바 조작
  │ viewpoint, prompt 선택
  ▼
useViewpointGeneration.ts
  │ POST /api/change-viewpoint
  ▼
app/api/change-viewpoint/route.ts  ───► POST /api/generate
  (프록시 라우트)                        (v5 백엔드 API)
  │ FormData 변환·포워딩                  │ 2단계 Gemini 파이프라인
  │ 응답 정규화                          │ { image, mimeType, analysis }
  ▼
{ generated_image, analysis }
  │
  ▼
새 viewpoint 노드 생성 + 엣지 연결
```

**프록시 라우트를 사용하는 이유:**
- CORS 설정 불필요 (서버 간 통신)
- 클라이언트에 백엔드 URL 노출 방지
- base64 → FormData 변환을 서버에서 처리
- Canvas 아키텍처 일관성 유지 (STI, STP와 동일 패턴)

---

## 백엔드 API 스펙 (cai-change-viewpoint-v5)

| 항목 | 값 |
|------|-----|
| 엔드포인트 | `POST https://cai-change-viewpoint-v5.vercel.app/api/generate` |
| 입력 형식 | `FormData` |
| `image` | File (건축 사진) |
| `viewpoint` | `"street"` \| `"aerial"` \| `"detail"` \| `"quarter"` |
| `feedback` | string (선택) |
| 출력 | `{ image: string, mimeType: string, analysis: string }` |

**Viewpoint 레이블 ↔ API 값 매핑**

| Canvas UI 레이블 | API 전달 값 |
|-----------------|------------|
| Bird's eye view | `"aerial"` |
| Street view | `"street"` |
| Corner view | `"quarter"` |
| Detail view | `"detail"` |

---

## 우측 사이드바 UI 스펙

```
[CHANGE VIEWPOINT 탭 선택 시 우측 패널]

┌─────────────────────────────┐
│  CHANGE VIEWPOINT           │  ← 탭 헤더
├─────────────────────────────┤
│                             │
│  Prompt                     │  ← image·plan 패널과 동일 스타일
│  ┌─────────────────────┐   │
│  │ 시점 변경 요청 입력...│   │  ← 텍스트에리어
│  └─────────────────────┘   │
│                             │
│  Viewpoint                  │  ← 섹션 레이블
│  ┌─────────────────────┐   │
│  │ Bird's eye view     │   │  ← 단일 선택 (라디오 버튼 스타일)
│  ├─────────────────────┤   │
│  │ Street view         │   │
│  ├─────────────────────┤   │
│  │ Corner view         │   │
│  ├─────────────────────┤   │
│  │ Detail view         │   │
│  └─────────────────────┘   │
│                             │
│  Analysis Report            │  ← plan의 Parameter Report와 동일 스타일
│  ┌─────────────────────┐   │
│  │ 생성된 노드 선택 시  │   │  ← viewpointAnalysis 텍스트 표시
│  │ 분석 결과 표시       │   │  ← 생성 전/미선택 시: 비어있음
│  └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│       [ GENERATE ]          │  ← 하단 고정 버튼
└─────────────────────────────┘
```

**GENERATE 동작 흐름:**
1. 클릭 → GENERATE 버튼 비활성화 (Image·Plan과 동일)
2. 로딩 토스트 표시: `'PICTURE GENERATING'` (Image·Plan과 동일 스타일)
3. 백그라운드에서 `POST /api/change-viewpoint` 실행
4. 완료 → 새 `viewpoint` 노드 생성 + 원본 노드와 엣지 연결
5. 생성된 viewpoint 노드 선택 시 → Analysis Report에 분석 텍스트 표시

---

## 작업 체크리스트

### Phase 0: 환경변수 설정
- [x] `project_canvas/.env.local`에 추가 ✅
  ```
  GEMINI_API_KEY_VIEWPOINT=AIzaSyD_Le8H4z0JjWzsulZ4sDWhQfYa6Ty2VLU
  VIEWPOINT_API_URL=https://cai-change-viewpoint-v5.vercel.app
  ```

### Phase 1: 타입 정의 확장 (`project_canvas/types/canvas.ts`)
- [x] `ViewpointPanelSettings` 인터페이스 추가 ✅
- [x] `CanvasNode`에 필드 추가 (`viewpointPanelSettings`, `viewpointAnalysis`) ✅
- [x] `NODES_NAVIGATE_DISABLED`에서 `'viewpoint'` 제거 ✅

### Phase 2: Canvas 프록시 API 라우트 신규 생성
- [x] `project_canvas/app/api/change-viewpoint/route.ts` 생성 ✅
  - **수신 (Canvas 클라이언트 → 프록시)**: JSON body
    ```ts
    {
      image_base64: string;                           // 원본 이미지 base64
      mime_type?: string;                             // 기본값: 'image/png'
      viewpoint: 'aerial' | 'street' | 'quarter' | 'detail';
      user_prompt?: string;
    }
    ```
  - **프록시 처리**:
    1. base64 → `Buffer` → `Blob` 변환
    2. `FormData` 구성: `image` (Blob), `viewpoint`, `feedback` (user_prompt)
    3. `fetch(process.env.VIEWPOINT_API_URL + '/api/generate', { method: 'POST', body: formData })`
  - **응답 정규화 (프록시 → Canvas 클라이언트)**:
    ```ts
    {
      generated_image: string;  // v5 응답의 `image` 필드
      analysis: string;         // v5 응답의 `analysis` 필드
    }
    ```
  - 에러 처리: v5 응답 실패 시 503 반환

### Phase 3: React Hook 신규 생성
- [x] `project_canvas/hooks/useViewpointGeneration.ts` 생성 ✅
  ```ts
  interface ViewpointParams {
    viewpoint: 'aerial' | 'street' | 'quarter' | 'detail';
    userPrompt?: string;
  }
  // POST /api/change-viewpoint (JSON body, 캔버스 프록시 라우트)
  // useBlueprintGeneration 패턴 동일
  // 반환: { generatedImage, analysis, isLoading, error, generate, reset }
  ```

### Phase 4: 우측 사이드바 패널 구현
- [x] `components/panels/ChangeViewpointPanel.tsx` 신규 생성 ✅
- [x] `components/RightSidebar.tsx` 수정 — viewpoint 전용 props + 패널 분기 ✅
  - **Prompt** 텍스트에리어 (image·plan 패널과 동일 스타일)
  - **Viewpoint** 4개 선택 버튼 (단일 선택)
    - Bird's eye view → `"aerial"`
    - Street view → `"street"`
    - Corner view → `"quarter"`
    - Detail view → `"detail"`
  - **Analysis Report** 섹션
    - 원본 이미지 아트보드 선택 시: 비어있음
    - 생성된 viewpoint 노드 선택 시: `node.viewpointAnalysis` 텍스트 표시
  - **GENERATE 버튼** (하단 고정)
    - 비활성: viewpoint 미선택 시 또는 생성 중
    - 클릭 후: 버튼 비활성화 + 로딩 토스트 `'PICTURE GENERATING'` (Image·Plan 동일)

### Phase 5: page.tsx 수정 (`project_canvas/app/page.tsx`)
- [x] `handleViewpointSettingsChange` 추가 — 선택 노드의 viewpointPanelSettings 즉시 업데이트 ✅
- [x] `handleGenerateViewpoint` 추가 — `POST /api/change-viewpoint`, `GeneratingToast('PICTURE GENERATING')`, 완료 시 viewpoint 노드 + 엣지 생성 ✅
- [x] `handleNodeTabSelect` 수정 — viewpoint 탭 클릭 시 사이드바 패널 토글 (image 아트보드 필수) ✅
- [x] `RightSidebar`에 viewpoint 5개 props 전달 ✅

---

## 파일 변경 요약

| 파일 | 작업 | 비고 |
|------|------|------|
| `project_canvas/.env.local` | 수정 | `VIEWPOINT_API_URL` 추가 |
| `project_canvas/types/canvas.ts` | 수정 | 인터페이스 2개, 상수 1곳 수정 |
| `project_canvas/app/api/change-viewpoint/route.ts` | **신규 생성** | 프록시 라우트 (핵심) |
| `project_canvas/hooks/useViewpointGeneration.ts` | **신규 생성** | React Hook |
| `project_canvas/components/[사이드바 패널]` | 수정 | viewpoint 탭 패널 추가 |
| `project_canvas/app/page.tsx` | 수정 | 핸들러 2개 추가 |

> **cai-change-viewpoint-v5 레포 수정 없음** — 백엔드는 현재 배포 상태 그대로 사용

---

## 착수 전 확인 필요

1. **v5 백엔드 접근 가능 여부**: `https://cai-change-viewpoint-v5.vercel.app/api/generate`가 현재 응답하는지 확인
2. **v5 백엔드 인증**: `/api/generate` 엔드포인트가 공개(Public)인지, API Key 인증이 필요한지 확인

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
