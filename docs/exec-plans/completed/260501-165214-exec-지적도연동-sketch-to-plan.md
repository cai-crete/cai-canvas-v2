# 260501-165214 | 지적도 연동 Sketch-to-Plan 구현

## 목표
- 스케치 노드의 배경 이미지(지적도/위성사진)와 스트로크를 **분리 전송**
- 지적도/위성사진이 감지되면 대지 경계·스케일·방향이 **절대값(Immutable Anchor)**
- Generate 이후 스케치 스트로크 **편집 가능** (sketchPaths 보존 버그 수정)

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `project_canvas/components/SketchCanvas.tsx` | `exportStrokesOnly()` 메서드 추가 |
| `project_canvas/sketch-to-plan/ExpandedView.tsx` | 듀얼 export + sketchPaths 보존 수정 |
| `project_canvas/hooks/usePlanGeneration.ts` | `cadastralImageBase64` 파라미터 추가 |
| `project_canvas/app/api/sketch-to-plan/route.ts` | `cadastral_image` 전달 |
| `render-server/src/routes/sketchToPlan.ts` | 듀얼 이미지 수신 + AI 전달 |
| `project_canvas/sketch-to-plan/_context/protocol-sketch-to-plan-v3.8.txt` → v3.9 | 지적도 절대 앵커 규칙 추가 |

## 우선순위 계층 (구현 원칙)

```
[최우선] cadastral_image (지적도/위성사진)
  → 대지 경계, 스케일, 방향 = 절대 불변 (Immutable)

[2순위] sketch_image (스트로크만)
  → 대지 내 건물 위상 (방 배치, 동선) = 고정값

[3순위] 텍스트 (user_prompt, floor_type, grid_module)
  → 건축 해석 가이드 = 보조
```

## 체크리스트

- [x] exec-plan 생성
- [ ] SketchCanvas: exportStrokesOnly() 추가
- [ ] ExpandedView: 듀얼 export + sketchPaths 보존
- [ ] usePlanGeneration: cadastralImageBase64 추가
- [ ] API route (proxy): cadastral_image 전달
- [ ] render-server: 듀얼 이미지 처리
- [ ] protocol v3.9: 지적도 절대 앵커 섹션 추가
