# 작업지시서: 백엔드 인프라 구축 (Render + Supabase — 무료 베타)

**작성일**: 2026-04-29  
**상태**: 계획 수립 — 승인 대기  
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
[Render.com Express 서버 — 신규]
    │  Node.js, 타임아웃 없음, 512MB RAM
    │  GEMINI_API_KEY (환경변수, 클라이언트 비노출)
    │  SUPABASE_SERVICE_ROLE_KEY (환경변수, 클라이언트 비노출)
    │
    ├─→ Gemini API 호출 (타임아웃 없음)
    │
    ├─→ Supabase Storage 저장 (서버 내부 — 클라이언트 비노출)
    │       generated/{nodeId}/{timestamp}.png
    │
    └─→ 기존과 동일한 base64 응답 반환 → Vercel → Client

[Supabase — DB + Storage]
    클라이언트 직접 접근 없음 (anon 키 미노출)
    Render 서버에서만 service role 키로 접근
```

---

## 보안 모델 (로그인 없이 베타 수준 확보)

### ① Gemini API 키 보호 — ✅ 안전
- Render 서버 환경변수(Secret)에만 저장
- 클라이언트 및 Vercel 빌드 아티팩트에 절대 포함되지 않음

### ② 무단 호출 차단 — 공유 시크릿 헤더
- Vercel API Route → Render 요청 시 `x-internal-secret` 헤더 포함
- Render는 헤더가 없거나 값이 다른 요청을 403으로 거절
- **구현 조건**:
  - 시크릿은 `INTERNAL_SECRET` (NEXT_PUBLIC_ 접두사 없음) — 서버 전용 환경변수
  - 값은 32자 이상 랜덤 문자열 (`openssl rand -hex 32`)
  - 동일한 값을 Vercel 서버 env와 Render 서버 env 양쪽에 설정

### ③ Supabase 데이터 보호 — 클라이언트 직접 접근 차단
- Supabase anon 키를 클라이언트에 노출하지 않음 (NEXT_PUBLIC_ 환경변수 미사용)
- 모든 Supabase 접근은 Render 서버에서 service role 키로만 수행
- RLS 설정 불필요 (service role은 RLS 우회 — 신뢰된 서버에서만 접근하므로 안전)

---

## Phase별 구현 계획

### Phase 0: 환경 준비 (전제 조건)

**Render.com 설정**
- [ ] [render.com](https://render.com) 계정 생성
- [ ] New Web Service → GitHub 연결 또는 수동 배포 선택
- [ ] 런타임: Node.js, Region: Singapore (ap-southeast-1, 서울과 가장 가까운 무료 리전)
- [ ] Render 서버 환경변수 설정 (Dashboard → Environment)
  ```
  GEMINI_API_KEY=...
  SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...
  INTERNAL_SECRET=<openssl rand -hex 32 으로 생성>
  PORT=3001
  ```

**Supabase 설정**
- [ ] [supabase.com](https://supabase.com) 프로젝트 생성 (`cai-canvas-beta`)
- [ ] Region: Northeast Asia (Tokyo) 선택
- [ ] Project Settings → API에서 `URL`과 `service_role` 키 복사 → Render 환경변수에 입력
- [ ] Storage 버킷 생성: `generated-images` (private)
- [ ] anon 키는 클라이언트에 사용하지 않음 (복사 불필요)

**Vercel 환경변수 추가**
- [ ] Vercel Dashboard → Settings → Environment Variables
  ```
  RENDER_SERVER_URL=https://{your-app}.onrender.com
  INTERNAL_SECRET=<Render와 동일한 값>
  ```

**검증**
- [ ] Render 서버 URL로 헬스체크 확인: `GET /health → { status: 'ok' }`
- [ ] 시크릿 없는 요청 → 403 응답 확인

---

### Phase 1: Render Express 서버 구축

**목표**: 기존 Vercel API Route의 Gemini 호출 로직을 Express 서버로 이전

#### 새 파일 구조

```
render-server/                  ← 리포 루트에 신규 디렉토리
├── src/
│   ├── index.ts                ← Express 앱 진입점
│   ├── middleware/
│   │   └── verifySecret.ts     ← 공유 시크릿 검증 미들웨어
│   ├── routes/
│   │   ├── sketchToImage.ts    ← N03 Image
│   │   ├── sketchToPlan.ts     ← N02 Plan
│   │   ├── imageToElevation.ts ← N04 Elevation
│   │   ├── changeViewpoint.ts  ← N05 Viewpoint
│   │   └── planners.ts         ← N01 Planners
│   └── lib/
│       ├── geminiClient.ts     ← Gemini API 공통 클라이언트
│       ├── loadProtocol.ts     ← Protocol 파일 로드 (fs.readFileSync)
│       └── supabaseClient.ts   ← Supabase 서버 클라이언트
├── _context/                   ← project_canvas/_context symlink 또는 복사
├── package.json
└── tsconfig.json
```

#### 작업 목록

**Express 앱 기본 설정 (`render-server/src/index.ts`)**
- [ ] Express + CORS + JSON body parser 설정
  ```typescript
  import express from 'express';
  import cors from 'cors';
  import { verifySecret } from './middleware/verifySecret';

  const app = express();
  app.use(express.json({ limit: '50mb' }));   // Vercel 4.5MB 한계 해방
  app.use(cors({
    origin: [
      'https://cai-canvas.vercel.app',
      'http://localhost:3000',
    ],
  }));

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  app.use('/api', verifySecret);              // 모든 API 엔드포인트에 시크릿 검증
  app.use('/api/sketch-to-image',    sketchToImageRouter);
  app.use('/api/sketch-to-plan',     sketchToPlanRouter);
  app.use('/api/image-to-elevation', imageToElevationRouter);
  app.use('/api/change-viewpoint',   changeViewpointRouter);
  app.use('/api/planners',           plannersRouter);

  app.listen(process.env.PORT || 3001);
  ```

**공유 시크릿 미들웨어 (`render-server/src/middleware/verifySecret.ts`)**
- [ ] 헤더 검증 구현
  ```typescript
  import { Request, Response, NextFunction } from 'express';

  export function verifySecret(req: Request, res: Response, next: NextFunction) {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  }
  ```

**Protocol 파일 로드 (`render-server/src/lib/loadProtocol.ts`)**
- [ ] 기존 Vercel route.ts와 동일한 `fs.readFileSync` 방식 유지
  ```typescript
  import * as fs from 'fs';
  import * as path from 'path';

  export function loadProtocol(relativePath: string): string {
    const filePath = path.join(__dirname, '../../', relativePath);
    return fs.readFileSync(filePath, 'utf-8');
  }
  // 사용: loadProtocol('_context/sketch-to-image/protocol-sketch-to-image-v2.3.txt')
  ```

**Supabase 서버 클라이언트 (`render-server/src/lib/supabaseClient.ts`)**
- [ ] service role 키로 초기화 (클라이언트 비노출)
  ```typescript
  import { createClient } from '@supabase/supabase-js';

  export const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // anon 키 아님
  );

  export async function uploadToStorage(
    nodeId: string,
    base64: string,
    mimeType: string,
  ): Promise<void> {
    try {
      const buffer = Buffer.from(base64, 'base64');
      const timestamp = Date.now();
      await supabase.storage
        .from('generated-images')
        .upload(`${nodeId}/${timestamp}.png`, buffer, { contentType: mimeType });
    } catch {
      // Storage 저장 실패는 무시 — 응답은 항상 base64로 반환
    }
  }
  ```

**각 라우트 구현 패턴 (sketchToImage 예시)**
- [ ] `render-server/src/routes/sketchToImage.ts`
  - 기존 `project_canvas/app/api/sketch-to-image/route.ts`의 Gemini 호출 로직을 그대로 이전
  - 응답 형식 동일 유지: `{ generated_image: base64, analysis: {...} }`
  - Storage 업로드는 응답 후 백그라운드 실행 (응답 속도 영향 없음)
- [ ] 나머지 4개 라우트 동일 패턴 적용

**package.json**
- [ ] 필수 패키지 설치
  ```bash
  cd render-server
  npm init -y
  npm install express cors @supabase/supabase-js @google/generative-ai
  npm install -D typescript @types/express @types/node ts-node
  ```
- [ ] `start` 스크립트: `"start": "node dist/index.js"`
- [ ] `build` 스크립트: `"build": "tsc"`

#### 검증 체크리스트
- [ ] `GET /health` → `{ status: 'ok' }` 응답
- [ ] 시크릿 없는 POST → 403 응답
- [ ] sketch-to-image 호출 → 기존과 동일한 base64 응답
- [ ] Supabase Storage에 이미지 저장 확인 (Supabase Dashboard)

---

### Phase 2: Vercel API Route → 얇은 프록시로 교체

**목표**: Gemini 로직을 제거하고 Render 서버로 포워딩만 수행. 응답 형식 유지.

#### 작업 목록

- [ ] `project_canvas/app/api/sketch-to-image/route.ts` 교체
  ```typescript
  export async function POST(req: Request) {
    const body = await req.json();
    const url = `${process.env.RENDER_SERVER_URL}/api/sketch-to-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET!,
      },
      body: JSON.stringify(body),
    });
    return Response.json(await response.json(), { status: response.status });
  }
  ```
- [ ] 동일 패턴으로 4개 route 모두 교체
  - `app/api/sketch-to-plan/route.ts`
  - `app/api/image-to-elevation/route.ts`
  - `app/api/change-viewpoint/route.ts`
  - `app/api/planners/route.ts`

**콜드 스타트 대응 (Render 무료 티어: 15분 비활성 시 슬립)**
- [ ] `project_canvas/app/page.tsx` 또는 `layout.tsx` 에 웨이크업 요청 추가
  ```typescript
  // 앱 로드 시 Render 서버 웨이크업 (응답 기다리지 않음)
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_RENDER_HEALTH_URL}/health`).catch(() => {});
  }, []);
  ```
  - `NEXT_PUBLIC_RENDER_HEALTH_URL`: `/health` 엔드포인트는 시크릿 불필요, 클라이언트 공개 가능

#### 검증 체크리스트
- [ ] `page.tsx`, `printUtils.ts`, 모든 hook — 코드 변경 없음 확인
- [ ] Print 자동 생성 흐름 정상 동작 (base64 유지 확인)
- [ ] 60초 초과 Gemini 응답 정상 처리
- [ ] Vercel 배포 후 전체 흐름 동작 확인

---

### Phase 3: Supabase DB — 캔버스 상태 영속화 (선택, 베타 이후)

> 베타 테스트에서는 Phase 2까지만으로 충분합니다.  
> 이 Phase는 "새로고침해도 캔버스 유지"가 필요한 시점에 추가합니다.

**Supabase 테이블 스키마**
```sql
create table canvas_sessions (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null unique,
  state       jsonb not null,   -- { nodes, edges, viewport }
  updated_at  timestamptz default now()
);
```

**Render 서버에 캔버스 저장 엔드포인트 추가**
- [ ] `POST /api/canvas/save` — canvas state → Supabase DB 저장
- [ ] `GET  /api/canvas/load?sessionId=...` — Supabase DB → canvas state 반환

**Vercel API Route 추가**
- [ ] `app/api/canvas/save/route.ts` → Render 프록시
- [ ] `app/api/canvas/load/route.ts` → Render 프록시

**`project_canvas/lib/canvasSync.ts` 신규 생성**
- [ ] `saveCanvasState(sessionId, nodes, edges)` — 디바운스 5초
- [ ] `loadCanvasState(sessionId)` — 세션 시작 시 복원

---

## 파일 변경 범위 요약

| Phase | 신규 파일 | 수정 파일 | 프론트엔드 영향 |
|-------|---------|---------|--------------|
| 0 (환경 준비) | — | `.env.local`, Vercel/Render/Supabase 대시보드 설정 | **없음** |
| 1 (Render 서버) | `render-server/src/**` 9개 | — | **없음** |
| 2 (Vercel 프록시) | — | 4개 API Route, `layout.tsx` (웨이크업) | **최소** |
| 3 (Supabase DB) | `lib/canvasSync.ts`, 2개 API Route | `page.tsx` (저장 호출) | **최소** |

---

## 위험 요소

| # | 위험 | 대안 |
|---|------|------|
| 1 | Render 콜드 스타트 (15분 비활성 후 ~30초 지연) | 앱 로드 시 `/health` 웨이크업 요청 선행 |
| 2 | Render 512MB 메모리 초과 | 베타 기간에 모니터링, 초과 시 Railway 전환 ($5 무료 크레딧) |
| 3 | Protocol 파일 경로 (`_context/`) Render 번들 미포함 | `render-server/` 빌드 시 `_context/` 복사 스크립트 추가 |
| 4 | Render 무료 티어 월 750시간 제한 | 1개 서비스 기준 24시간×31일=744시간, 거의 정확히 맞음 |
| 5 | INTERNAL_SECRET 값 Vercel/Render 불일치 | Phase 0 완료 후 `/health` 호출로 먼저 검증 |

---

## 구현 우선순위

```
Phase 0 (필수, 전제)   → 계정·환경변수·버킷 설정 (코드 없음)
Phase 1 (핵심)         → Render Express 서버 구축 + Gemini 로직 이전
Phase 2 (핵심)         → Vercel Route 프록시화 + 웨이크업 추가
Phase 3 (선택)         → Supabase DB 캔버스 영속화 (베타 이후)
```

**의존성**: Phase 0 → Phase 1 → Phase 2 → (선택) Phase 3

---

## 완료 기준

- [ ] Render 서버 `/health` 엔드포인트 응답 확인
- [ ] 시크릿 없는 요청 → 403 차단 확인
- [ ] sketch-to-image 60초 초과 처리 정상 완료
- [ ] 5MB 초과 이미지 입출력 정상 동작
- [ ] Supabase Storage에 생성 결과물 저장 확인
- [ ] 프론트엔드 코드(`page.tsx`, `printUtils.ts`, 모든 hook) 변경 없이 정상 동작
- [ ] Print 자동 생성 흐름 이상 없음 (base64 유지 확인)
- [ ] Vercel 배포 후 전체 흐름 E2E 동작 확인

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
