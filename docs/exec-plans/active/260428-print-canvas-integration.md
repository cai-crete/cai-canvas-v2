# 작업지시서: Print ↔ Canvas 완전 통합

**작성일**: 2026-04-28  
**최종 업데이트**: 2026-04-28 (버그 수정 추가 + Phase 재구조화)  
**상태**: Phase 0 완료, Phase 1 대기  
**요청자**: bzoo@cre-te.com

---

## 요구사항 요약

| # | 요구사항 | 핵심 |
|---|---------|------|
| 0 | **[버그]** print 노드 선택 시 사이드바가 'planners'로 표시됨 | `handleNodeCardSelect` 수정 |
| 1 | Print Expanded View 사이드바를 Canvas 스타일로 통일 | '<-' 버튼 + 'PRINT' 탭 헤더, 좌측 'X' 버튼 제거 |
| 2 | Canvas print 사이드바 = Expanded print 사이드바 (동일 구성 + 동일 작동) | Canvas '->' / Expanded '<-' 방향 버튼만 차이 |
| 3 | Canvas에서 image 아트보드 선택 → 'print' 클릭 → 이미지 슬롯 자동 삽입 → GENERATE 시 expanded 자동 생성 | 다중 선택 지원 |

---

## 버그 분석: print 선택 시 planners 사이드바 표시

### 원인

`page.tsx` → `handleNodeCardSelect`:

```tsx
if (node.artboardType === 'thumbnail') {
  setActiveSidebarNodeType('planners');  // ← print도 artboardType='thumbnail'이므로 여기 진입
}
```

`types/canvas.ts`의 `ARTBOARD_COMPATIBLE_NODES.thumbnail = ['planners', 'print']`이므로
print 노드도 생성 완료 후 `artboardType === 'thumbnail'`이 된다.  
결과: print 노드 선택 → 사이드바에 planners 표시 → '→' 버튼 클릭 시 planners expand 진입.

---

## 상태 용어 정의 (혼동 방지)

| 용어 | 타입 | 설명 |
|------|------|------|
| `printDraftState` | `PrintDraftState` (`images: File[]`, `mode`, `prompt`, …) | 사용자가 사이드바에서 편집 중인 임시 상태. 직렬화 불가, session에만 유지 |
| `printSavedState` | `PrintSavedState` (`html`, `thumbnail`, `mode`, `metadata`) | 생성 완료 후 IndexedDB에 저장되는 결과 상태 |
| `printSelectedImages` | `SelectedImage[]` (`base64`, `mimeType`) | Canvas 노드에 저장되는 이미지 목록. IndexedDB에 저장됨 |

---

## 공통 유틸리티

**위치**: `project_canvas/lib/printUtils.ts` (신규 파일, Phase 4에서 생성)

```typescript
// SelectedImage[] → File[] (비동기, Base64 → Blob → File)
export async function selectedImagesToFiles(images: SelectedImage[]): Promise<File[]> {
  return Promise.all(images.map(async (img) => {
    const dataUri = img.base64.startsWith('data:')
      ? img.base64
      : `data:${img.mimeType};base64,${img.base64}`;
    const res  = await fetch(dataUri);
    const blob = await res.blob();
    return new File([blob], img.filename || `image_${img.id}.jpg`, { type: img.mimeType });
  }));
}
```

---

## 구현 계획 (Phase별 단일 책임)

> **원칙**: 각 Phase는 단일 파일(또는 최소 파일) 수정. 독립적으로 구현·검증 가능.

---

### Phase 0: 버그 수정 ✅ 완료
**파일**: `project_canvas/app/page.tsx`

```tsx
// 수정 전
setActiveSidebarNodeType('planners');
// 수정 후
setActiveSidebarNodeType(node.type === 'print' ? 'print' : 'planners');
```

- [x] `handleNodeCardSelect`에서 print/planners 분기 수정

---

### Phase 1: Print Expanded View 사이드바 통합 ✅ 완료
**파일**: `project_canvas/print/ExpandedView.tsx` (단독)

#### 체크리스트
- [x] `renderToolbarWrapper`에서 'X' (✕) 닫기 버튼 제거 (Undo/Redo/Library/Save 버튼은 유지)
- [x] `useState(true)`로 `sidebarOpen` 상태 추가
- [x] `renderSidebarWrapper` 콜백 구현 및 `PkgPrintExpandedView`에 전달
  - 헤더: 좌측 pill에 '←' 버튼 (`onClick={onCollapse}`) + 우측 flex-1 pill에 'PRINT' 텍스트 + 접기 chevron
  - 본문: `sidebarOpen` 시 white box (`borderRadius: var(--radius-box)`, `boxShadow: var(--shadow-float)`)
  - 본문 컨테이너: `display: flex, flexDirection: column, height: 100%` 강제 (패키지 스타일 충돌 방지)
  - 위치: `position: absolute, right: 1rem, top: 1rem, bottom: 1rem, width: var(--sidebar-w)`

```tsx
const [sidebarOpen, setSidebarOpen] = useState(true);

const renderSidebarWrapper = useCallback((content: React.ReactNode) => (
  <div style={{
    position: 'absolute', right: '1rem', top: '1rem', bottom: '1rem',
    width: 'var(--sidebar-w)', display: 'flex', flexDirection: 'column',
    gap: '0.5rem', zIndex: 90,
  }}>
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexShrink: 0 }}>
      <div style={pillBase}><button onClick={onCollapse} style={collapseBtn}>←</button></div>
      <div style={{ ...pillBase, flex: 1 }}>
        <button onClick={() => setSidebarOpen(v => !v)} style={tabBtn}>
          <span>PRINT</span>
          <span>{sidebarOpen ? <ChevronUp /> : <ChevronDown />}</span>
        </button>
      </div>
    </div>
    {sidebarOpen && (
      <div style={{
        background: 'var(--color-white)', borderRadius: 'var(--radius-box)',
        boxShadow: 'var(--shadow-float)', flex: 1, minHeight: 0, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {content}
        </div>
      </div>
    )}
  </div>
), [onCollapse, sidebarOpen]);
```

#### 검증
- Print Expanded 진입 시 좌측 'X' 버튼 없음
- 우측에 '←' 버튼 + 'PRINT' 탭 표시
- '←' 클릭 → Canvas로 복귀
- 'PRINT' 탭 클릭 → 사이드바 접기/펼치기

---

### Phase 2: RightSidebar — print 패널 교체
**파일**: `project_canvas/components/RightSidebar.tsx` (단독)  
**변경량**: ~20줄 추가/수정

#### 체크리스트
- [ ] `PrintCanvasSidebarPanel` import 추가 (`@cai-crete/print-components`)
- [ ] Props 인터페이스에 print 전용 props 추가
  ```tsx
  printSavedState?: PrintSavedState;
  onPrintAction?: (type: string, draft?: PrintDraftState) => void;
  ```
- [ ] `isPanelMode` 분기에서 print 타입 처리 추가
  ```tsx
  const isPrint    = activeSidebarNodeType === 'print';
  // ...
  {isPrint ? (
    <PrintCanvasSidebarPanel savedState={printSavedState} onAction={onPrintAction!} />
  ) : isPlanners ? (
    <PlannerReportPanel ... />
  ) : isViewpoint ? (
    <ChangeViewpointPanel ... />
  ) : (
    <NodePanel ... />
  )}
  ```

#### 검증
- print 탭 클릭 → ImageInsert + PurposeSelector + PageCountControl + PromptInput + GENERATE/EXPORT 패널 표시
- planners 탭 클릭 → 기존 PlannerReportPanel 그대로 표시

---

### Phase 3: page.tsx — print 사이드바 액션 연결
**파일**: `project_canvas/app/page.tsx` (단독)  
**변경량**: ~30줄 추가

#### 체크리스트
- [ ] `printDraftState` 상태 추가: `useState<PrintDraftState | null>(null)`
- [ ] `handlePrintSidebarAction` 구현
  ```tsx
  const handlePrintSidebarAction = useCallback((type: string, draft?: PrintDraftState) => {
    if (type === 'generate' && selectedNodeId) {
      if (draft) setPrintDraftState(draft);
      setExpandedNodeId(selectedNodeId);
      setActiveSidebarNodeType(null);
    }
    if (type === 'export' && selectedNodeId) {
      setExpandedNodeId(selectedNodeId);
      setActiveSidebarNodeType(null);
    }
  }, [selectedNodeId]);
  ```
- [ ] `RightSidebar`에 print 전용 props 전달
- [ ] `printDraftState` 실시간 동기화: Expanded 진입 시 `initialDraftState`로 전달하여 사용자 입력 유실 방지

#### 검증
- Canvas print 패널 → GENERATE 클릭 → print expanded view 자동 진입
- Canvas에서 입력한 프롬프트가 expanded 진입 후에도 유지됨

---

### Phase 4: autoGenerate + 공통 유틸
**파일**: `project_canvas/lib/printUtils.ts` (신규) + `project_canvas/print/ExpandedView.tsx` + `project_canvas/components/ExpandedView.tsx`  
**변경량**: 신규 파일 ~15줄 + 기존 파일 ~25줄 수정

#### 체크리스트
- [ ] `lib/printUtils.ts` 신규 생성 (`selectedImagesToFiles` 함수)
- [ ] `print/ExpandedView.tsx`: `autoGenerate?: boolean` prop 추가
- [ ] Race Condition 방지 Guard 로직
  ```typescript
  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (!props.autoGenerate || hasAutoGenerated.current) return;
    if (images.length === 0) return;
    hasAutoGenerated.current = true;
    handleGenerate();
  }, [images]);
  ```
- [ ] `components/ExpandedView.tsx`: print 노드에 `autoGenerate` prop 전달
- [ ] `page.tsx`: `handlePrintSidebarAction`에서 expand 시 `autoGenerate: true` 전달

#### 검증
- Canvas GENERATE → Expanded 자동 진입 → 생성 자동 시작
- autoGenerate가 중복 실행되지 않음

---

### Phase 5: 이미지 다중 선택 → Print 자동 삽입
**파일**: `project_canvas/app/page.tsx` (단독)  
**변경량**: ~30줄 추가

#### 체크리스트
- [ ] print 탭 클릭 시 선택된 image 노드 감지
- [ ] 비동기 피드백: `showToast('이미지를 준비하는 중입니다...', 'success')` 표시
- [ ] `selectedImagesToFiles()` 변환 → `PrintDraftState.images`에 세팅
- [ ] expanded 진입 시 이미지 + `autoGenerate: true` 전달

#### 검증
- image 아트보드 다중 선택 → print 탭 → GENERATE → "이미지 준비 중..." 토스트 → Expanded에서 해당 이미지로 자동 생성

---

## 위험 요소

| # | 위험 | 대안 |
|---|------|------|
| 1 | `PrintCanvasSidebarPanel`이 node_modules에 위치 → 수정 불가 | Props로 제어, 로컬 래퍼 사용 |
| 2 | `PrintDraftState.images: File[]` 직렬화 불가 | session state로만 유지 |
| 3 | `renderSidebarWrapper` 레이아웃 충돌 | `display:flex, flexDirection:column, height:100%` 강제 |
| 4 | autoGenerate Race Condition | `useRef` guard + `images` state 의존성 |

---

## 구현 우선순위

```
Phase 0 ✅ (버그 수정, 완료)       → handleNodeCardSelect print/planners 분기
Phase 1 (필수, 빠름, 위험 낮음)   → print/ExpandedView.tsx 사이드바 통합
Phase 2 (필수, 빠름, 위험 낮음)   → RightSidebar.tsx print 패널 교체
Phase 3 (필수, 보통, 위험 중간)   → page.tsx 액션 연결 + draft 동기화
Phase 4 (필수, 보통, 위험 낮음)   → autoGenerate + printUtils.ts
Phase 5 (권장, 보통, 위험 낮음)   → 이미지 다중 선택 → 자동 삽입
```

**의존성**: Phase 0 → (Phase 1, Phase 2 병행 가능) → Phase 3 → Phase 4 → Phase 5

---

## 완료 기준

- [x] print 노드 선택 시 우측 사이드바에 'PRINT' 탭 표시 (planners 아님)
- [x] '→' 버튼 클릭 시 print expanded view 진입 (planners 아님)
- [x] Print Expanded View 좌측 툴바에 'X' 버튼 없음
- [x] Print Expanded View에 '<-' 버튼이 있고, 누르면 Canvas로 돌아감
- [x] Expanded 사이드바 내부 스크롤이 깨지지 않음
- [ ] Canvas에서 print 탭 클릭 시 ImageInsert + PurposeSelector + PageCountControl + PromptInput + GENERATE 패널 표시
- [ ] Canvas 사이드바에서 입력한 프롬프트/설정이 Expanded 진입 후에도 유지됨
- [ ] Canvas print 패널에서 GENERATE 클릭 시 Expanded 진입 + 자동 생성 시작
- [ ] autoGenerate 중복 실행 없음
- [ ] Canvas에서 image 노드 선택 후 print GENERATE → "이미지 준비 중..." 피드백 → 해당 이미지로 자동 생성
