# 작업지시서: 백엔드 인프라 구축 (Render + Supabase — 무료 베타)

**작성일**: 2026-04-29  
**완료일**: 2026-04-29  
**상태**: ✅ 완료 (Phase 0~2 + Print Proxy)  
**요청자**: baejitong5294@gmail.com  
**목적**: Vercel 한계(타임아웃, 용량) 극복 — 무료 티어, 베타 테스트 수준, 로그인 없이 인프라만 구축  
**보류 계획서**: `docs/exec-plans/active/260428-firebase-backend-infra.md` (Firebase, 유료 플랜 필요)

---

## 배경 및 전환 이유

| 항목 | Firebase (보류) | Render + Supabase (채택) |
|------|---------------|------------------------|
| Functions 타임아웃 | 300초 (Blaze 유료 필수) | **무제한 (무료)** |
| 메모리 | 4GB (Blaze 유료 필수) | 512MB (무료, 베타 충분) |
| Node.js 코드 재사용 | 그대로 | **그대로** |
| Storage | 1GB 무료 | 1GB 무료 |
| DB | Firestore (유료 초과 시) | PostgreSQL 500MB 무료 |

---

## 핵심 설계 원칙 — 프론트엔드 코드 무변경

> **API 응답 형식(base64)은 절대 바꾸지 않는다.**

`generatedImageData`, `thumbnailData`는 `page.tsx` 전체에서 사용되며,
`printUtils.ts`의 `nodeImageToSelectedImage()`는 `raw.startsWith('data:')` 로직으로 동작한다.
응답 형식을 변경하면 Print 자동 생성을 포함한 모든 hook과 component가 연쇄 파괴된다.

**Render 서버는 기존과 동일한 base64 응답을 반환한다. 클라이언트 코드는 한 줄도 바뀌지 않는다.**

---

## 아키텍처

```
[Client: Next.js on Vercel — 변경 없음]
    │
    │ 기존과 동일한 base64 요청/응답
    ▼
[Vercel API Route — 얇은 프록시로 변환]
    │
    │ JSON 포워딩 + x-internal-secret 헤더
    ▼
[Render.com Express 서버 (cai-canvas-v2)]
    │  Node.js, 타임아웃 없음, 512MB RAM
    │  GEMINI_API_KEY (환경변수, 클라이언트 비노출)
    │
    ├─→ Gemini API 호출 (타임아웃 없음)
    │
    └─→ /print-proxy → Render.com Print 서버 (cai-print-v3)
                        Node.js, 타임아웃 없음
                        (Vercel 4.5MB 제한 우회)
```

---

## Phase별 구현 결과

### Phase 0: 환경 준비

- [x] Render.com 계정 생성
- [x] New Web Service → GitHub 연결 (cai-canvas-v2 서버)
- [x] 런타임: Node.js
- [x] Render 서버 환경변수 설정 (GEMINI_API_KEY 등, INTERNAL_SECRET, PRINT_API_URL, CANVAS_API_SECRET)
- [x] Vercel 환경변수 추가 (RENDER_SERVER_URL, NEXT_PUBLIC_RENDER_HEALTH_URL, INTERNAL_SECRET)
- [x] `GET /health → { status: 'ok' }` 확인
- [x] 시크릿 없는 요청 → 403 응답 확인

---

### Phase 1: Render Express 서버 구축

- [x] `render-server/src/index.ts` — Express + CORS + 라우터 등록
- [x] `render-server/src/middleware/verifySecret.ts` — 공유 시크릿 검증
- [x] `render-server/src/routes/sketchToImage.ts` — N03 Gemini 로직
- [x] `render-server/src/routes/sketchToPlan.ts` — N02 Gemini 로직
- [x] `render-server/src/routes/imageToElevation.ts` — N04 Gemini 로직
- [x] `render-server/src/routes/changeViewpoint.ts` — N05 Gemini 로직
- [x] `render-server/src/routes/printProxy.ts` — Print 서버 프록시 (신규 추가)
- [x] CORS: 모든 `*.vercel.app` + `localhost:3000` 허용

---

### Phase 2: Vercel API Route → 얇은 프록시로 교체

- [x] `project_canvas/app/api/sketch-to-image/route.ts` 프록시화
- [x] `project_canvas/app/api/sketch-to-plan/route.ts` 프록시화
- [x] `project_canvas/app/api/image-to-elevation/route.ts` 프록시화
- [x] `project_canvas/app/api/change-viewpoint/route.ts` 프록시화
- [x] `project_canvas/components/RenderWakeup.tsx` 신규 (앱 로드 시 Render 웨이크업)
- [x] `project_canvas/app/layout.tsx` — RenderWakeup 추가
- [x] `project_canvas/print/ExpandedView.tsx` — apiBaseUrl을 Render print-proxy로 변경

---

### Print 서버 Render 배포 (추가 작업)

- [x] `cai-harness-print` (cai-print-v3)를 Render Web Service로 배포
- [x] PRINT_API_URL을 Render print 서버 URL로 설정
- [x] Canvas → Render → Print 서버 end-to-end 생성 동작 확인

---

### Phase 3: Supabase DB — 캔버스 상태 영속화 (선택, 베타 이후)

> 베타 테스트에서는 Phase 2까지만으로 충분합니다.  
> 이 Phase는 "새로고침해도 캔버스 유지"가 필요한 시점에 별도 계획서로 추진합니다.

---

## 완료 기준 결과

- [x] Render 서버 `/health` 엔드포인트 응답 확인
- [x] 시크릿 없는 요청 → 403 차단 확인
- [x] sketch-to-image 60초 초과 처리 정상 완료 (타임아웃 제거)
- [x] 5MB 초과 이미지 입출력 정상 동작 (Vercel 4.5MB 제한 우회)
- [x] 프론트엔드 코드(`page.tsx`, `printUtils.ts`, 모든 hook) 변경 없이 정상 동작
- [x] Print 자동 생성 흐름 이상 없음 (base64 유지 확인)
- [x] Vercel 배포 후 전체 흐름 E2E 동작 확인

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
