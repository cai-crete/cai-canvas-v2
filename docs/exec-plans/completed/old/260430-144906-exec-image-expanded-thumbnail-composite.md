# 작업지시서: Image Expanded 썸네일 — 원본 이미지 + 스케치 스트로크 합성 표시

## 문제 정의

`type: 'image'`, `artboardType: 'image'` 노드(Sketch-to-Image 생성 결과물)를 Expand하여 스케치 후 collapse 하면, 캔버스 썸네일에서 원본 이미지가 사라지고 스트로크만 흰 배경에 표시된다.

---

## 원인 분석

### 데이터 흐름

| 시점 | `thumbnailData` | `generatedImageData` | `sketchData` / `sketchPaths` |
|------|----------------|----------------------|------------------------------|
| 노드 생성 직후 | 원본 생성 이미지 | 원본 생성 이미지 | — |
| 첫 번째 Expand 후 collapse | 원본+스트로크 합성 PNG | 원본 이미지 (최초 1회 백업) | 스트로크만 |
| **두 번째 Expand 후 collapse** | **스트로크만 (흰 배경)** ← 문제 | 원본 이미지 | 스트로크만 |

### 왜 이렇게 되나?

**두 번째 Expand 시 (`sketch-to-image/ExpandedView.tsx` useEffect):**
```
generatedImageData 있음 → refImage(CSS 오버레이)로만 표시
sketchPaths / sketchData 있음 → SketchCanvas에 스트로크만 로드 (uploadedImg 없음)
```

**Collapse 시 `exportThumbnail()`:**
- SketchCanvas의 exportThumbnail은 `uploadedImg`(캔버스에 올라간 이미지) + 스트로크를 합성
- 두 번째 expand에서는 `uploadedImg`가 없으므로 → **흰 배경 + 스트로크만** 출력
- `refImage`는 CSS `<img>` 오버레이이므로 canvas export에 포함되지 않음

---

## 해결 방안

### 핵심 아이디어
collapse 시 `thumbnailBase64`를 생성할 때, `refImage`(원본 이미지)가 존재하면 이를 배경으로 깔고 sketch thumbnail을 그 위에 오버레이하여 합성한 composite 이미지를 `thumbnailBase64`로 사용한다.

### 수정 위치
**`project_canvas/sketch-to-image/ExpandedView.tsx`** 단일 파일 수정

---

## 구현 계획

### Step 1: 합성 헬퍼 함수 추가

`SketchToImageExpandedView` 내부에 `compositeRefWithSketch` 함수 추가:

```ts
const compositeRefWithSketch = useCallback((sketchThumbB64: string): Promise<string> => {
  if (!refImage || !sketchThumbB64) return Promise.resolve(sketchThumbB64);

  return new Promise((resolve) => {
    const bgImg = new Image();
    bgImg.onload = () => {
      const fgImg = new Image();
      fgImg.onload = () => {
        const c = document.createElement('canvas');
        c.width  = bgImg.naturalWidth  || 800;
        c.height = bgImg.naturalHeight || 600;
        const ctx = c.getContext('2d')!;
        // 1) 원본 이미지 (배경)
        ctx.drawImage(bgImg, 0, 0, c.width, c.height);
        // 2) 스케치 스트로크 (오버레이, 투명 배경 유지)
        ctx.drawImage(fgImg, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png').split(',')[1]);
      };
      const fgSrc = sketchThumbB64.startsWith('data:')
        ? sketchThumbB64
        : `data:image/png;base64,${sketchThumbB64}`;
      fgImg.src = fgSrc;
    };
    bgImg.onerror = () => resolve(sketchThumbB64); // 실패 시 원본 유지
    bgImg.src = refImage;
  });
}, [refImage]);
```

> **주의**: sketch thumbnail은 흰 배경(fillRect white)이므로, 원본 이미지 위에 그릴 때 스트로크만 보이지 않는다.
> → `exportThumbnail`이 흰 배경으로 그리므로, 합성 시 배경 흰색이 원본 이미지를 덮는 문제 발생
> → **해결**: `SketchCanvas.exportThumbnail`에 `transparent` 옵션 파라미터 추가하여 흰 배경 fillRect를 생략하도록 수정

### Step 1-A: SketchCanvas.exportThumbnail에 transparent 옵션 추가

**`project_canvas/components/SketchCanvas.tsx`**:

```ts
// SketchCanvasHandle 인터페이스
exportThumbnail: (transparent?: boolean) => string;

// 구현부
const exportThumbnail = useCallback((transparent = false): string => {
  // ...
  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  }
  // 나머지 동일
}, [textItems]);
```

### Step 2: handleSketchCollapse를 async로 변경

```ts
const handleSketchCollapse = useCallback(async () => {
  const sketchBase64 = sketchCanvasRef.current?.exportAsBase64() ?? '';
  const sketchPaths  = sketchCanvasRef.current?.exportState();
  const hasContent   = !!(sketchPaths?.paths.length || sketchPaths?.uploadedImageData || sketchPaths?.textItems?.length);
  const rawThumb     = hasContent ? (sketchCanvasRef.current?.exportThumbnail(true) ?? '') : '';
  // refImage 있으면 합성, 없으면 흰 배경 그대로 (기존 동작)
  const thumbnailBase64 = refImage
    ? await compositeRefWithSketch(rawThumb)
    : (hasContent ? (sketchCanvasRef.current?.exportThumbnail() ?? '') : '');
  onCollapseWithSketch?.(sketchBase64, thumbnailBase64, collectPanelSettings(), sketchPaths);
  onCollapse();
}, [onCollapse, onCollapseWithSketch, collectPanelSettings, refImage, compositeRefWithSketch]);
```

### Step 3: handleGenerate에서도 동일 처리

`handleGenerate` (이미 async) 내부:

```ts
const rawThumb        = canvas.exportThumbnail(true);
const thumbnailBase64 = refImage
  ? await compositeRefWithSketch(rawThumb)
  : canvas.exportThumbnail();
```

---

## 체크리스트

- [ ] `SketchCanvas.tsx`: `exportThumbnail(transparent?: boolean)` 파라미터 추가 + SketchCanvasHandle 타입 업데이트
- [ ] `sketch-to-image/ExpandedView.tsx`: `compositeRefWithSketch` 헬퍼 추가
- [ ] `sketch-to-image/ExpandedView.tsx`: `handleSketchCollapse` async 변환 + rawThumb 합성 로직 적용
- [ ] `sketch-to-image/ExpandedView.tsx`: `handleGenerate` 내 thumbnail 합성 로직 적용
- [ ] 동작 검증: Image 노드 expand → 스케치 → collapse → 썸네일에 원본+스트로크 표시 확인
- [ ] 동작 검증: 재차 expand → 스케치 → collapse → 썸네일 유지 확인
- [ ] 기존 동작 검증: artboardType !== 'image' 노드(sketch 타입 등)는 기존과 동일하게 동작

---

## 영향 범위

| 파일 | 변경 | 영향 |
|------|------|------|
| `components/SketchCanvas.tsx` | `exportThumbnail` 파라미터 추가 | 하위 호환 — 기본값 `false`라 기존 호출 모두 정상 |
| `sketch-to-image/ExpandedView.tsx` | 합성 로직 추가 | artboardType=image 노드만 영향 |
| `sketch-to-plan/ExpandedView.tsx` | 수정 없음 | 무관 |
