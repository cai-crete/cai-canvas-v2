# 3D Map 뷰포인트 최적화

> 작성: 2026-04-29
> 상태: 승인 대기

## 목표

3D Map의 초기 카메라 시점을 도로 분석 데이터 기반으로 정확하게 설정한다.
현재는 height 500m 고정, heading+45° 고정으로 대지 규모와 주변 여건을 반영하지 못함.

## 변경 사항 3건

### 1. 카메라 높이 동적 계산 (면적 기반)

**파일**: `planners/lib/roadApi.ts`

**변경 내용**:
- `calculateFacade()`에 `landArea` 파라미터 추가
- 높이 공식: `cameraHeight = √(landArea / π) × 3.5`
- 클램프: min 80m, max 600m
- `landArea`가 없으면 GeoJSON Shoelace 계산 fallback

**파일**: `app/page.tsx`

**변경 내용**:
- `handleCadastralDataReceived()`에서 Planners 노드의 `plannerInsightData.landCharacteristics.landArea` 읽기
- `calculateFacade()` 호출 시 `landArea` 전달

### 2. 카메라 좌우 오프셋 동적 계산 (개방 측면 판단)

**파일**: `planners/lib/roadApi.ts`

**변경 내용**:
- `calculateFacade()` 반환값에 `offsetAngle` 추가 (현재 고정 +45° → 동적)
- 메인 도로 접면 변 기준으로 좌측/우측 인접 변 식별
- 각 인접 변 방향에 도로가 있는지 확인 (roads 데이터 활용)
  - 좌측에 도로 있고 우측에 없음 → `offsetAngle = -45` (좌측에서 바라봄)
  - 우측에 도로 있거나 양측 다 열림 → `offsetAngle = +45` (우측에서 바라봄)
  - 양측 다 막힘 → `offsetAngle = 0` (정면)

**파일**: `components/Map3DView.tsx`

**변경 내용**:
- `calcCamera()`의 고정 `heading + 45` → 외부에서 전달받은 값 사용
- `Map3DViewProps`에 `offsetAngle` 추가 또는 heading에 이미 합산된 값 사용

### 3. FacadeResult 확장 및 데이터 플로우

**타입 변경** (`planners/lib/roadApi.ts`):
```typescript
export interface FacadeResult {
  heading: number;      // 메인 도로 외향 법선 (기존)
  height: number;       // 동적 계산된 카메라 높이 (변경)
  offsetAngle: number;  // 카메라 좌우 오프셋 각도 (신규)
  roadInfo: string;     // 도로 접면 정보 (기존)
}
```

**데이터 플로우**:
```
Planners 노드 landArea
       ↓
page.tsx: handleCadastralDataReceived()
       ↓
roadApi.ts: calculateFacade(boundary, roads, landArea)
       ↓
FacadeResult { heading, height, offsetAngle, roadInfo }
       ↓
page.tsx: updateNode(map3dId, { map3dHeading, map3dHeight, map3dOffsetAngle })
       ↓
ExpandedView.tsx → Map3DView props
       ↓
Map3DView.tsx: calcCamera(center, heading, height, offsetAngle)
```

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `planners/lib/roadApi.ts` | calculateFacade 확장 (면적→높이, 개방측면→오프셋) |
| `app/page.tsx` | landArea 읽기 + calculateFacade에 전달 + 새 필드 저장 |
| `types/canvas.ts` | `map3dOffsetAngle` 필드 추가 |
| `components/Map3DView.tsx` | calcCamera에 offsetAngle 반영, props 추가 |
| `components/ExpandedView.tsx` | offsetAngle prop 전달 |

## 체크리스트

- [x] 1. `roadApi.ts` — calculateFacade 면적 기반 높이 계산 추가
- [x] 2. `roadApi.ts` — calculateFacade 좌우 개방 판단 + offsetAngle 반환
- [x] 3. `types/canvas.ts` — map3dOffsetAngle 필드 추가
- [x] 4. `app/page.tsx` — landArea 읽기 + 새 필드 저장
- [x] 5. `components/Map3DView.tsx` — calcCamera에 offsetAngle 적용
- [x] 6. `components/ExpandedView.tsx` — offsetAngle prop 전달
- [x] 7. tsc 빌드 확인
- [ ] 8. 브라우저 검증 (사용자 확인 대기)
