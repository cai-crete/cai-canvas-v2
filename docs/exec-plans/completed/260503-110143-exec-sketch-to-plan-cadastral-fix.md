# 작업지시서: Sketch-to-Plan 지적도 왜곡 / 그리드 모듈 미작동 수정

## 문제 현상
1. 생성된 평면도에 지적도가 왜곡되거나 전체 영역이 잘려서 출력됨
2. 건물 외벽이 스케치 폴리곤이 아닌 지적도 대지 경계를 따라감
3. 캔버스 major 그리드가 export 이미지에 포함되지 않아 AI가 치수 측정 불가

## 근본 원인
- **원인 A**: Phase 2(이미지 생성)에 cadastral + composite 이미지를 전송 → Gemini가 지적도를 재현하려다 왜곡
- **원인 B**: Phase 1 분석에서 대지 경계를 building_footprint로 혼동 → 외벽 오류
- **원인 C**: InfiniteGrid가 CSS 배경으로만 렌더링 → export 이미지에 미포함 → AI 치수 파악 불가

## 수정 항목

### Fix A: SketchCanvas.tsx — export에 major 그리드 라인 추가
- major grid 픽셀 = `60 * expZs` (InfiniteGrid와 동일 계산식)
- `exportStrokesOnly`: 흰 배경 후, 스트로크 전에 그리드 라인 그리기
- `exportComposite`: 지적도 후, 스트로크 전에 그리드 라인 그리기

### Fix B: sketchToPlan.ts — Phase 2 이미지 파트 변경
- `[...imageParts, ...]` → `[sketchPart, ...]` (cadastral/composite 제거)

### Fix C: sketchToPlan.ts — Phase 2 generationPrompt 수정
- `cadastralContext` 제거
- "순수 흰색 배경, 지적도 재현 금지, 건물 외벽은 spatial-spec의 building_footprint 준수" 명시

### Fix D: sketchToPlan.ts — Phase 1 analysisPrompt 강화
- building_footprint는 스케치 스트로크 최외곽에서만 추출
- 대지 경계(IMAGE_1)를 building_footprint 결정에 사용 금지 명시

## 체크리스트
- [ ] Fix A: SketchCanvas.tsx drawMajorGrid 헬퍼 + exportStrokesOnly/exportComposite 적용
- [ ] Fix B+C: Phase 2 imageParts → sketchPart, generationPrompt 수정
- [ ] Fix D: Phase 1 analysisPrompt building_footprint 추출 규칙 강화
- [ ] 빌드 확인 (render-server + frontend)
