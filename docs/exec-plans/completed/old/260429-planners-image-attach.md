# Planners 이미지 다중 첨부 기능

- 일시: 2026-04-29
- 분류: feature

---

## 개요

Planners 채팅에 이미지 다중 첨부 기능 추가. 두 가지 진입 경로 지원:
- **경로 A**: Planners 채팅 내 + 버튼으로 파일 직접 선택
- **경로 B**: 무한캔버스에서 이미지 노드 다중선택 → Planners 버튼 클릭 시 자동 첨부

## 체크리스트

### Phase 1: PlannersPanel 이미지 첨부 UI + 상태

- [x] 1-1. `PlannersPanel` props에 `initialImages?: string[]` 추가
  - ExpandedView → PlannersPanel로 캔버스 선택 이미지 전달용
  - 파일: `planners/PlannersPanel.tsx`

- [x] 1-2. 이미지 상태 관리 추가
  - `chatImages: string[]` 상태 (base64 dataURL 배열)
  - `initialImages` prop이 있으면 초기값으로 세팅
  - 파일: `planners/PlannersPanel.tsx`

- [x] 1-3. + 버튼에 파일 선택 기능 연결
  - 기존 "기능 준비중" 버튼 → `<input type="file" accept="image/*" multiple>` 연결
  - `handleFileChange`: 선택된 파일들을 1024px 리사이즈 후 `chatImages`에 추가
  - Harness 패턴 참고: `resizeImageLocal(file, 1024)`
  - 파일: `planners/PlannersPanel.tsx`

- [x] 1-4. 이미지 미리보기 썸네일 UI
  - 입력창 위에 첨부된 이미지 썸네일 가로 스크롤 표시
  - 각 썸네일에 X 버튼으로 개별 삭제 가능
  - 파일: `planners/PlannersPanel.tsx`

- [x] 1-5. 메시지 전송 시 이미지 포함
  - `handleChatSubmit`에서 `chatImages`를 `/api/planners`로 함께 전송
  - 전송 후 `chatImages` 초기화
  - 사용자 메시지 버블에 첨부 이미지 썸네일 표시
  - 파일: `planners/PlannersPanel.tsx`

### Phase 2: API 프록시 이미지 전달

- [x] 2-1. `/api/planners` 프록시에 이미지 데이터 패스스루 (기존 body 그대로 전달하므로 변경 불필요)
  - request body에 `images: string[]` (base64 배열) 추가 전달
  - 파일: `app/api/planners/route.ts`

- [x] 2-2. Planners 백엔드(`api/planners.ts`)에 이미지 수신 → Gemini `inlineData` 전달
  - request body에서 `images` 배열 추출
  - Gemini API `contents`에 `inlineData` 배열로 변환하여 전달
  - Harness `gemini.ts` L637-639 패턴 참고
  - 파일: Harness `api/planners.ts` (별도 배포)

### Phase 3: 캔버스 다중선택 → Planners 전달

- [x] 3-1. `handleNodeTabSelect`에서 planners 분기 수정
  - 다중선택(`selectedNodeIds`)에 이미지 노드가 있을 때 Planners 진입 시
  - 선택된 이미지 노드들의 `generatedImageData ?? thumbnailData`를 수집
  - `plannerInitialImages` 상태에 저장 후 Planners 확장 뷰 진입
  - 기존 print 패턴(`imageNodes.flatMap(...)`) 참고
  - 파일: `app/page.tsx` (L862-870)

- [x] 3-2. ExpandedView → PlannersPanel로 이미지 전달
  - `ExpandedView` props에 `initialImages` 추가
  - planners 뷰 렌더링 시 `<PlannersPanel initialImages={initialImages} />` 전달
  - 파일: `components/ExpandedView.tsx` (L220-238)

- [x] 3-3. page.tsx에서 ExpandedView에 `plannerInitialImages` prop 전달
  - 파일: `app/page.tsx`

### Phase 4: 유틸리티

- [x] 4-1. `resizeImageLocal` + `resizeBase64Image` 유틸 함수 추가
  - Harness `src/lib/utils.ts` L49의 함수를 `planners/lib/imageUtils.ts`로 포팅
  - Canvas → File 변환 없이 base64 → base64 리사이즈도 지원
  - 파일: `planners/lib/imageUtils.ts` (신규)

### Phase 5: 검증

- [x] 5-1. 빌드 확인 (next build 통과)
- [ ] 5-2. 브라우저 테스트: + 버튼으로 다중 이미지 선택 → 썸네일 표시 → 전송
- [ ] 5-3. 브라우저 테스트: 캔버스 이미지 다중선택 → Planners 버튼 → 이미지 자동 첨부

---

## 참고 파일

| 역할 | CAI Canvas 파일 | Harness 참고 |
|------|-----------------|-------------|
| 채팅 패널 | `planners/PlannersPanel.tsx` | `src/components/RightPanel.tsx` |
| API 프록시 | `app/api/planners/route.ts` | — |
| 백엔드 | — | `api/planners.ts` |
| Gemini 호출 | — | `src/lib/gemini.ts` (L637-639) |
| 이미지 리사이즈 | (신규) `planners/lib/imageUtils.ts` | `src/lib/utils.ts` (L49) |
| 캔버스 탭 선택 | `app/page.tsx` (L862) | — |
| 확장 뷰 | `components/ExpandedView.tsx` (L220) | — |

## 구현 순서

Phase 4 (유틸) → Phase 1 (UI) → Phase 2 (API) → Phase 3 (캔버스 연동) → Phase 5 (검증)
