# CAI Canvas — 서버 인프라 인수인계 보고서

**작성일**: 2026-04-29  
**작성자**: cai@cre-te.com  
**대상**: 이 저장소를 새로 클론하여 작업하는 개발자

---

## 1. 전체 아키텍처 개요

```
[사용자 브라우저]
       │
       ▼
[Vercel — Next.js (cai-canvas-v2)]
 project_canvas/
       │
       ├─ AI 생성 요청 (sketch-to-image 등)
       │     app/api/*/route.ts → 얇은 프록시
       │                         ↓
       │          [Render.com — Express 서버 A]
       │           render-server/
       │           • Gemini API 직접 호출
       │           • 타임아웃 없음, 50MB body 허용
       │
       └─ Print 생성 요청
             print/ExpandedView.tsx
             → NEXT_PUBLIC_RENDER_HEALTH_URL/print-proxy/*
                          ↓
             [Render.com — Express 서버 A]  (print-proxy 경유)
                          ↓
             [Render.com — Next.js Print 서버 B]
              cai-print-v3 (별도 저장소: cai-crete/cai-print-v3)
```

### 왜 이 구조인가?

Vercel 무료/Pro 플랜은 **4.5MB 요청 크기 제한**과 **함수 실행 시간 제한**이 있습니다.  
Gemini 이미지 생성 API는 이 두 제한을 모두 초과하므로, 제한이 없는 Render.com Express 서버를 중간에 배치했습니다.

---

## 2. 저장소 구조

```
cai-crete-cai-canvas-v2-jw/          ← 이 저장소 (로컬 작업 디렉토리)
├── project_canvas/                   ← Next.js 앱 (Vercel 배포)
│   ├── app/
│   │   ├── api/
│   │   │   ├── sketch-to-image/route.ts   ← Render 프록시
│   │   │   ├── sketch-to-plan/route.ts    ← Render 프록시
│   │   │   ├── image-to-elevation/route.ts ← Render 프록시
│   │   │   └── change-viewpoint/route.ts  ← Render 프록시
│   │   └── layout.tsx                     ← RenderWakeup 컴포넌트 포함
│   ├── components/
│   │   └── RenderWakeup.tsx               ← 앱 로드 시 Render 서버 웨이크업
│   └── print/
│       └── ExpandedView.tsx               ← apiBaseUrl → Render print-proxy
│
└── render-server/                    ← Express 서버 (Render.com 배포)
    ├── src/
    │   ├── index.ts                   ← 진입점, CORS, 라우터 등록
    │   ├── middleware/
    │   │   └── verifySecret.ts        ← x-internal-secret 헤더 검증
    │   ├── routes/
    │   │   ├── sketchToImage.ts       ← Gemini 이미지 생성
    │   │   ├── sketchToPlan.ts        ← Gemini 플랜 생성
    │   │   ├── imageToElevation.ts    ← Gemini 입면도 생성
    │   │   ├── changeViewpoint.ts     ← Gemini 뷰포인트 분석
    │   │   └── printProxy.ts          ← Print 서버 역방향 프록시
    │   └── lib/
    │       ├── prompt.ts              ← 프로토콜 파일 로더, 프롬프트 빌더
    │       ├── architectStyles.ts     ← 건축가 스타일 프롬프트 (7종)
    │       └── supabaseUpload.ts      ← Supabase Storage 업로드 (선택)
    ├── package.json
    └── tsconfig.json
```

> **주의**: `render-server/node_modules/`는 `.gitignore`에 포함되어 있지 않을 수 있습니다.  
> 배포 시 Render가 `npm install`을 자동으로 실행합니다.

---

## 3. Git Remote 구성

이 로컬 저장소는 **두 개의 remote**를 가집니다.

```bash
git remote -v
# origin        https://github.com/cai-crete/cai-crete-cai-canvas-v2-jw.git  (내부 작업용)
# cai-canvas-v2 https://github.com/cai-crete/cai-canvas-v2.git               (Vercel 연결, 실제 배포용)
```

**배포는 반드시 `cai-canvas-v2` remote에 push해야 합니다.**

```bash
# 올바른 배포 push
git push cai-canvas-v2 main

# 원격에 신규 커밋이 있으면 먼저 pull
git pull cai-canvas-v2 main --rebase
git push cai-canvas-v2 main
```

`origin`에 push해도 Vercel은 자동 배포되지 않습니다.

---

## 4. 환경 변수 설정

### 4-A. Render.com 서버 A (render-server) 환경 변수

Render Dashboard → 해당 Web Service → **Environment** 탭에서 설정합니다.

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `GEMINI_API_KEY` | Gemini API 키 (sketch-to-image, sketch-to-plan 공용) | `AIza...` |
| `GEMINI_API_KEY_IMAGE` | Gemini 이미지 전용 키 (없으면 GEMINI_API_KEY 사용) | `AIza...` |
| `GEMINI_API_KEY_PLAN` | Gemini 플랜 전용 키 (없으면 GEMINI_API_KEY 사용) | `AIza...` |
| `INTERNAL_SECRET` | Vercel ↔ Render 공유 시크릿 (32자 이상 랜덤 문자열) | `openssl rand -hex 32` 로 생성 |
| `PRINT_API_URL` | Print 서버 B의 Render URL | `https://cai-print-v3.onrender.com` |
| `CANVAS_API_SECRET` | Print 서버 B 인증용 시크릿 (Print 서버와 동일한 값) | `...` |
| `PORT` | Express 서버 포트 (Render가 자동 주입, 생략 가능) | `3001` |
| `SUPABASE_URL` | Supabase 프로젝트 URL (Storage 사용 시) | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (Storage 사용 시) | `eyJ...` |

> `SUPABASE_*` 변수는 현재 베타 단계에서 미설정 시 Storage 업로드를 건너뜁니다. 기능은 정상 동작합니다.

### 4-B. Vercel (project_canvas) 환경 변수

Vercel Dashboard → 해당 Project → **Settings → Environment Variables**에서 설정합니다.

| 변수명 | 설명 | 클라이언트 노출 |
|--------|------|--------------|
| `RENDER_SERVER_URL` | Render 서버 A URL (서버사이드 API route용) | ❌ 서버 전용 |
| `INTERNAL_SECRET` | Render와 동일한 공유 시크릿 | ❌ 서버 전용 |
| `NEXT_PUBLIC_RENDER_HEALTH_URL` | Render 서버 A URL (클라이언트 웨이크업 + print-proxy용) | ✅ 번들 포함 |

> `RENDER_SERVER_URL`과 `NEXT_PUBLIC_RENDER_HEALTH_URL`은 **같은 Render URL**을 가리킵니다.  
> 용도가 달라 분리되어 있습니다: 전자는 서버사이드 API Route에서, 후자는 클라이언트(RenderWakeup, print 요청)에서 사용합니다.

> **주의**: `NEXT_PUBLIC_*` 변수는 Vercel 빌드 시 번들에 삽입됩니다.  
> 값 변경 후에는 반드시 **Vercel Redeploy**를 실행해야 반영됩니다.

---

## 5. Render.com 서버 배포 설정

### 서버 A (cai-canvas-v2 — AI + Print Proxy)

| 항목 | 값 |
|------|-----|
| 저장소 | `cai-crete/cai-canvas-v2` |
| Root Directory | `render-server` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Region | Singapore (ap-southeast-1) |
| Plan | Free |

### 서버 B (cai-print-v3 — Print 서버)

| 항목 | 값 |
|------|-----|
| 저장소 | `cai-crete/cai-print-v3` |
| Root Directory | `project.10_print` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Region | Singapore (ap-southeast-1) |
| Plan | Free |

> **중요**: `cai-print-v3` 저장소의 `.npmrc`에 `@cai-crete:registry=https://npm.pkg.github.com`이 설정되어 있습니다.  
> Render 서버 B의 환경 변수에 **`NODE_AUTH_TOKEN`** (GitHub PAT, `read:packages` 권한)을 반드시 추가해야 빌드가 성공합니다.

---

## 6. 로컬 개발 환경 설정

### project_canvas (Next.js)

```bash
cd project_canvas
cp .env.local.example .env.local   # 없으면 직접 생성
# .env.local에 아래 값 입력:
# RENDER_SERVER_URL=http://localhost:3001
# INTERNAL_SECRET=<Render와 동일한 값>
# NEXT_PUBLIC_RENDER_HEALTH_URL=http://localhost:3001

npm install
npm run dev   # http://localhost:3000
```

### render-server (Express)

```bash
cd render-server
# .env 파일 생성 (ts-node가 로컬에서 읽음)
cat > .env << 'EOF'
GEMINI_API_KEY=AIza...
INTERNAL_SECRET=<project_canvas/.env.local과 동일한 값>
PRINT_API_URL=https://cai-print-v3.onrender.com
CANVAS_API_SECRET=...
PORT=3001
EOF

npm install
npm run dev   # ts-node로 실행, http://localhost:3001
```

> 로컬에서 `render-server`를 실행하려면 `ts-node`가 필요합니다 (`npm run dev` 시 자동 사용).

---

## 7. 요청 흐름 상세

### AI 생성 (예: sketch-to-image)

```
1. 브라우저        POST /api/sketch-to-image  (Vercel)
2. Vercel Route   JSON 포워딩 + x-internal-secret 헤더 추가
                  POST https://<render>/api/sketch-to-image
3. Render (A)     verifySecret 미들웨어 → 시크릿 불일치 시 403
                  Gemini API 호출 (타임아웃 없음)
4. 응답           base64 이미지 → Vercel → 브라우저
```

### Print 생성

```
1. 브라우저 (print/ExpandedView.tsx)
               POST https://<render>/print-proxy/api/print   (직접 Render 호출)
2. Render (A)  printProxy 라우트 → x-canvas-api-secret 헤더 추가
               POST https://<cai-print-v3>/api/print
3. Render (B)  Print 생성 처리
4. 응답        브라우저로 반환
```

---

## 8. CORS 설정

Render 서버 A의 CORS는 `render-server/src/index.ts`에서 관리합니다.

```typescript
origin: (origin, callback) => {
  if (!origin) { callback(null, true); return; }   // 서버간 호출 허용
  if (origin.endsWith('.vercel.app') || origin === 'http://localhost:3000') {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}
```

- 모든 `*.vercel.app` 도메인 허용 (production + preview 배포 모두 포함)
- `localhost:3000` 허용 (로컬 개발)
- **새 도메인 추가 시** 이 파일을 수정 후 Render에 redeploy 필요

---

## 9. 보안 모델 요약

| 자산 | 보호 방법 | 노출 여부 |
|------|---------|----------|
| `GEMINI_API_KEY` | Render 환경변수에만 존재 | ❌ 절대 미노출 |
| `INTERNAL_SECRET` | Vercel 서버사이드 + Render 환경변수 | ❌ 클라이언트 미노출 |
| `CANVAS_API_SECRET` | Render 환경변수 (print-proxy가 헤더에 추가) | ❌ 클라이언트 미노출 |
| Render 서버 URL | `NEXT_PUBLIC_RENDER_HEALTH_URL` (클라이언트 번들) | ✅ 의도적 공개 |
| AI 라우트 `/api/*` | `x-internal-secret` 헤더 검증 → 없으면 403 | ✅ 보호됨 |
| Print proxy `/print-proxy/*` | 인증 없음 (Render URL 아는 사람 누구나 호출 가능) | ⚠️ 베타 수준 허용 |

> `/print-proxy`에 별도 인증을 추가하려면, 클라이언트가 직접 Render를 호출하는 구조상 시크릿을 클라이언트 번들에 포함해야 하므로 근본적 해결이 되지 않습니다. 베타 단계에서는 현재 수준이 적절합니다.

---

## 10. Render 무료 티어 제약 및 대응

| 제약 | 내용 | 대응 |
|------|------|------|
| 슬립 | 15분 비활성 후 슬립 | `RenderWakeup` 컴포넌트가 앱 로드 시 두 서버 모두 웨이크업 (`/health`, `/print-proxy/`) |
| 웨이크업 시간 | 슬립 후 첫 요청 시 ~30초 지연 | 위 웨이크업으로 사전 대응 |
| 월 한도 | 750시간/서비스 | 서버 1개 기준 24×31=744시간으로 거의 정확히 맞음 |
| 메모리 | 512MB | Gemini 응답 스트리밍으로 메모리 최소화 |

---

## 11. 추후 작업 예정

| 작업 | 계획서 |
|------|--------|
| Canvas 사이드바에 Print 패널 추가 (이미지 삽입, 자동 생성) | `docs/exec-plans/active/260428-print-canvas-integration.md` Phase 2-5 |
| Print 생성 중 토스트 + 취소(Abort) 버튼 | `docs/exec-plans/active/260429-print-abort-toast.md` |
| Supabase DB — 캔버스 상태 영속화 | 별도 계획서 추진 (베타 이후) |

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
