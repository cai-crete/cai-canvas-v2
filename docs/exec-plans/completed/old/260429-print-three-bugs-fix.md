# 작업지시서: Print 3대 버그 수정

**작성일**: 2026-04-29  
**상태**: 완료  
**요청자**: bzoo@cre-te.com

---

## 보고된 문제

| # | 증상 | 유형 |
|---|------|------|
| 1 | Canvas에서 print 노드 썸네일이 보이지 않음 | 재발 |
| 2 | Canvas에서 썸네일 클릭 시 사이드바 이미지 슬롯에 삽입 이미지가 없음 | 신규(초기부터 존재) |
| 3 | 생성 후 저장 → Canvas 복귀 → Expand 재진입 시 문서 유실 | 재발 |

---

## 근본 원인 분석

### 공통 원인 (Issues 2, 3)

**파일**: `project_canvas/components/ExpandedView.tsx` — 246~255번째 줄

`onPrintNodeUpdate`가 전달되지 않으면:

- **Issue 3**: `handleSave` → `onPrintNodeUpdate?.({ printSavedState: {...} })` → **no-op**  
  → `node.printSavedState = null` 유지 → Expand 재진입 시 `savedState={null}` → 문서 유실

- **Issue 2**: `handleImagesChange` → `onPrintNodeUpdate?.({ printSelectedImages: images })` → **no-op**  
  → 노드의 `printSelectedImages` 미갱신 + `printSavedState` 미저장  
  → `PrintCanvasSidebarPanel`에 `savedState={undefined}` 전달 → 이미지 슬롯 빈 상태

---

### Issue 1 — 썸네일 렌더링 버그

**파일**: `project_canvas/components/NodeCard.tsx` — 387번째 줄

패키지(`PkgPrintExpandedView`)가 `result.thumbnail`을 data URL 형태로 반환하면 이중 접두사가 생겨 이미지가 렌더링되지 않음.

---

## 해결 방안

### Phase 1: NodeCard.tsx 썸네일 렌더링 수정 (Issue 1)

**체크리스트**:
- [x] `NodeCard.tsx` 387번째 줄 수정 (1줄)
- [ ] 검증: print 노드 생성·저장 후 Canvas 복귀 시 썸네일 표시 확인

---

### Phase 2: components/ExpandedView.tsx Props 연결 (Issues 2, 3)

#### 2-A. `components/ExpandedView.tsx` Props 인터페이스 + print 분기 수정

**체크리스트**:
- [x] Props 인터페이스에 3개 prop 추가
- [x] 함수 시그니처에 3개 param 추가
- [x] print 분기 JSX에 3개 prop 전달

#### 2-B. `page.tsx` ExpandedView 호출부에 3개 prop 추가

**체크리스트**:
- [x] `<ExpandedView>` 호출부에 3개 prop 추가
- [ ] 검증: 생성 → 저장 → Canvas 복귀 → Expand 재진입 시 문서 유지 확인 (Issue 3)
- [ ] 검증: Canvas에서 썸네일 클릭 → 사이드바 이미지 슬롯 표시 확인 (Issue 2)

---

## 완료 기준

- [ ] Canvas에서 print 노드 생성·저장 후 썸네일 표시됨 (Issue 1)
- [ ] Canvas에서 print 썸네일 클릭 → 사이드바에 이미지 슬롯 표시됨 (Issue 2)
- [ ] 생성·저장 → Canvas 복귀 → Expand 재진입 시 문서 유지됨 (Issue 3)
- [ ] 기존 other 노드 썸네일 렌더링 회귀 없음
