# 작업지시서: Firebase 백엔드 인프라 구축

**작성일**: 2026-04-28  
**최종 업데이트**: 2026-04-29 (상태 변경 — 보류)  
**상태**: ⏸️ 보류 — Firebase Functions 2nd gen이 유료 플랜(Blaze) 필수임을 확인, 현재 유료 플랜 사용 불가  
**대안**: `docs/exec-plans/active/260429-render-supabase-backend-infra.md` 참조  
**요청자**: baejitong5294@gmail.com  
**목적**: Vercel 한계(이미지 용량, 로드 타임) 극복 — 로그인 없이 인프라만 구축

> **⏸️ 이 계획서는 보류 상태입니다.**  
> Firebase Functions 2nd gen(타임아웃 300초, 메모리 4GB)은 Blaze(종량제) 플랜에서만 사용 가능합니다.  
> 유료 플랜 사용이 가능해지는 시점에 재개할 수 있도록 내용은 보존합니다.  
> 현재는 무료로 동일한 목표를 달성하는 **Render + Supabase 대안 계획서**로 진행합니다.

---

## 문제 정의

| 한계 | 현상 | Vercel 제한값 |
|------|------|--------------|
| 이미지 용량 | Gemini 응답 base64 이미지가 API Route body를 초과 | 요청 body 4.5MB, 응답 4.5MB |
| 로드 타임 | 무거운 이미지 처리 + AI 호출이 타임아웃 발생 | Hobby 10초, Pro 60초 |
| 메모리 | Node.js 함수에서 Sharp + base64 디코딩 OOM 위험 | 1024MB |
| 파일 저장 | 생성된 이미지 결과물을 서버에 보관 불가 (현재 IndexedDB에 의존) | 상태 없음(Stateless) |

---

## 핵심 설계 원칙 — 프론트엔드 코드 무변경

> **API 응답 형식(base64)은 절대 바꾸지 않는다.**

현재 `generatedImageData`, `thumbnailData`는 `page.tsx` 전체에서 8군데 이상 사용되며,
`printUtils.ts`의 `nodeImageToSelectedImage()`는 `raw.startsWith('data:')` 로직으로 동작한다.
응답 형식을 URL로 바꾸면 Print 자동 생성이 포함한 모든 hook과 component가 연쇄 파괴된다.

**Firebase는 서버(Functions) 내부에서만 사용한다. 클라이언트는 기존과 동일하게 base64를 받는다.**

```
[현재]
Client → Vercel API Route → Gemini → base64 응답 → Client

[변경 후 — 프론트엔드 변화 없음]
Client → Vercel API Route (얇은 프록시) → Firebase Functions → Gemini
                                                    ↓ (서버 내부)
                                          Firebase Storage에 저장 (클라이언트 비노출)
                                                    ↓
                                          기존과 동일한 base64 응답 → Client
```

클라이언트 코드(`page.tsx`, `printUtils.ts`, 모든 hook, 모든 component)는 한 줄도 바뀌지 않는다.

---

## 아키텍처

```
[Client: Next.js / Vercel — 변경 없음]
      │
      │ 기존과 동일한 base64 요청/응답
      ▼
[Vercel API Route — 얇은 프록시로 변환]
      │
      │ JSON 포워딩
      ▼
[Firebase Functions 2nd gen — 신규]     ←── GEMINI_API_KEY (서버 환경변수)
      │
      ├─ Gemini API 호출 (타임아웃 300초, 메모리 4GB)
      │
      ├─ Firebase Storage 저장 (서버 내부 — 클라이언트 비노출)
      │     gs://{bucket}/generated/{nodeId}/{timestamp}.png
      │
      └─ 기존과 동일한 base64 응답 반환 → Vercel → Client

[Firestore — Phase 3, 선택]
      └─ 캔버스 상태 영속화 (익명 세션 ID 기반)
```

---

## Vercel vs Firebase Functions 비교

| 항목 | Vercel Pro | Firebase Functions 2nd gen |
|------|-----------|--------------------------|
| 타임아웃 | 최대 60초 | 최대 60분 |
| 메모리 | 1GB | 최대 16GB |
| CPU | 1 vCPU | 최대 8 vCPU |
| 요청 크기 | 4.5MB | 32MB |
| 응답 크기 | 4.5MB | 32MB |
| Cold Start | 있음 (잦음) | `minInstances: 1`로 제거 가능 |

---

## Phase별 구현 계획

### Phase 0: Firebase 프로젝트 초기화 (전제 조건)

**목표**: Firebase 프로젝트 생성 + SDK 설치 + 환경변수 연결

#### 작업 목록

- [ ] Firebase Console에서 프로젝트 생성 (`cai-canvas-prod`)
- [ ] Firebase CLI 설치 및 로그인
  ```bash
  npm install -g firebase-tools
  firebase login
  ```
- [ ] 리포 루트에서 Firebase 초기화 (Functions + Storage만 — Firestore는 Phase 3)
  ```bash
  firebase init functions storage
  # Functions: Node.js 20, TypeScript, us-central1
  # Storage: 기본 버킷
  ```
- [ ] Firebase Admin SDK 패키지 설치 (Functions 전용)
  ```bash
  cd functions
  npm install firebase-admin @google/generative-ai
  npm install -D typescript @types/node
  ```
- [ ] `project_canvas/` 에 Firebase 클라이언트 패키지 설치 (Phase 3 Firestore용, 지금은 미사용)
  ```bash
  cd project_canvas
  npm install firebase
  ```
- [ ] `project_canvas/.env.local` 환경변수 추가
  ```env
  # 기존 유지
  GEMINI_API_KEY=...

  # 신규 — Vercel이 Functions로 포워딩할 URL
  FIREBASE_FUNCTIONS_URL=https://asia-northeast3-cai-canvas-prod.cloudfunctions.net
  # 또는 로컬 에뮬레이터: http://localhost:5001/cai-canvas-prod/asia-northeast3
  ```
- [ ] `.env.local.example` 업데이트

#### 검증
- `firebase projects:list`에서 프로젝트 확인
- `firebase emulators:start --only functions,storage`로 로컬 에뮬레이터 정상 동작 확인

---

### Phase 1: Firebase Functions — Gemini 호출 이전

**목표**: Gemini API 호출을 Vercel 서버리스에서 Firebase Functions으로 이전. 응답 형식 유지.

#### 새 파일 구조

```
functions/
├── src/
│   ├── index.ts                    ← Functions 진입점 (export)
│   ├── handlers/
│   │   ├── sketchToImage.ts        ← N03 Image
│   │   ├── sketchToPlan.ts         ← N02 Plan
│   │   ├── imageToElevation.ts     ← N04 Elevation
│   │   ├── changeViewpoint.ts      ← N05 Viewpoint
│   │   └── planners.ts             ← N01 Planners
│   └── lib/
│       ├── geminiClient.ts         ← Gemini API 공통 클라이언트
│       ├── storageUpload.ts        ← Storage 내부 저장 (클라이언트 비노출)
│       └── loadProtocol.ts         ← Protocol 파일 로드
├── package.json
└── tsconfig.json
```

#### 작업 목록

**Functions 공통 설정 (`functions/src/index.ts`)**
- [ ] 모든 핸들러 export + 공통 옵션 설정
  ```typescript
  import { onRequest } from 'firebase-functions/v2/https';
  import { sketchToImageHandler } from './handlers/sketchToImage';
  // ... 나머지 import

  const commonOptions = {
    region: 'asia-northeast3',  // 서울 리전
    memory: '4GiB' as const,
    timeoutSeconds: 300,
    cors: [
      'https://cai-canvas.vercel.app',
      'http://localhost:3000',
    ],
    minInstances: 1,            // Cold Start 방지
  };

  export const sketchToImage    = onRequest(commonOptions, sketchToImageHandler);
  export const sketchToPlan     = onRequest(commonOptions, sketchToPlanHandler);
  export const imageToElevation = onRequest(commonOptions, imageToElevationHandler);
  export const changeViewpoint  = onRequest(commonOptions, changeViewpointHandler);
  export const planners         = onRequest(commonOptions, plannersHandler);
  ```

**Protocol 파일 로드 (`functions/src/lib/loadProtocol.ts`)**
- [ ] 현재 Vercel API Route는 `fs.readFileSync`로 `_context/` 폴더에서 Protocol을 로드함
- [ ] Functions에서는 배포 시 Protocol 파일을 Functions 번들에 포함하거나 Storage에 업로드
  - **방법 A (간단)**: `functions/` 빌드 시 `project_canvas/**/_context/` 파일을 Functions 번들에 포함
  - **방법 B (확장)**: Protocol 파일을 Firebase Storage에 업로드, Functions에서 URL로 로드
  - **→ Phase 1에서는 방법 A 선택** (단순, Storage 의존성 없음)
  ```typescript
  import * as fs from 'fs';
  import * as path from 'path';

  export function loadProtocol(nodeName: string, version: string): string {
    const filePath = path.join(__dirname, `../_context/protocol-${nodeName}-${version}.txt`);
    return fs.readFileSync(filePath, 'utf-8');
  }
  ```

**각 핸들러 구현 패턴 (sketchToImage 예시)**
- [ ] `functions/src/handlers/sketchToImage.ts`
  ```typescript
  import type { Request, Response } from 'firebase-functions/v2/https';
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { loadProtocol } from '../lib/loadProtocol';
  import { uploadToStorage } from '../lib/storageUpload';

  export async function sketchToImageHandler(req: Request, res: Response) {
    // 1. 기존 Vercel route와 동일한 입력 검증
    const { sketch_image, params, nodeId } = req.body;
    if (!sketch_image) { res.status(400).json({ error: 'sketch_image is required' }); return; }

    // 2. Protocol 로드 (기존과 동일)
    const protocol = loadProtocol('sketch-to-image', 'v2.3');
    const systemPrompt = buildSystemPrompt(protocol);

    // 3. Gemini API 호출 (기존 route.ts 로직 이전)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    // ... 기존 Gemini 호출 로직 동일하게 이전

    const generatedBase64 = /* Gemini 응답에서 추출 */;

    // 4. Storage에 저장 (서버 내부 — 클라이언트에 URL 노출 안 함)
    await uploadToStorage(nodeId, generatedBase64, 'image/png');  // 실패해도 무시

    // 5. 기존과 동일한 base64 응답 반환 ← 이것이 핵심
    res.json({ generated_image: generatedBase64, analysis: /* ... */ });
  }
  ```

**Storage 내부 저장 유틸 (`functions/src/lib/storageUpload.ts`)**
- [ ] 클라이언트에 URL 노출 없이 서버 내부 저장만
  ```typescript
  import { getStorage } from 'firebase-admin/storage';

  export async function uploadToStorage(
    nodeId: string,
    base64: string,
    mimeType: string
  ): Promise<void> {
    try {
      const bucket = getStorage().bucket();
      const buffer = Buffer.from(base64, 'base64');
      const timestamp = Date.now();
      const file = bucket.file(`generated/${nodeId}/${timestamp}.png`);
      await file.save(buffer, { contentType: mimeType });
    } catch {
      // Storage 저장 실패는 무시 — 응답은 항상 base64로 반환
    }
  }
  ```

**Vercel API Route → 얇은 프록시로 교체**
- [ ] 기존 route.ts 파일들의 Gemini 로직을 Functions 호출로 교체
- [ ] 응답 형식은 기존과 동일 (프론트엔드 변경 없음)

  ```typescript
  // project_canvas/app/api/sketch-to-image/route.ts (변경 후)
  export async function POST(req: Request) {
    const body = await req.json();
    const url = `${process.env.FIREBASE_FUNCTIONS_URL}/sketchToImage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Functions 응답을 그대로 클라이언트에 전달 (base64 포함)
    return Response.json(await response.json(), { status: response.status });
  }
  ```

- [ ] 동일 패턴으로 4개 route 모두 교체
  - `app/api/sketch-to-plan/route.ts`
  - `app/api/image-to-elevation/route.ts`
  - `app/api/change-viewpoint/route.ts`
  - `app/api/planners/route.ts`

#### 검증 체크리스트
- [ ] 기존 API 응답 형식(`generated_image`, `aepl`, `analysis` 등) 동일 유지 확인
- [ ] `page.tsx` 코드 변경 없이 정상 동작
- [ ] `printUtils.ts` `nodeImageToSelectedImage()` 정상 동작 (base64 그대로)
- [ ] Print 자동 생성 흐름 이상 없음
- [ ] 60초 초과 AI 처리 정상 완료 (타임아웃 없음)
- [ ] Firebase Storage에 결과물 저장 확인 (Firebase Console에서)

---

### Phase 2: Storage 보안 규칙 설정

**목표**: Phase 1에서 저장된 Storage 데이터에 대한 접근 규칙 수립

#### Storage 버킷 구조

```
gs://{bucket}/
└── generated/
    └── {nodeId}/
        └── {timestamp}.png     ← 서버가 저장, 클라이언트 직접 접근 불필요
```

#### 보안 규칙 (`storage.rules`)
- [ ] 쓰기는 서버(Admin SDK)만 허용, 읽기는 당분간 비공개

  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /generated/{nodeId}/{fileName} {
        // 서버(Admin SDK)만 쓰기 가능 — 클라이언트 직접 쓰기 차단
        allow write: if false;
        // 읽기: 로그인 구현 전까지 비공개 (서버 통해서만 접근)
        allow read:  if false;
      }
    }
  }
  ```

#### 검증
- 클라이언트에서 Storage URL로 직접 접근 시 거부됨
- Firebase Admin SDK(Functions)에서 정상 저장됨

---

### Phase 3: Firestore — 캔버스 상태 영속화 (선택적)

**목표**: 현재 localStorage/IndexedDB 의존 구조를 Firestore로 보완하여 기기 간 동기화 지원

> **이 Phase는 로그인 구현 전에도 익명 세션 ID 기반으로 동작 가능.**  
> 로그인 연동 시 세션 ID를 사용자 UID로 교체만 하면 됨.

#### 현재 상태 저장 구조

| 데이터 | 현재 저장소 | 문제 |
|--------|-----------|------|
| 캔버스 노드/엣지 상태 | React state | 새로고침 시 소실 |
| 생성된 이미지 (base64) | IndexedDB (`lib/imageDB.ts`) | 기기 간 공유 불가 |
| Print 결과물 (HTML) | IndexedDB | 동일 |

#### Firestore 스키마

```
/sessions/{sessionId}/
└── canvas/
    └── state    ← { nodes: [...], edges: [...], viewport: {...} }
```

#### 작업 목록

**`project_canvas/lib/firebase.ts` 신규 생성**
- [ ] 클라이언트 SDK 초기화 (Firestore 전용)
  ```typescript
  import { initializeApp, getApps } from 'firebase/app';
  import { getFirestore } from 'firebase/firestore';

  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  export const db = getFirestore(app);
  ```

**`project_canvas/lib/canvasSync.ts` 신규 생성**
- [ ] `saveCanvasState(sessionId, nodes, edges)` — 디바운스 5초
- [ ] `loadCanvasState(sessionId)` — 세션 시작 시 복원

**`project_canvas/.env.local` 환경변수 추가**
  ```env
  NEXT_PUBLIC_FIREBASE_API_KEY=...
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
  NEXT_PUBLIC_FIREBASE_APP_ID=...
  ```

**Firestore 보안 규칙 (`firestore.rules`)**
- [ ] 익명 세션 기반 임시 개방 (로그인 구현 후 즉시 교체)
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /sessions/{sessionId}/{document=**} {
        allow read, write: if true;  // 임시 개방 — 로그인 후 세션 ID 검증으로 교체
      }
    }
  }
  ```

#### 검증
- 새로고침 후 캔버스 상태 복원
- Firestore 콘솔에서 노드 데이터 확인

---

## 마이그레이션 전략 (무중단)

```
Phase 0 (초기화)
  └─ Firebase 프로젝트·CLI·환경변수 설정 → 아직 아무것도 바뀌지 않음

Phase 1 (Functions 이전)
  └─ Vercel route → Firebase Functions 프록시로 교체
  └─ 프론트엔드 코드 0줄 변경 / 응답 형식 동일
  └─ Storage에 결과물 백그라운드 저장 (클라이언트 비노출)

Phase 2 (Storage 보안)
  └─ 보안 규칙만 설정 → 코드 변경 없음

Phase 3 (Firestore 선택)
  └─ canvasSync.ts 추가, page.tsx에 5초 디바운스 저장 연결
  └─ 기존 IndexedDB 방식 병행 유지 (교체 아닌 보완)
```

---

## 파일 변경 범위 요약

| Phase | 신규 파일 | 수정 파일 | 프론트엔드 영향 |
|-------|---------|---------|--------------|
| 0 (초기화) | — | `.env.local` | **없음** |
| 1 (Functions) | `functions/src/**` 6개 | 4개 API Route (프록시화) | **없음** (응답 형식 유지) |
| 2 (Storage 규칙) | `storage.rules` | — | **없음** |
| 3 (Firestore) | `lib/firebase.ts`, `lib/canvasSync.ts`, `firestore.rules` | `page.tsx` (저장 호출 추가) | **최소** (기능 추가만) |

---

## 위험 요소

| # | 위험 | 대안 |
|---|------|------|
| 1 | Protocol 파일이 Functions 번들에 포함되지 않음 | `firebase.json`의 `functions.ignore`에서 `_context/` 제외 확인 |
| 2 | Firebase Functions Cold Start (최초 요청 지연) | `minInstances: 1` 설정 |
| 3 | Vercel → Functions 네트워크 홉 추가로 지연 증가 | 서울 리전(`asia-northeast3`) 선택으로 최소화 |
| 4 | Functions 호출 실패 시 클라이언트에서 오류 처리 | Vercel route에서 Functions 오류를 기존과 동일한 형식으로 래핑 |
| 5 | Firestore 규칙 임시 개방 (Phase 3) | 로그인 구현 후 즉시 세션 ID 검증으로 교체 |

---

## 구현 우선순위

```
Phase 0 (필수, 전제)        → Firebase 프로젝트·CLI·환경변수
Phase 1 (핵심, 빠름)        → Functions 이전 — 타임아웃·메모리·용량 문제 한 번에 해결
Phase 2 (필수, 빠름)        → Storage 보안 규칙
Phase 3 (선택, 천천히)      → Firestore 동기화 — 로그인 구현 전 준비
```

**의존성**: Phase 0 → Phase 1 → Phase 2 → Phase 3 (순차)

---

## 완료 기준

- [ ] Firebase 프로젝트 생성 및 CLI 로그인 완료
- [ ] Firebase Functions에서 Gemini 호출 정상 동작
- [ ] Vercel API Route가 Functions 프록시로 교체됨
- [ ] 프론트엔드 코드(`page.tsx`, `printUtils.ts`, 모든 hook) 변경 없이 정상 동작
- [ ] Print 자동 생성 흐름 이상 없음 (base64 유지 확인)
- [ ] Firebase Storage에 생성 결과물 저장 확인
- [ ] 60초 초과 처리 작업 정상 완료
- [ ] 로컬 에뮬레이터(`firebase emulators:start`)에서 전체 흐름 동작 확인

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
