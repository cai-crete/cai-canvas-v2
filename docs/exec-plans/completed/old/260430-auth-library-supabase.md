# 작업지시서: 로그인/회원가입 + 유저별 라이브러리 구축

**작성일**: 2026-04-30  
**상태**: 계획 수립 — 승인 대기  
**요청자**: bzoo08208@gmail.com  
**목적**: Supabase Auth 연동, 유저별 생성물 아카이빙, LIBRARY 모달 UI 구축  
**전제 완료**: Render 서버 구축, Supabase DB/Storage/RLS 설정, 환경변수 세팅

---

## 핵심 설계 원칙

- **기존 코드 최소 변경** — `page.tsx`, `printUtils.ts`, 모든 hook의 핵심 로직 불변
- **디자인 시스템 준수** — 7색 그레이스케일, Bebas Neue + Pretendard, 8px 그리드
- **점진적 데이터 축적** — 로그인 전 생성된 데이터는 저장 안 됨 (익명 사용자 무시)

---

## 라이브러리 탭 ↔ 데이터 타입 매핑

| 탭 | 하위 탭 | `generated_images.type` 값 |
|----|--------|--------------------------|
| SKETCH | — | `'sketch'` |
| IMAGE | — | `'sketch-to-image'` \| `'elevation'` \| `'viewpoint'` |
| DOCUMENT | REPORT | `'print-report'` |
| DOCUMENT | PANEL L | `'print-panel-l'` |
| DOCUMENT | PANEL P | `'print-panel-p'` |
| DOCUMENT | DRAWING | `'print-drawing'` |
| VIDEO | — | `'video'` (추후) |

---

## Phase별 구현 계획

### Phase 1: Supabase Auth + 헤더 버튼

**목표**: 로그인/회원가입 모달 + 헤더 우측 LOGIN·LIBRARY 버튼

#### 신규 파일

```
project_canvas/
├── lib/supabaseClient.ts          ← 클라이언트용 anon key 인스턴스
├── contexts/AuthContext.tsx       ← 세션 상태 전역 관리
└── components/AuthModal.tsx       ← 로그인/회원가입 모달
```

#### 수정 파일

- `app/layout.tsx` — `<AuthProvider>` 래핑
- `app/page.tsx` — Header에 우측 버튼 영역 추가

#### 헤더 변경 내용 (page.tsx Header 컴포넌트)

```tsx
// 기존: 타이틀만 있음
// 변경: 우측에 LIBRARY + LOGIN/USER 버튼 추가
<header ...>
  <span>CAI  CANVAS</span>
  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
    <button onClick={() => setLibraryOpen(true)}>LIBRARY</button>
    <button onClick={() => setAuthOpen(true)}>
      {user ? user.email?.split('@')[0] : 'LOGIN'}
    </button>
  </div>
</header>
```

#### AuthModal 설계

- 탭 전환: LOGIN / SIGN UP
- 입력: email + password
- Bebas Neue 탭, Pretendard 입력 필드
- 너비: 400px 고정, 배경 딤처리 오버레이
- 오류 메시지: 하단 인라인 표시

#### supabaseClient.ts

```typescript
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
```

#### 검증 체크리스트

- [ ] 회원가입 → 이메일 확인 없이 즉시 로그인 (Supabase Auth 설정: Email confirm OFF)
- [ ] 로그인 후 헤더 버튼이 유저 이름으로 바뀜
- [ ] 로그아웃 후 'LOGIN'으로 복귀
- [ ] 페이지 새로고침 후 세션 유지

---

### Phase 2: Library Modal UI Shell

**목표**: 탭 구조 + 썸네일 그리드 레이아웃 (데이터 없이 UI만)

#### 신규 파일

```
project_canvas/
└── components/LibraryModal.tsx    ← 라이브러리 전체 모달
```

#### 수정 파일

- `app/page.tsx` — `libraryOpen` state + `<LibraryModal>` 마운트

#### LibraryModal 설계

```
┌─────────────────────────────────────────────────────┐
│  LIBRARY                                        [X]  │  ← Bebas Neue 24px
│                                                      │
│  [SKETCH]  [IMAGE]  [DOCUMENT]  [VIDEO]              │  ← 탭 44px, Bebas Neue
│  (DOCUMENT 선택 시 하위 탭 표시)                       │
│  [REPORT] [PANEL L] [PANEL P] [DRAWING]              │  ← 하위 탭 36px
│                                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│  │thumb │ │thumb │ │thumb │ │thumb │               │  ← 160×120px 썸네일
│  └──────┘ └──────┘ └──────┘ └──────┘               │
│                                                      │
│  (비어있을 때: "아직 저장된 항목이 없습니다." 안내)        │
└─────────────────────────────────────────────────────┘
```

- 모달 크기: `80vw × 80vh`, 최소 `800px × 600px`
- 오버레이: `rgba(0,0,0,0.5)`
- 탭 활성: `border-bottom: 2px solid #000`
- 썸네일 그리드: `grid-template-columns: repeat(auto-fill, 160px)`, gap 16px
- 썸네일 카드: 160×120px, 배경 `#EEEEEE`, 하단에 타입 레이블

#### 검증 체크리스트

- [ ] 헤더 LIBRARY 버튼 → 모달 열림/닫힘
- [ ] 4개 탭 전환 정상
- [ ] DOCUMENT 탭 → 하위 탭 4개 표시
- [ ] 빈 상태 메시지 표시

---

### Phase 3: 데이터 연결 — 저장 + 조회

**목표**: 생성 시 Supabase DB 저장, 라이브러리에서 유저 데이터 조회

#### 3-A: Render 서버 — JWT 기반 user_id 추출 + DB 저장

**수정 파일**

- `render-server/src/lib/supabaseUpload.ts`
  - `uploadToStorage(nodeId, base64, mimeType, userId?, type?)` 파라미터 확장
  - `generated_images` 테이블 insert 추가

- `render-server/src/routes/sketchToImage.ts` (및 나머지 4개 라우트)
  - `Authorization` 헤더에서 JWT 추출
  - `supabase.auth.getUser(token)` → `user.id` 획득
  - `uploadToStorage(nodeId, base64, mimeType, userId, 'sketch-to-image')` 호출

#### 3-B: Vercel API Proxy — Authorization 헤더 포워딩

**수정 파일** (5개 route.ts)

```typescript
// 기존
headers: { 'Content-Type': 'application/json', 'x-internal-secret': ... }

// 변경 (Authorization 헤더 추가)
const authHeader = req.headers.get('Authorization') ?? '';
headers: {
  'Content-Type': 'application/json',
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  ...(authHeader && { 'Authorization': authHeader }),
}
```

#### 3-C: 프론트엔드 — API 요청에 JWT 포함

**수정 파일**: `app/page.tsx` (AI 생성 요청 함수들)

```typescript
const session = await supabase.auth.getSession();
const token = session.data.session?.access_token;
// fetch('/api/sketch-to-image', { headers: { Authorization: `Bearer ${token}` } })
```

#### 3-D: LibraryModal — Supabase 직접 조회

```typescript
const { data } = await supabase
  .from('generated_images')
  .select('*')
  .eq('type', currentType)
  .order('created_at', { ascending: false });
```

#### 검증 체크리스트

- [ ] 로그인 상태에서 이미지 생성 → Supabase `generated_images` 테이블에 행 추가 확인
- [ ] 비로그인 상태에서 생성 → DB 저장 없이 정상 동작 (기존과 동일)
- [ ] 라이브러리 열면 본인 생성 이미지 썸네일 표시
- [ ] 다른 유저 데이터 보이지 않음 (RLS 검증)

---

### Phase 4: Library → Canvas 드래그 앤 드랍

**목표**: 라이브러리 썸네일을 캔버스에 드래그하면 노드 생성

#### 드래그 데이터 구조

```typescript
interface LibraryDragData {
  source: 'library';
  imageType: NodeType;       // 'image' | 'sketch' | 'print' 등
  storage_path: string;      // Supabase Storage 경로
  base64?: string;           // 썸네일 미리보기 (선택)
}
```

#### HTML5 Drag API 활용

**LibraryModal.tsx — 썸네일에 draggable 적용**

```tsx
<div
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('application/cai-library', JSON.stringify(dragData));
  }}
>
```

**page.tsx — 캔버스 영역에 drop 핸들러 추가**

```tsx
onDrop={(e) => {
  const raw = e.dataTransfer.getData('application/cai-library');
  if (!raw) return;
  const data = JSON.parse(raw) as LibraryDragData;
  const worldPos = screenToWorld(e.clientX, e.clientY, scale, offset);
  createNodeFromLibrary(data, worldPos);  // 신규 함수
}}
onDragOver={(e) => e.preventDefault()}
```

#### createNodeFromLibrary 로직

- Storage path에서 Supabase `getPublicUrl()` 또는 `createSignedUrl()` 로 이미지 URL 획득
- `generatedImageData`에 base64 또는 URL 세팅
- `artboardType: 'image'`, `hasThumbnail: true` 설정
- `pushHistory()` 호출하여 undo 지원

#### 검증 체크리스트

- [ ] 라이브러리 썸네일 → 캔버스 드래그 시 드래그 커서 표시
- [ ] 드랍 위치에 노드 생성 (280×198px 카드)
- [ ] 생성된 노드에 이미지 정상 표시
- [ ] Undo(Ctrl+Z)로 노드 제거 가능
- [ ] 라이브러리 모달이 열린 상태에서도 드랍 가능

---

## 파일 변경 범위 요약

| Phase | 신규 파일 | 수정 파일 | 범위 |
|-------|---------|---------|------|
| 1 (Auth) | `lib/supabaseClient.ts`, `contexts/AuthContext.tsx`, `components/AuthModal.tsx` | `app/layout.tsx`, `app/page.tsx` (Header만) | 소 |
| 2 (Library Shell) | `components/LibraryModal.tsx` | `app/page.tsx` (state + mount) | 소~중 |
| 3 (데이터 연결) | — | Render 5개 route, Vercel 5개 route, `supabaseUpload.ts`, `LibraryModal.tsx`, `page.tsx` | 중 |
| 4 (DnD) | — | `LibraryModal.tsx`, `page.tsx` | 소 |

---

## 위험 요소

| # | 위험 | 대안 |
|---|------|------|
| 1 | Supabase Storage signed URL 만료 (라이브러리 썸네일 깨짐) | `createSignedUrl(3600)` 1시간 갱신, 또는 `generatedImageData` base64를 DB에 함께 저장 |
| 2 | JWT 만료 중 AI 생성 시 user_id 획득 실패 | user_id null이면 저장 스킵 (비로그인과 동일 처리) |
| 3 | `page.tsx` onDrop 이벤트가 기존 캔버스 DnD와 충돌 | `dataTransfer` 타입 체크로 구분 (`application/cai-library` 커스텀 MIME) |
| 4 | Supabase `@supabase/ssr` 패키지 미설치 | `npm install @supabase/ssr` Phase 1 시작 전 실행 |

---

## 구현 우선순위

```
Phase 1 (Auth)          → 헤더 버튼 + 로그인 모달
Phase 2 (Library Shell) → UI 완성 (데이터 없이)
Phase 3 (데이터 연결)    → 저장 + 조회 연동
Phase 4 (DnD)           → 라이브러리 → 캔버스
```

**의존성**: Phase 1 → Phase 2 → Phase 3 → Phase 4

---

## 완료 기준

- [ ] 로그인/회원가입 정상 동작, 세션 새로고침 유지
- [ ] 헤더 LIBRARY 버튼 → 모달 오픈
- [ ] SKETCH / IMAGE / DOCUMENT(4 하위 탭) / VIDEO 탭 전환
- [ ] 로그인 후 AI 생성 → 라이브러리에 썸네일 자동 등록
- [ ] 다른 유저 데이터 접근 불가 (RLS 검증)
- [ ] 라이브러리 썸네일 → 캔버스 드래그 앤 드랍 → 노드 생성
- [ ] 7색 그레이스케일, Bebas Neue + Pretendard 디자인 시스템 준수
- [ ] 기존 AI 생성 흐름 (비로그인 포함) 이상 없음

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
