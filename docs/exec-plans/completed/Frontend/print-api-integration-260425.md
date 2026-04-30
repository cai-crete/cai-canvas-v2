# cai-print 백엔드 API 연결 작업지시서

> **목표:** `https://cai-print-v3.vercel.app/` (CAI2-print 백엔드)를
> cai-canvas-v2의 PRINT 노드와 **API 프록시 방식**으로 연결한다.
>
> **GitHub:** `https://github.com/cai-crete/CAI2-print.git`
> **백엔드 URL:** `https://cai-print-v3.vercel.app/`
> **참고 문서:** `README_PRINT.md` (첨부 통합 가이드)

---

## 현황 파악 (As-Is)

| 항목 | 상태 |
|------|------|
| `NodeType` 'print' | ✅ 정의됨 |
| `NODE_DEFINITIONS['print']` | ✅ `{ label: 'PRINT', displayLabel: 'PRINT' }` |
| `NODE_TO_ARTBOARD_TYPE['print']` | ✅ `'thumbnail'` |
| `NODES_THAT_EXPAND`에 'print' 포함 | ✅ 포함됨 |
| `ARTBOARD_COMPATIBLE_NODES.image`에 'print' | ✅ 포함됨 |
| `ExpandedView.tsx` print 케이스 | ❌ 기본값 fallthrough → "API 연동 후 작업 화면 표시" |
| `print/ExpandedView.tsx` | ❌ 미존재 |
| `app/api/print-proxy/` 라우트 | ❌ 미존재 |

---

## 체크리스트

### Phase 0: 사전 준비 — API 스펙 파악

- [ ] `https://github.com/cai-crete/CAI2-print` 리포 접근 및 API 라우트 목록 확인
- [ ] 주요 엔드포인트 정리 (예: `POST /api/generate`, `GET /api/job/[id]` 등)
- [ ] 요청 페이로드 구조 확인 (입력: 이미지 base64? URL? 설정값?)
- [ ] 응답 구조 확인 (출력: PDF? 이미지? JSON?)
- [ ] 인증 방식 확인 (API Key 필요 여부)

### Phase 1: API 프록시 라우트 생성

- [ ] `app/api/print-proxy/[...path]/route.ts` 파일 생성
- [ ] `GET` / `POST` / `PUT` / `DELETE` 핸들러 구현
- [ ] 요청 헤더 (Content-Type, Authorization) 전달
- [ ] `maxDuration = 300` 설정 (AI 생성 대기시간 지원, Vercel 필수)
- [ ] `dynamic = 'force-dynamic'` 설정
- [ ] 이미지 페이로드 크기 제한 대응 (413 방지용 compressImageBase64 적용 검토)
- [ ] CORS 헤더 불필요 확인 (서버 → 서버 프록시이므로)

### Phase 2: Print ExpandedView 컴포넌트 구현

- [ ] `print/ExpandedView.tsx` 파일 생성
- [ ] props 인터페이스 정의:
  - `node: CanvasNode` (parentNode의 이미지 데이터 포함)
  - `onCollapse: () => void`
  - `onGeneratingChange?: (v: boolean) => void`
  - `onGenerateComplete?: (params: PrintGenerateResult) => void`
- [ ] 입력 이미지 결정 로직: `node.generatedImageData ?? node.thumbnailData`
- [ ] `POST /api/print-proxy/...` 호출로 생성 요청
- [ ] 생성 중 로딩 상태 표시
- [ ] 생성 결과 뷰어 (이미지/PDF 프리뷰 영역)
- [ ] 다운로드 버튼 구현
- [ ] `ExpandedSidebar` 패턴 적용 (닫기 버튼 + 패널 접기/펼치기)
- [ ] ESC 키 바인딩 (`onCollapse` 호출)

### Phase 3: ExpandedView 라우터 연결

- [ ] `components/ExpandedView.tsx` 에 `node.type === 'print'` 케이스 추가
- [ ] `print/ExpandedView.tsx` import 추가
- [ ] 필요한 props 전달 (`onCollapse`, `onGeneratingChange`, `isGenerating`)
- [ ] `Props` 인터페이스에 print 관련 콜백 추가 (필요 시)

### Phase 4: page.tsx 상태 연결

- [ ] print 노드의 입력 데이터 결정:
  - PRINT 탭 클릭 시 선택된 노드의 이미지를 print 노드에 전달
  - `parentId`를 통해 소스 이미지 추적
- [ ] `handleReturnFromExpand`에서 print 결과 반영:
  - 생성 완료 시 thumbnailData 업데이트
  - artboardType → 'thumbnail' 전환
- [ ] `isGenerating` 상태 연결 (GeneratingToast 표시)
- [ ] `generatingLabel = 'PRINT GENERATING'` 설정

### Phase 5: CSS 변수 보완

- [ ] `app/globals.css` 에 `--color-placeholder` 변수 확인
  - README에서 PRINT 노드가 이 변수를 참조한다고 언급
  - 필요 시 기존 gray 계열과 일치하는 값으로 추가

---

## 주요 변경 파일

| 파일 | 역할 | 변경 유형 |
|------|------|-----------|
| `app/api/print-proxy/[...path]/route.ts` | 백엔드 API 프록시 | **신규 생성** |
| `print/ExpandedView.tsx` | PRINT 노드 확장 뷰 UI | **신규 생성** |
| `components/ExpandedView.tsx` | 라우터에 print 케이스 추가 | **수정** |
| `app/page.tsx` | print 상태·콜백 연결 | **수정** |
| `app/globals.css` | `--color-placeholder` 변수 추가 | **수정 (조건부)** |

---

## 아키텍처 개요

```
캔버스 사용자
  ↓  이미지/썸네일 아트보드에서 PRINT 탭 클릭
page.tsx (createAndExpandNode 또는 setExpandedNodeId)
  ↓
ExpandedView.tsx  (node.type === 'print' 케이스)
  ↓
print/ExpandedView.tsx
  ↓  POST /api/print-proxy/{endpoint}
  ↓  { image_base64, settings... }
app/api/print-proxy/[...path]/route.ts (Next.js API Route)
  ↓  포워딩 (fetch)
https://cai-print-v3.vercel.app/{endpoint}
  ↓  응답 (생성 결과)
print/ExpandedView.tsx — 결과 표시 + 다운로드
  ↓  onGenerateComplete
page.tsx — thumbnailData 업데이트, artboardType → thumbnail
```

---

## 기술 구현 참고사항

### API 프록시 패턴 (기존 코드 기반)

```typescript
// app/api/print-proxy/[...path]/route.ts
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const PRINT_BACKEND = 'https://cai-print-v3.vercel.app';

async function proxyRequest(req: NextRequest, path: string[]) {
  const targetUrl = `${PRINT_BACKEND}/${path.join('/')}`;
  const body = req.method !== 'GET' ? await req.text() : undefined;
  const res = await fetch(targetUrl, {
    method: req.method,
    headers: { 'Content-Type': req.headers.get('content-type') ?? 'application/json' },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

### 기존 이미지 압축 활용

```typescript
// page.tsx — viewpoint와 동일한 압축 로직 재사용
import { compressImageBase64 } from '@/lib/compressImage';
const compressed = await compressImageBase64(base64, mimeType);
```

### ExpandedView 라우터 추가 위치

```typescript
// components/ExpandedView.tsx
// planners 케이스 다음, 기본 fallthrough 이전에 삽입
if (node.type === 'print') {
  return (
    <PrintExpandedView
      node={node}
      onCollapse={onCollapse}
      onGeneratingChange={onGeneratingChange}
      isGenerating={isGenerating}
    />
  );
}
```

---

## 리스크 및 고려사항

| 리스크 | 대응 방안 |
|--------|-----------|
| API 스펙 미파악 (Phase 0 의존) | Phase 0 완료 후 Phase 1~2 상세 구현 |
| 이미지 페이로드 크기 초과 (413) | compressImageBase64 적용으로 Vercel 4.5MB 제한 대응 |
| 긴 생성 시간 (타임아웃) | maxDuration = 300, 클라이언트 GeneratingToast로 UX 보완 |
| Hydration 오류 | 'use client' 선언, 서버/클라이언트 상태 충돌 방지 |
| PRINT 노드에 이미지가 없는 경우 | ExpandedView에서 가드 처리, 사용자 안내 메시지 표시 |
