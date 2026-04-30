# 작업지시서: 태블릿 펜슬 드래그 시 앱 충돌 수정

## 작업 개요
iPad에서 Apple Pencil로 노드 카드를 이동할 때 Safari WebKit 프로세스가 OOM(메모리 초과)으로 충돌하는 문제 수정

---

## 근본 원인 분석

### 주요 원인: 고빈도 이벤트 × 대형 이미지 데이터

1. **Apple Pencil 이벤트 주파수**
   - Apple Pencil은 `pointerType === 'pen'` 이벤트를 최대 240Hz로 발생
   - 마우스(60Hz)보다 4배, 터치(60Hz)보다 4배 많은 이벤트

2. **`updateNodePosition` → `setNodes` → 전체 캔버스 리렌더**
   - `page.tsx:628` `updateNodePosition`이 `setNodes(prev => prev.map(...))` 호출
   - 240Hz로 React 상태 업데이트 → 전체 `InfiniteCanvas` + 모든 `NodeCard` 리렌더
   - `NodeCard`의 `<img>` 태그가 대형 base64 `thumbnailData`를 매 프레임 처리

3. **IndexedDB 동기 직렬화** ← 가장 치명적
   - `page.tsx:260` `useEffect(() => { lfSaveNodes(nodes); }, [nodes])`
   - 드래그 중 `nodes`가 변경될 때마다 **전체 노드(base64 이미지 포함)를 IndexedDB에 저장**
   - 240Hz × 대형 이미지 base64 직렬화 = Safari WebKit 메모리 폭발

4. **비고: 업로드 이미지 충돌과 동일한 원인**
   - 업로드된 이미지 노드의 `thumbnailData`가 data URL 형식(용량 큼)으로 저장됨
   - 이 노드가 있는 상태에서 드래그 시 IndexedDB 직렬화 부담이 배가됨

---

## 수정 계획

### Fix 1: RAF 쓰로틀 — `InfiniteCanvas.tsx`
**파일:** `project_canvas/components/InfiniteCanvas.tsx`

`onNodePositionChange` 호출을 `requestAnimationFrame`으로 쓰로틀링
- 240Hz 펜슬 이벤트를 브라우저 렌더 주기(60Hz)로 제한
- `dragRafRef`, `dragPendingPos` ref 추가
- `onMove` 내부 노드 드래그 처리 부분에 RAF 래핑

```
// 변경 전
onNodePositionChange(draggingNodeId.current, { x: ..., y: ... });

// 변경 후
dragPendingPos.current = { id: draggingNodeId.current, pos: { x, y } };
if (dragRafRef.current === null) {
  dragRafRef.current = requestAnimationFrame(() => {
    if (dragPendingPos.current) onNodePositionChange(...);
    dragRafRef.current = null;
    dragPendingPos.current = null;
  });
}
```

**잠재적 장애 요소:**
- ⚠️ pointerup이 RAF 콜백 이전에 발생할 경우, dragPendingPos가 null이 되지 않아 마지막 위치 업데이트가 누락될 수 있음
  → **대응:** pointerup 핸들러(`onUp`)에서 `dragRafRef.current`를 `cancelAnimationFrame`하고 pending 위치를 즉시 반영 후 commit

- ⚠️ RAF가 background tab에서 정지되면 드래그가 멈춘 것처럼 보일 수 있음
  → **영향 없음:** 드래그는 foreground에서만 발생

---

### Fix 2: 드래그 중 IndexedDB 저장 억제 — `page.tsx`
**파일:** `project_canvas/app/page.tsx`

`isDraggingNodeRef` ref 추가하여 드래그 중 persist effect 건너뜀

```
// 기존 persist effect
useEffect(() => {
  if (!isRestoredRef.current) return;
  lfSaveNodes(nodes);
}, [nodes]);

// 수정 후
useEffect(() => {
  if (!isRestoredRef.current || isDraggingNodeRef.current) return;
  lfSaveNodes(nodes);
}, [nodes]);
```

- `updateNodePosition`에서 `isDraggingNodeRef.current = true`
- `commitNodePosition`에서 `isDraggingNodeRef.current = false` (commit 후 정상 저장)

**잠재적 장애 요소:**
- ⚠️ `pointerup` 없이 드래그가 중단될 경우(앱 포커스 상실, 시스템 인터럽트 등) `isDraggingNodeRef.current`가 `true`에 고착되어 이후 모든 저장이 억제될 수 있음
  → **대응:** `window.blur` 또는 `visibilitychange` 이벤트에서 `isDraggingNodeRef.current = false` + 강제 저장 수행

- ⚠️ 드래그 완료 후 `commitNodePosition`이 `setNodes`를 호출하는 시점에 ref가 이미 `false`여야 persist effect가 정상 실행됨. 순서 보장 필요.
  → **확인:** `isDraggingNodeRef.current = false` → `setNodes(...)` 순서로 호출 → effect는 render 후 실행 → ref는 `false` → 저장 ✓

---

### Fix 3: `React.memo` — `NodeCard.tsx`
**파일:** `project_canvas/components/NodeCard.tsx`

`NodeCard`를 `React.memo`로 래핑하여 드래그 중 비이동 노드 리렌더 방지

```tsx
export default React.memo(NodeCard);
```

- `setNodes(prev => prev.map(n => n.id === id ? { ...n, position: pos } : n))`에서
  변경되지 않은 노드는 동일 객체 참조 반환 → React.memo가 skip
- 드래그 중 드래그 대상 1개만 리렌더, 나머지 N개 카드 리렌더 없음

**잠재적 장애 요소:**
- ⚠️ `NodeCard`에 전달되는 함수형 prop(`onSelect`, `onExpand` 등)의 참조가 매 렌더마다 새로 생성되면 React.memo가 항상 false를 반환하여 효과 없음
  → **확인:** `InfiniteCanvas.tsx`에서 `handleNodeMouseDown`은 `useCallback` ✓, 그 외 `onSelect` 등은 `page.tsx`에서 `useCallback` ✓
  → **단, `getPortLeft`, `getPortRight`, `selectedNodeIds.includes`는 인라인 계산** → `portLeft`, `portRight`, `isSelected`는 값(PortShape, boolean)으로 전달되므로 문제 없음 ✓
- ⚠️ `InfiniteCanvas`의 wrapper `div`(position: absolute, left/top) 자체는 여전히 리렌더됨
  → **영향 제한:** `div` 리렌더는 가볍고, `NodeCard`(img 포함) 리렌더가 차단되는 것이 핵심

---

## 체크리스트

- [ ] Fix 1: `InfiniteCanvas.tsx` RAF 쓰로틀 + pointerup 안전장치
- [ ] Fix 2: `page.tsx` 드래그 중 IndexedDB 저장 억제 + blur/visibility 안전장치
- [ ] Fix 3: `NodeCard.tsx` React.memo 래핑
- [ ] 로컬 dev 서버에서 마우스 드래그 정상 동작 확인
- [ ] 커밋 및 Vercel 배포
- [ ] iPad에서 펜슬 드래그 재현 테스트

---

## 예상 효과

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| pointermove 처리 빈도 | 240Hz | 60Hz (RAF) |
| 드래그 중 IndexedDB 쓰기 | 240회/초 | 0회 |
| 드래그 중 NodeCard 리렌더 | 전체 N개 | 1개 (드래그 대상) |
| Safari OOM 위험 | 높음 | 낮음 |
