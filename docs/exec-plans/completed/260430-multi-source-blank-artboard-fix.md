# 작업지시서: 다중 선택 Sketch-to-Image 빈 아트보드 제거

## 문제 설명

다중 아트보드 선택 후 IMAGE 탭 클릭 시:
1. 빈 아트보드가 먼저 캔버스에 생성됨
2. 생성 완료 후 이미지가 담긴 새 아트보드가 옆에 추가됨
3. 결과: 빈 아트보드 + 이미지 아트보드 2개 공존

## 근본 원인 분석

### 현재 흐름
```
handleNodeTabSelect (image, ≥2개 선택)
  → 빈 imageNode 생성 (artboardType: 'sketch', hasThumbnail: false)
  → 캔버스에 즉시 추가 (pushHistory)
  → ExpandedView 열림 (setExpandedNodeId)

handleGenerateComplete (생성 완료 시)
  → origin(빈 노드) 기준으로 NEW 노드를 오른쪽에 생성
  → 빈 노드는 그대로 방치
```

### 핵심 파일 및 위치
- `project_canvas/app/page.tsx:906-914` — 빈 노드 생성
- `project_canvas/app/page.tsx:1134-1179` — handleGenerateComplete (새 노드 생성)

## 수정 전략

**단일 변경 포인트**: `handleGenerateComplete` 내부에서 분기 처리

- `origin.sketchInputImages`가 설정된 경우 (다중 선택 → 빈 플레이스홀더 노드):
  - **새 노드 생성 대신 origin 노드를 in-place 업데이트**
  - artboardType: 'image', hasThumbnail: true, thumbnailData, generatedImageData 설정
  - 엣지는 이미 생성되어 있으므로 추가 불필요

- `origin.sketchInputImages`가 없는 경우 (단일 선택 일반 스케치):
  - **현재 동작 유지** (새 노드를 오른쪽에 생성)

## 체크리스트

### 단계 1 — handleGenerateComplete 수정 (page.tsx:1134~1179)
- [ ] `origin.sketchInputImages` 존재 여부로 분기 추가
- [ ] 다중 선택 분기: origin 노드를 이미지로 업데이트 (in-place)
  - artboardType: 'image'
  - hasThumbnail: true
  - thumbnailData: generatedBase64
  - generatedImageData: generatedBase64
  - multiSourceAnalysisReport 포함 (있을 경우)
  - sketchInputImages는 그대로 유지 (추적용)
- [ ] 다중 선택 분기: 새 엣지 생성 생략 (기존 엣지 재사용)
- [ ] 단일 선택 분기: 기존 로직 그대로 유지

### 단계 2 — 동작 검증
- [ ] 다중 선택 → IMAGE 탭 → GENERATE → 빈 노드 없이 이미지만 표시 확인
- [ ] 단일 선택 일반 스케치 → GENERATE → 기존 동작 유지 확인 (스케치 노드 + 이미지 노드)
- [ ] swap/remove 버튼 동작 무관 확인

### 단계 3 — 마무리
- [ ] 이 파일을 completed/로 이동
- [ ] progress 파일 생성

## 수정 코드 (page.tsx handleGenerateComplete)

```ts
const handleGenerateComplete = useCallback(({
  sketchBase64: _sketchBase64, thumbnailBase64: _thumbnailBase64, generatedBase64, nodeId, multiSourceAnalysisReport,
}: { ... }) => {
  setIsGenerating(false);
  abortControllerRef.current = null;

  setNodes(prev => {
    const origin = prev.find(n => n.id === nodeId);
    if (!origin) return prev;

    // 다중 선택(sketchInputImages 존재) → origin 노드를 in-place 업데이트
    if (origin.sketchInputImages) {
      const updatedOrigin: CanvasNode = {
        ...origin,
        artboardType: 'image',
        hasThumbnail: true,
        thumbnailData: generatedBase64,
        generatedImageData: generatedBase64,
        ...(multiSourceAnalysisReport ? { multiSourceAnalysisReport } : {}),
      };
      const next = prev.map(n => n.id === nodeId ? updatedOrigin : n);
      pushHistory(next, edgesRef.current);  // 엣지 변경 없음
      setExpandedNodeId(null);
      return next;
    }

    // 단일 선택 일반 스케치 → 기존 동작: 새 노드 생성
    const existingOfType = prev.filter(n => n.type === origin.type);
    const num = existingOfType.length + 1;
    const newNode: CanvasNode = { ... };  // 기존 코드 그대로
    ...
  });
}, [pushHistory]);
```
