# 작업지시서: sketch 타입 노드 INPUT IMAGES 업로드 버그 수정

**작성일:** 2026-04-30  
**요청자:** 사용자  
**담당:** AGENT C (프론트엔드 수정)

---

## 문제 설명

다중 선택 시 노드 타입이 `sketch`인 것을 포함하여 [IMAGE] 클릭해도 INPUT IMAGES에 업로드되지 않는다.

---

## 원인 분석

### 원인 1 — sketchInputNodes 필터 누락 (`page.tsx:875`)

```ts
// 현재 (버그)
.filter((n): n is CanvasNode => !!n && (n.artboardType === 'image' || n.artboardType === 'sketch'));
```

`type === 'sketch'` 노드는 생성 시 `artboardType: 'blank'`로 초기화 (page.tsx:394).  
`'blank'`는 필터를 통과하지 못해 `sketchInputNodes`에서 제외됨.  
→ `sketchInputNodes.length < 2` → 다중 소스 경로 미진입.

### 원인 2 — slot1 중복 버그 (`page.tsx:885`)

두 노드 모두 `isSketchArtboard === true`이면:
- `elevNode = sketchInputNodes.find(isSketchArtboard)` → **index 0**
- `slot0 = sketchInputNodes[0]`
- `slot1 = elevNode` → **slot0과 동일한 노드**

두 슬롯이 같은 노드를 가리켜 입력 이미지 실질적으로 1개만 로드됨.

---

## 수정 계획

### 수정 1 — `project_canvas/app/page.tsx:875`

```ts
// 수정 후
.filter((n): n is CanvasNode => !!n && (
  n.artboardType === 'image' || n.artboardType === 'sketch' || n.type === 'sketch'
));
```

### 수정 2 — `project_canvas/app/page.tsx:885`

```ts
// 수정 전
const slot1 = elevNode ?? sketchInputNodes[1];

// 수정 후
const slot1 = (elevNode && elevNode.id !== slot0.id)
  ? elevNode
  : sketchInputNodes.find(n => n.id !== slot0.id) ?? sketchInputNodes[1];
```

---

## 체크리스트

- [x] 작업지시서 작성
- [x] page.tsx:875 필터 수정
- [x] page.tsx:885 slot1 중복 방지 수정
- [x] 동작 확인 (타입스크립트 오류 없음)
- [x] progress 파일 저장
