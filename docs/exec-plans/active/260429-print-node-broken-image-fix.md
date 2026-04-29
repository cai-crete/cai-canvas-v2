# 작업지시서: Print 노드 썸네일 액박 수정

DATE: 2026-04-29
STATUS: IN PROGRESS

## 문제 설명

Print ExpandedView에서 Generate 후 생성된 노드의 썸네일에 액박(깨진 이미지)이 표시됨.

## 원인 분석

### 데이터 흐름 추적

1. `@cai-crete/print-components/lib/thumbnailUtils.ts:100`
   ```ts
   return thumbCanvas.toDataURL('image/jpeg', 0.65)
   // 반환값: "data:image/jpeg;base64,/9j/..." (완전한 data URL)
   ```

2. `print/ExpandedView.tsx:84` → `onGeneratePrintComplete?.({ thumbnailBase64: result.thumbnail })`
   - `result.thumbnail` = 완전한 data URL

3. `app/page.tsx:733` → `thumbnailData: thumbnailBase64`
   - `node.thumbnailData` = `"data:image/jpeg;base64,..."`

4. `components/NodeCard.tsx:387` — `hasThumbnail` 브랜치:
   ```tsx
   src={`data:image/png;base64,${node.thumbnailData}`}
   // 결과: "data:image/png;base64,data:image/jpeg;base64,..." → 액박!
   ```

### 비교: image 아트보드는 정상 처리
```tsx
// artboardType === 'image' 브랜치 (정상)
src={node.thumbnailData.startsWith('data:') ? node.thumbnailData : `data:image/jpeg;base64,${node.thumbnailData}`}
```

hasThumbnail 브랜치만 `data:` prefix 체크를 하지 않아 이중 prefix 문제 발생.

## 수정 계획

### 파일: `project_canvas/components/NodeCard.tsx`

**변경 위치**: line 387, `hasThumbnail` 브랜치의 `<img>` src 속성

**변경 전:**
```tsx
src={`data:image/png;base64,${node.thumbnailData}`}
```

**변경 후:**
```tsx
src={node.thumbnailData.startsWith('data:') ? node.thumbnailData : `data:image/png;base64,${node.thumbnailData}`}
```

## 체크리스트

- [x] 원인 분석 완료
- [x] NodeCard.tsx hasThumbnail 브랜치 수정
- [x] progress 파일 저장
