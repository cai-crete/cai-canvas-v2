# GENERATE 버튼 413 오류 근본 원인 및 해결 계획서

작성일: 2026-04-28  
작성자: Claude (AI)  
대상 파일: `project_canvas/next.config.ts`

---

## 1. 현상

- GENERATE 버튼 클릭 시 사이드바에 `"Unexpected token 'R', "Request En"... is not valid JSON"` 에러 표시
- 브라우저 콘솔: `POST :3900/api/print-proxy/api/print → 413 (Payload Too Large)`
- 응답 본문이 JSON이 아닌 plain-text `"Request Entity Too Large"` → `res.json()` 파싱 실패

---

## 2. 근본 원인 (확인됨)

### 발생 경로

```
브라우저
  → POST multipart/form-data → :3900/api/print-proxy/api/print
    → Next.js 15 action-handler (route handler보다 먼저 실행)
      → 1MB 초과 → ApiError(413) 반환
    → BFF route handler는 실행조차 안 됨
```

### 핵심 코드 (Next.js 내부)

**`node_modules/next/dist/server/lib/server-action-request-meta.js:38`**
```javascript
// multipart/form-data POST는 무조건 isPossibleServerAction = true
const isMultipartAction = Boolean(req.method === 'POST' && contentType.startsWith('multipart/form-data'));
const isPossibleServerAction = Boolean(isFetchAction || isURLEncodedAction || isMultipartAction);
```

**`node_modules/next/dist/server/app-render/action-handler.js`**
```javascript
const defaultBodySizeLimit = '1 MB';
const bodySizeLimit = serverActions?.bodySizeLimit ?? defaultBodySizeLimit;  // 미설정 시 1MB
const sizeLimitTransform = new Transform({
  transform(chunk, encoding, callback) {
    size += Buffer.byteLength(chunk, encoding);
    if (size > bodySizeLimitBytes) {
      callback(new ApiError(413, `Body exceeded ${bodySizeLimit} limit.`));  // 1MB 초과 시 413
    }
    ...
  }
});
// multipart POST → sizeLimitTransform 통과 → MPA action 확인 → null 반환
// 단, 1MB 초과 시 ApiError(413) 전파 → Next.js가 plain-text 413 응답 반환
// → BFF route handler 실행 안 됨
```

### 핵심 사실

| 구분 | 상태 |
|------|------|
| Next.js action handler | `multipart/form-data` POST 모두 인터셉트 |
| 기본 body size limit | **1MB** (`bodySizeLimit` 미설정 시) |
| Print 서버 (`project.10_print`) | `bodySizeLimit: '50mb'` ✅ 설정됨 |
| Canvas BFF (`project_canvas`) | `bodySizeLimit` **미설정** ❌ → 기본 1MB |
| 이미지 1장 이상 시 | 1MB 초과 → 413 발생 |

### 413 응답 본문이 "Request Entity Too Large"인 이유

`ApiError(413)` → action handler에서 MPA 경로로 `throw err` → Next.js 상위 오류 핸들러가 HTTP 표준 413 reason phrase("Request Entity Too Large")로 응답 본문 생성 → plain-text 반환 → `res.json()` 파싱 실패

---

## 3. 수정 내용 (이미 적용됨)

**파일: `project_canvas/next.config.ts`**

```typescript
// 추가된 설정
experimental: {
  serverActions: {
    bodySizeLimit: '50mb',  // Next.js action handler의 multipart 인터셉트 limit을 1MB → 50MB
  },
},
```

이 설정으로 action handler의 `sizeLimitTransform`이 50MB까지 허용 → 이미지 업로드 시 action handler가 413을 반환하지 않고 non-action multipart로 판단하여 `null` 반환 → BFF route handler가 정상 실행됨

---

## 4. 체크리스트

- [x] Fix 4: Canvas `next.config.ts`에 `bodySizeLimit: '50mb'` 추가 (코드 적용 완료)
- [ ] **전체 서버 재시작** (`next.config.ts` 변경은 Hot Reload 불가, 반드시 재시작 필요)
  - 현재 `[Fast Refresh]`만 발생 → 설정 미반영 상태
  - 터미널에서: `Ctrl+C` → `npm run dev` (port 3900)
- [ ] 브라우저 재테스트: GENERATE 버튼 → 413 오류 없이 성공 확인
- [ ] 브라우저 재테스트: 콘솔에서 `ERR_INVALID_URL` 사라졌는지 확인 (Fix 5 hot reload로 적용됨)
- [ ] SAVE 버튼 → Canvas 썸네일 업데이트 확인
- [ ] Phase 8 완료 처리 (plan 파일 `active/` → `completed/` 이동)

---

## 5. 검증 방법

서버 재시작 후:

1. 브라우저 Console 탭을 열어 둔 상태로 INSERT IMAGE에 이미지 삽입
2. GENERATE 클릭
3. **성공 기준**: 413 에러 없음, 로딩 후 결과 HTML 표시
4. **실패 시 디버깅**: Canvas 터미널 로그에서 `[print-bff] ▶ POST` 로그 확인 (BFF가 실행됐는지 확인)

---

## 6. 관련 파일

| 파일 | 역할 | 수정 여부 |
|------|------|-----------|
| `project_canvas/next.config.ts` | Canvas BFF bodySizeLimit 설정 | ✅ 수정됨 (재시작 필요) |
| `project_canvas/print/ExpandedView.tsx` | base64 newline 제거 (Fix 5) | ✅ hot reload 적용됨 |
| `project_canvas/app/api/print-proxy/api/print/route.ts` | BFF proxy 로직 | 수정 없음 |
| `project.10_print/next.config.ts` | Print 서버 bodySizeLimit (50mb) | 수정 없음 (이미 설정됨) |
