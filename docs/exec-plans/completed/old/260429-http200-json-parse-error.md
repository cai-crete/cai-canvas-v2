# 작업지시서: "서버 응답 처리 오류 (HTTP 200)" 수정

**작성일**: 2026-04-29  
**상태**: 분석 완료, 구현 대기  
**요청자**: baejitong5294@gmail.com  
**증상**: Print 생성 시 "서버 응답 처리 오류 (HTTP 200)" 에러 발생  

---

## 증상 재현 경로

```
사용자 브라우저
  → POST ${NEXT_PUBLIC_RENDER_HEALTH_URL}/print-proxy/api/print
  → [Canvas Vercel] /api/print-proxy/api/print/route.ts
  → [Render B] /api/print (실제 print 서버)
```

1. Render B가 `200 OK` + gzip 압축된 JSON 반환  
2. Canvas proxy가 응답을 받아 브라우저로 전달  
3. 브라우저에서 `JSON.parse` 실패 → "서버 응답 처리 오류 (HTTP 200)"

---

## 근본 원인 분석

### 문제: content-length 불일치

`project_canvas/app/api/print-proxy/api/print/route.ts` (현재 코드):

```typescript
const responseBody = await upstream.arrayBuffer();   // ← 압축 해제된 본문 (M bytes)

const resHeaders = new Headers(upstream.headers);    // ← content-length: N (압축된 크기, N < M)
resHeaders.delete('content-encoding');               // ← gzip 헤더만 제거, content-length는 그대로
// content-length가 N인 채로 M bytes 본문을 전송!
return new NextResponse(responseBody, {
  status:  upstream.status,
  headers: resHeaders,
});
```

**Node.js `fetch()`의 동작**:
- `fetch()`는 gzip 응답을 자동으로 압축 해제해서 `arrayBuffer()`로 반환
- 단, `upstream.headers`의 `content-length`는 **압축 전 크기(N)** 그대로 유지
- `content-encoding: gzip`만 지우면 → 브라우저는 "이 응답은 gzip 아님, 크기는 N bytes"로 인식
- 실제 본문은 M bytes (N < M) → 브라우저가 N bytes만 읽고 연결 종료 → JSON 잘림

**왜 HTTP 200인데 에러가 나는가**:
- Render B는 정상적으로 `200 OK` + 완전한 JSON 반환
- 문제는 proxy가 헤더를 잘못 전달해서 클라이언트가 JSON을 잘라 읽음
- `Print_ExpandedView.tsx`의 `JSON.parse(responseText)` → 잘린 JSON → SyntaxError → "서버 응답 처리 오류 (HTTP 200)"

### 왜 content-encoding이 없는 경우(비압축)에는 괜찮은가

작은 응답(1~2KB)이거나 Render B가 gzip을 보내지 않는 경우에는 N == M이므로 문제없음.  
실제 print 응답(이미지 URL + 긴 JSON)은 수십 KB → gzip 압축률 높음 → N과 M 차이 큼.

---

## 수정 계획

### Fix A: print-proxy 헤더 수정 (핵심 수정)

**파일**: `project_canvas/app/api/print-proxy/api/print/route.ts`

**현재 코드** (line 69–70):
```typescript
const resHeaders = new Headers(upstream.headers);
resHeaders.delete('content-encoding');
```

**수정 코드**:
```typescript
const resHeaders = new Headers(upstream.headers);
resHeaders.delete('content-encoding');
resHeaders.delete('transfer-encoding');
resHeaders.set('content-length', String(responseBody.byteLength));
```

**변경 이유**:
- `content-length`: 압축 해제된 실제 본문 크기(M)로 재설정
- `transfer-encoding`: chunked 헤더가 남아 있으면 content-length와 충돌 가능 → 삭제
- `content-encoding`은 이미 삭제 중

**부작용 위험**: 없음. 버퍼링된 본문의 실제 크기로 헤더를 맞추는 표준적인 프록시 처리.

---

### Fix B: 오류 메시지 개선 (선택적, 진단 목적)

**파일**: `cai-harness-print/project.10_print/components/Print_ExpandedView.tsx`

**현재 코드** (catch 블록):
```typescript
throw new Error(`서버 응답 처리 오류 (HTTP ${res.status}). 잠시 후 재시도해 주세요.`)
```

**수정 코드**:
```typescript
throw new Error(`서버 응답 처리 오류 (HTTP ${res.status}): ${responseText.slice(0, 100)}`)
```

**이유**: 오류 발생 시 응답 앞부분을 보여줘서 JSON 잘림 여부를 사용자/개발자가 바로 확인 가능.  
**참고**: Fix B는 선택 사항. Fix A가 적용되면 이 에러 자체가 발생하지 않아 불필요할 수 있음.

---

## 실행 순서

### Step 1: Fix A 적용 (Canvas repo만)

- [ ] `project_canvas/app/api/print-proxy/api/print/route.ts` 수정 (3줄 추가)
- [ ] 커밋 + `git push cai-canvas-v2 main`
- [ ] Vercel 자동 재배포 확인

### Step 2: 검증

- [ ] `cai-canvas-v2.vercel.app`에서 PANEL 모드 Print 생성 테스트
- [ ] "서버 응답 처리 오류 (HTTP 200)" 미발생 확인
- [ ] 정상 PDF 생성 확인

### Step 3 (선택): Fix B 적용

Fix A 이후에도 동일 오류가 재발하면 Fix B 적용:
- [ ] `Print_ExpandedView.tsx` 오류 메시지 수정
- [ ] 버전 `0.1.2` → `0.1.3` bump
- [ ] `npm publish` (GitHub Packages)
- [ ] canvas: `npm install @cai-crete/print-components@0.1.3`
- [ ] 커밋 + `git push cai-canvas-v2 main`

---

## 검증 기준

성공:
- PANEL 모드 Print 생성 → PDF 파일 정상 다운로드
- "서버 응답 처리 오류" 미발생

실패 시 추가 확인:
- Vercel 함수 로그: `[print-bff] ◀ 200 (Nms, Nbytes)` 에서 bytes 수 확인
- 만약 `0 bytes`이면 다른 원인 가능

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
