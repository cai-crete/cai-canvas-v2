# 260428 검토 계획서 즉시 실행 항목 적용

> **작성일**: 2026-04-28  
> **기반 계획**: `docs/exec-plans/active/Review/260428-canvas-print-integration-review.md`  
> **범위**: Print 팀 협의 없이 즉시 적용 가능한 B-2, B-3, B-4, B-5 항목

---

## 수정 대상

| 항목 | 파일 | 내용 |
|------|------|------|
| B-2 | `print/route.ts` | fetch에 `AbortSignal.timeout(120_000)` 추가 |
| B-5 | `print/route.ts` | catch 블록 TimeoutError vs 네트워크 실패 분기 (504 vs 502) |
| B-3 | `library/route.ts` | `export const maxDuration = 30` 추가 |
| B-4 | `next.config.ts` | `bodySizeLimit` 주석 정정 |

## 체크리스트

- [x] B-4: `next.config.ts` `bodySizeLimit` 주석 수정
- [x] B-3: `library/route.ts` `export const maxDuration = 30` 추가
- [x] B-2: `print/route.ts` fetch에 `signal: AbortSignal.timeout(120_000)` 추가
- [x] B-5: `print/route.ts` catch 블록 TimeoutError 분기 추가 (504 vs 502)
- [x] `tsc --noEmit` 오류 0건 확인

## 보류 항목 (Print 팀 선행 필요)

- A-1: `package.json` `file:` → GitHub Packages 교체
- A-2: `types/canvas.ts` 패키지 타입 직접 참조
- B-1: `@/app` alias 이름 변경 (빌드 방식 확인 후)
