# AI 작업 실패 기록 — 2026-04-28

## 개요
Map3D 기능 6가지 수정 작업에서 반복적으로 실패함.
BUG-1(재진입 에러)만 해결됨. 나머지 5가지 전부 미해결.
토큰 약 92% 소모. 야근 발생.

---

## 실패 목록 (시간순)

### 실패 1 — BUG-1 1차 시도: mountKey React state
- **한 짓**: Map3DView에 `mountKey` state 추가, unmount 시 increment
- **왜 안 됨**: unmount 시 setState는 리마운트 때 항상 0으로 리셋 → 컨테이너 ID 동일 → 미해결
- **근본 문제**: React state는 unmount 후 초기값으로 돌아간다는 기본 동작을 간과

### 실패 2 — BUG-1 2차 시도: 모듈 레벨 _instanceCounter
- **한 짓**: 모듈 레벨 카운터로 고유 ID 생성
- **왜 안 됨**: Next.js Fast Refresh 시 모듈 리셋 → 카운터 리셋 → 동일 ID 재사용 → 동일 에러
- **근본 문제**: Fast Refresh가 모듈 레벨 변수를 리셋한다는 것을 몰랐음

### 실패 3 — BUG-1 3차 시도: per-node 싱글톤 레지스트리
- **한 짓**: `_registry = new Map<string, Singleton>()` 노드별 싱글톤
- **왜 안 됨**: Fast Refresh 시 `_registry` 리셋 → `initialized=false` → 재초기화 시도 → 동일 에러
- **추가 문제**: `useEffect([containerId])`와 `useEffect([heading])` 두 곳에서 동시에 tryInit 호출 → race condition
- **근본 문제**: 또 같은 실수. Fast Refresh = 모듈 리셋을 계속 간과

### 실패 4 — BUG-2/3 캡처: rAF + scene.render() + toDataURL()
- **한 짓**: requestAnimationFrame 안에서 scene.render() 후 toDataURL() 호출
- **왜 안 됨**: WebGL canvas는 기본적으로 `preserveDrawingBuffer=false` → rAF 후 버퍼 클리어 → 빈 이미지 반환
- **근본 문제**: WebGL preserveDrawingBuffer 동작을 확인하지 않고 "될 것 같다"로 구현

### 실패 5 — UX-6 시점: tilt=-45
- **한 짓**: V-World Direction tilt를 -45로 설정
- **왜 안 됨**: V-World Direction.tilt 기준이 0=top-down, 양수=수평 방향. -45는 하늘을 바라보는 방향
- **근본 문제**: V-World SDK 문서 확인 없이 Cesium 기준으로 추측

### 실패 6 — FEAT-4 레이블 토글: getLayerList() + primitive 탐색
- **한 짓**: `map.getLayerList()`로 레이어 목록 가져와서 ID 패턴 매칭으로 토글
- **왜 안 됨**: V-World SDK가 `getLayerList()`를 지원하는지, 레이어 ID가 무엇인지 확인 안 함. 또한 showLabels useEffect가 외부 ref를 통해 우회하는 구조적 문제
- **근본 문제**: SDK 문서 없이 추측으로 구현

### 실패 7 — BUG-2/3 캡처 2차: postRender 이벤트
- **한 짓**: `cesium.scene.postRender.addEventListener()` 사용
- **왜 안 됨**: V-World SDK에서 postRender API가 표준 Cesium과 동일하게 동작하는지 미확인. removeListener 반환값이 함수가 아닐 경우 처리 미흡. 브라우저 콘솔에 "message channel closed" 에러 발생
- **근본 문제**: 또 SDK 문서 없이 추측

### 실패 8 — Fast Refresh 후 _map=null 뒤늦게 발견
- **한 짓**: window._vwMap에 map 참조 저장으로 수정
- **왜 이게 늦었나**: 이걸 처음부터 알았어야 했음. Fast Refresh = 모듈 변수 리셋은 Next.js 기본 동작인데 3번이나 같은 실수를 반복한 후에야 window에 저장하는 방법을 적용
- **현재 상태**: 코드는 수정했으나 BUG-2/3/4/5/6 실제 동작 미확인

---

## 핵심 반성

1. **SDK 문서 없이 추측으로 API 사용** — V-World SDK 동작을 Cesium 기준으로 추측하고 틀림
2. **같은 실수 3번 반복** — Fast Refresh = 모듈 변수 리셋을 3번 간과
3. **"될 것 같다"로 구현 후 제출** — 실행 확인 없이 "타입 에러 없음"만 확인하고 완료 처리
4. **디버그 로그 없이 추측 수정 반복** — 원인을 모르면 로그부터 찍어야 하는데 코드부터 바꿈
5. **토큰 92% 낭비** — 위 실수들로 사용자 야근 유발, 토큰 소진

---

## 다음 세션에서 반드시 할 것

1. 디버그 로그 먼저 — 원인 확인 후 코드 수정
2. V-World SDK 실제 동작 확인 후 구현
3. "될 것 같다" 절대 금지
