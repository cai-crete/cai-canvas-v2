# 지적도 EXPORT TO IMAGE NODE — 액박 버그 수정

## 증상
cadastral ExpandedView에서 "EXPORT TO IMAGE NODE" 클릭 시 생성되는 노드 카드에서 썸네일이 액박(깨진 이미지)으로 표시됨.

## 근본 원인

### 흐름 추적
1. `CadastralPanel` → "EXPORT TO IMAGE" 클릭
2. `mapRef.current.exportToImage()` → `base64Url` (= `data:image/png;base64,...` 포함 풀 URL)
3. `handleExportCadastralImage` (page.tsx ~498) 에서:
   ```js
   const rawBase64 = base64Url.replace(/^data:[^;]+;base64,/, '');  // ← data: prefix 제거
   ...
   thumbnailData: rawBase64,  // prefix 없는 순수 base64 저장
   ```
4. `NodeCard.tsx` 의 cadastral 분기 (line 349):
   ```tsx
   <img src={node.thumbnailData} .../>  // ← data: prefix 없이 그대로 사용 → 액박!
   ```

### 문제 지점
`handleExportCadastralImage`는 `thumbnailData`를 raw base64(prefix 없음)로 저장하지만,  
NodeCard 의 cadastral 썸네일 분기는 prefix 처리 없이 `src`에 직접 사용함.

반면 같은 파일 line 375 (`artboardType=image` 분기)는 올바르게 처리:
```tsx
src={node.thumbnailData.startsWith('data:') ? node.thumbnailData : `data:image/jpeg;base64,${node.thumbnailData}`}
```

## 수정 계획

### 수정 파일: `project_canvas/components/NodeCard.tsx`

- **위치:** line 349 (`<img src={node.thumbnailData}` 부분)
- **변경:** prefix 유무를 모두 처리하도록 수정

```tsx
// 변경 전
<img
  src={node.thumbnailData}
  alt="지적도 썸네일"
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
/>

// 변경 후
<img
  src={node.thumbnailData.startsWith('data:') ? node.thumbnailData : `data:image/png;base64,${node.thumbnailData}`}
  alt="지적도 썸네일"
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
/>
```

## 체크리스트
- [x] NodeCard.tsx cadastral 썸네일 img src 수정
- [ ] 브라우저에서 EXPORT TO IMAGE NODE 동작 확인 (썸네일 정상 표시)
- [ ] 기존 지적도 노드 썸네일 라이브 렌더 → onThumbnailCaptured 경로 정상 확인
