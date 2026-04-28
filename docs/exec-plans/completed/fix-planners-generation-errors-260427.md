# Fix: Planners 생성 시 오류 수정

- 상태: **✅ 완료**
- 날짜: 2026-04-27

---

## 현상

사용자가 Planners에서 안건을 입력하고 전송하면 오류가 발생하거나 결과가 정상 표시되지 않음.

---

## 원인 분석 (3건)

### 원인 1: 로컬 dev 서버 `.next` 캐시 손상

`/api/planners` 프록시 라우트 호출 시 500 에러 발생.

```
Error: Cannot find module './331.js'
→ .next/server/webpack-runtime.js
```

`.next` 빌드 캐시 내 webpack 청크 파일이 깨져서, API Route가 로드 자체를 실패함.
프론트엔드에서 백엔드를 호출하기 전에 프록시 단계에서 막힘.

**해결**: `.next` 폴더 삭제 후 dev 서버 재시작.

### 원인 2: 배포된 백엔드가 구버전

`https://cai-planners-v2.vercel.app/api/planners`에 직접 호출한 결과:

| 필드 | 기대값 | 실제 반환값 |
|------|--------|------------|
| `turn` | `1` | **없음** |
| `metacognitiveDefinition` | `{ selectedMode, projectDefinition, ... }` | **없음** |
| `workflowSimulationLog` | 문자열 | **없음** |
| `citedLaws` | 문자열 | **없음** |
| `parsedCitations` | 배열 | **없음** |
| `aggregatedKeywords` | 배열 | **없음** |
| `thesis.expertId` | `"T04"` 등 | `""` (빈 문자열) |
| `finalOutput` 첫 줄 | `### 통합 전략 기획서` | `### Final Output: 통합 전략 기획서` (영어 혼재) |

로컬 `planners.ts`에는 작업 1~8이 모두 구현되어 있지만, Vercel에 **배포되지 않은 상태**.
배포된 버전은 구버전이라 응답 구조가 불완전함.

**해결**: 백엔드(`Planners_harness/N01.Planners`) Vercel 재배포.

### 원인 3: 프론트엔드가 누락 필드에 의존하는 렌더링 로직

배포된 백엔드가 구버전이어서 필드가 누락되면, 프론트엔드 `AIBubble`에서 다음 문제가 발생:

1. **전문가 카드 미표시**: `expertId`가 빈 문자열���면 `!!e?.expertId` 필터에서 전부 탈락 → "기획자 대화" 섹션이 통째로 사라짐 ([PlannersPanel.tsx:421-422](project_canvas/planners/PlannersPanel.tsx#L421-L422))
2. **모드 배지 미표시**: `metacognitiveDefinition`이 없으면 Mode 표시 안 됨 ([PlannersPanel.tsx:461](project_canvas/planners/PlannersPanel.tsx#L461))
3. **다운로드 시 빈 로그**: `workflowSimulationLog`가 undefined면 `formatExpertText(undefined)` 호출 → 잠재적 오류 ([PlannersPanel.tsx:436](project_canvas/planners/PlannersPanel.tsx#L436))

**해결**: 백엔드 재배포가 근본 해결이지만, 프론트엔드에도 방어 코드 추��� 권장.

---

## 작업 목록

### 작업 1: `.next` 캐시 삭제 및 dev 서버 재시작
- `.next` 폴더 삭제
- `npm run dev` 재실행
- `/api/planners` 프록시 정상 동작 확인

### ~~작업 2: 제거됨~~
방어 코드를 넣으면 백엔드 오류를 은폐하고 의미 없는 결과만 표시하게 됨. 오류가 나야 문제를 발견하고 고칠 수 있으므로 제거.

### 작업 3: 백엔드 커밋 + 푸시 → Vercel 자동 배포
- `Planners_harness/N01.Planners` 프로젝트를 Vercel에 재배포
- 배포 후 확인 사항:
  - 응답에 `turn`, `metacognitiveDefinition`, `workflowSimulationLog`, `citedLaws`, `parsedCitations`, `aggregatedKeywords` 필드 존재
  - `thesis.expertId` 등이 빈 문자열이 아닌 실제 ID(`T04`, `P06` 등)
  - `finalOutput`이 `### 통합 전략 기획서`로 시작 (영어 "Final Output" 없음)

---

## 체크리스트

- [x] 작업 1: `.next` 캐시 삭제 + dev 서버 재시작
- [x] ~~작업 2: 제거됨~~
- [x] 작업 3: 백엔드 커밋 + 푸시 → Vercel 자동 배포

---

COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
