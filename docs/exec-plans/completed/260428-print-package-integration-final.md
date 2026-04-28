# 260428 Print 팀 배포 완료 후 Canvas 측 최종 연동 작업

> **작성일**: 2026-04-28  
> **선행 완료**: Print 팀 @cai-crete/print-components@0.1.1 GitHub Packages 배포

## 체크리스트

- [x] A-1: `npm install @cai-crete/print-components@0.1.1` 실행 (file: 경로 교체)
- [x] A-2a: `types/canvas.ts` — 패키지 타입 import + 독립 정의 교체 (`SelectedImage`, `PrintSavedState`)
- [x] A-2b: `print/ExpandedView.tsx` — `as SelectedImage[]` 캐스팅 제거
- [x] B-1a: `next.config.ts` — webpack alias 8개 제거 (transpilePackages 유지)
- [x] B-1b: `tsconfig.json` — paths alias 8개 제거 (`@/*` 유지)
- [x] `tsc --noEmit` 오류 0건 확인
