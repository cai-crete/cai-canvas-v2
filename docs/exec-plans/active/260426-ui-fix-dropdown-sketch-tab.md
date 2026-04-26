# 작업지시서: UI 수정 — [+] 드롭다운 위치 변경 & SKETCH 탭 삭제

**생성일**: 2026-04-26  
**담당**: AGENT C (디자인 에이전트)

---

## 요구사항

### 1. [+] 버튼 드롭다운 위치 변경
- **현재**: [+] 버튼 클릭 시 드롭다운이 버튼 **상단**에 표시
- **변경**: 드롭다운이 [+] 버튼 **우측**에 표시
- **패딩**: [+] 버튼과 드롭다운 사이 간격 = 기존 상단 간격과 동일하게 유지 (`0.5rem`)

### 2. 우측 패널 'SKETCH' 탭 삭제
- `NODE_ORDER` 배열에서 `'sketch'` 제거

---

## 변경 파일

### `project_canvas/components/LeftToolbar.tsx`
드롭다운 메뉴 div의 position 속성 변경:
- 기존: `bottom: 'calc(100% + 0.5rem)'`, `left: '50%'`, `transform: 'translateX(-50%)'`
- 변경: `top: '50%'`, `left: 'calc(100% + 0.5rem)'`, `transform: 'translateY(-50%)'`

### `project_canvas/types/canvas.ts`
NODE_ORDER 배열에서 `'sketch'` 제거:
- 기존: `['planners', 'plan', 'image', 'elevation', 'viewpoint', 'diagram', 'print', 'sketch']`
- 변경: `['planners', 'plan', 'image', 'elevation', 'viewpoint', 'diagram', 'print']`

---

## 체크리스트

- [x] LeftToolbar.tsx 드롭다운 위치 수정
- [x] canvas.ts NODE_ORDER 'sketch' 제거
- [ ] 빌드 검증

---

COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.
