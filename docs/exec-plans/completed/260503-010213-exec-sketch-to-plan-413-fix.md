# 작업지시서: sketch-to-plan 413 Content Too Large 에러 수정

## 문제
지적도 ExpandedView에서 위성사진 노드에 스케치 후 generate 시 413 에러 발생.
- 원인: 이미지 3장(sketch + cadastral + composite) 각각 3MB 압축 → 최대 9MB → Vercel 4.5MB 제한 초과
- Vercel 인프라 레이어에서 차단되므로 Next.js config 변경 불가

## 해결
`usePlanGeneration.ts`에서 이미지 수에 따라 1장당 압축 예산 동적 분배
- 총 예산 3MB를 이미지 수로 나눔 (1장→3MB, 2장→1.5MB, 3장→1MB)
- `compressImageBase64`의 기존 `maxBytes` 파라미터 활용

## 체크리스트
- [ ] usePlanGeneration.ts: 이미지 수 계산 및 perImageBudget 적용
- [ ] 빌드 오류 없음 확인
- [ ] 완료 후 completed로 이동
