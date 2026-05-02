# Exec Plan: 스케치 위치 기반 평면도 생성 (Site-Relative Sketch Footprint)

**생성일:** 260502-142817  
**작업자:** Claude  
**상태:** 완료

---

## 문제 정의

### 현상
스크린샷 확인 결과:
- **SKETCH 카드**: 지적도(대지 경계선) 위에 손으로 그린 건물 스케치가 대지 내부 일부 영역에 위치
- **PLAN 카드**: 생성된 평면도가 대지 경계선 전체를 채움 (스케치 위치·크기 무시)

### 근본 원인
현재 AI에게 전달되는 이미지 구성:
```
IMAGE_1 = cadastral_image  → 지적도 원본 (대지 경계 기준) ✅
IMAGE_2 = exportStrokesOnly() → 흰 배경 위 스트로크만 ❌ (위치 정보 없음)
```

`exportStrokesOnly()`는 배경(지적도) 없이 스트로크만 흰 배경에 export.
AI는 대지 경계선은 읽지만, 스케치가 대지 내 **어느 위치·어느 크기**인지 알 방법이 없음.
→ 대지 경계 전체에 맞춰 평면도 생성.

### 해결책
`exportAsBase64()` (지적도 + 스트로크 합성본)을 `composite_image`로 전달.

새로운 이미지 구성:
```
IMAGE_1 = composite_image  → 지적도 위 스케치 오버레이 합성 (스케치 위치 + 대지 경계 동시 제공)
IMAGE_2 = sketch_image     → 순수 스트로크 (Room Topology 분석용)
```

---

## 체크리스트

- [x] 작업지시서 생성
- [x] `usePlanGeneration.ts` - `compositeImageBase64` 파라미터 추가 + body 전송
- [x] `ExpandedView.tsx` - `compositeImageBase64: sketchBase64` 전달 (cadastral 있을 때만)
- [x] `render-server/sketchToPlan.ts` - composite 이미지 처리 + imageParts 로직 + 프롬프트 업데이트
- [x] progress 파일 저장

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `project_canvas/hooks/usePlanGeneration.ts` | `compositeImageBase64?` 파라미터 추가, body에 `composite_image` 포함 |
| `project_canvas/sketch-to-plan/ExpandedView.tsx` | `compositeImageBase64: cadastralBase64 ? sketchBase64 : undefined` 전달 |
| `render-server/src/routes/sketchToPlan.ts` | `composite_image` 수신 및 유효성 검사, imageParts 3-way 분기, cadastralContext 프롬프트 업데이트 |
