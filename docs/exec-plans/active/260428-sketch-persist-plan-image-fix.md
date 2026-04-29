# 작업지시서: Plan ExpandedView 스케치 소실 + 생성 이미지 오류 수정

**날짜**: 2026-04-28  
**담당**: Claude

---

## 문제 정의

### Problem 1 — strokeData 미저장 (artboardType=image 노드)
Plan/Image ExpandedView에서 스케치 후 minimize 시 획이 사라짐.
**원인**: `page.tsx`의 두 collapse 핸들러에서 `strokeData` 저장이
`n.artboardType !== 'image'` 조건 안에 묶여 있음.
**원칙**: 어느 노드 카드든 스케치가 있으면 strokeData는 항상 별도 저장.

### Problem 2 — 배경 이미지 API 미전송
Plan 모드에서 배경 이미지(위성사진 등) 위에 스케치 시, 배경은 CSS 오버레이일 뿐
`exportAsBase64()`에 포함 안 됨 → API에 스케치 획만 전송, 배경 컨텍스트 없음.
AI가 건물 footprint의 위치/범위를 인식하지 못해 잘못된 평면도 생성.
**원칙**: Plan 모드에서 배경 이미지가 있으면 배경+스케치 합성 이미지를 API에 전송.
→ AI가 위성사진 컨텍스트와 스케치 범위를 함께 인식하여 올바른 평면도 생성.

---

## 해결 방안

### Problem 1 — page.tsx 두 핸들러 수정
```js
// 수정 전: strokeData가 artboardType 조건 안에 있음
if (sketchBase64 && n.artboardType !== 'image') {
  ...
  if (strokeData) updates.strokeData = strokeData;
}

// 수정 후: strokeData는 항상 저장
if (strokeData) updates.strokeData = strokeData;
if (sketchBase64 && n.artboardType !== 'image') {
  updates.hasThumbnail  = true;
  updates.thumbnailData = thumbnailBase64;
  updates.sketchData    = sketchBase64;
}
```

### Problem 2 — sketch-to-plan/ExpandedView.tsx
`handleGenerate`에서 `planBaseImage`가 있으면:
1. 배경이미지 + 스케치 획을 클라이언트에서 합성
2. 합성 이미지를 `sketch_image`로 API 전송 (AI가 위성사진+스케치 범위 동시 인식)

```js
// 배경+스케치 합성 함수 (클라이언트 전용)
async function compositeSketchOnBackground(bgBase64, sketchBase64): Promise<string>
```

---

## 변경 파일

1. **`project_canvas/app/page.tsx`**
   - `handleCollapseWithSketch`: strokeData 저장을 artboardType 조건 밖으로
   - `handleCollapseWithPlanSketch`: 동일

2. **`project_canvas/sketch-to-plan/ExpandedView.tsx`**
   - `compositeSketchOnBackground()` 헬퍼 추가
   - `handleGenerate`: planBaseImage 있으면 합성 후 API 전송

---

## 체크리스트

- [x] page.tsx: handleCollapseWithSketch — strokeData 조건 분리
- [x] page.tsx: handleCollapseWithPlanSketch — strokeData 조건 분리
- [x] sketch-to-plan/ExpandedView.tsx: compositeSketchOnBackground 헬퍼 추가
- [x] sketch-to-plan/ExpandedView.tsx: handleGenerate — planBaseImage 있으면 합성 후 전송
- [ ] 브라우저 검증: 스케치 minimize 후 재진입 시 획 복원 확인
- [ ] 브라우저 검증: 배경+스케치 합성 이미지 API 전송 후 결과 확인
