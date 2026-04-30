# 작업지시서: ELEVATION / PRINT 이미지 미선택 시 토스트 처리

## 목표
이미지 선택 없이 ELEVATION 또는 PRINT 탭 버튼 클릭 시, CHANGE VIEWPOINT와 동일하게
토스트 "이미지를 선택해 주세요"를 표시하고 사이드바 패널을 열지 않는다.

## 토스트 메시지
"이미지를 선택해 주세요" (A안 — CHANGE VIEWPOINT / ELEVATION과 동일)

## 수정 파일
- `project_canvas/app/page.tsx` → `handleNodeTabSelect` 함수

## 체크리스트

- [ ] **변경 1 — ELEVATION, 노드 미선택 시 토스트**
  - 위치: "아트보드 미선택" 섹션 (line ~833)
  - `if (type === 'viewpoint')` → `if (type === 'viewpoint' || type === 'elevation')`
  - 효과: 노드가 선택되지 않은 상태에서 ELEVATION 클릭 시 사이드바 미열림 + 토스트 표시

- [ ] **변경 2 — PRINT, 이미지/스케치 노드 없을 때 토스트**
  - 위치: `if (type === 'print')` 블록 내 `imageNodes.length > 0` 분기 하단 (line ~735)
  - `imageNodes.length === 0`이면 `showToast('이미지를 선택해 주세요'); return;` 추가
  - 효과: 이미지/스케치 노드 미선택 시 사이드바 미열림 + 토스트 표시

## 완료 기준
- 이미지 노드 미선택 + ELEVATION 클릭 → 토스트만 표시, 사이드바 패널 열리지 않음
- 이미지/스케치 노드 미선택 + PRINT 클릭 → 토스트만 표시, 사이드바 패널 열리지 않음
- 이미지 노드 선택 후 ELEVATION/PRINT 클릭 → 기존 정상 동작 유지
