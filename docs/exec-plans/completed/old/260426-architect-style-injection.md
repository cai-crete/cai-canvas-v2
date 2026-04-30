# 작업지시서: 건축가 스타일 A-G 프롬프트 주입

**작성일:** 2026-04-26  
**상태:** 계획 수립 완료 → 승인 대기

---

## 배경 분석

### 현재 구조
| 레이어 | 파일 | 현재 상태 |
|--------|------|-----------|
| UI | `SketchToImagePanel.tsx` | A-G 버튼 + 제목/키워드 표시 ✅ |
| 훅 | `useBlueprintGeneration.ts` | `style_mode` 문자열 전달 ✅ |
| API | `app/api/sketch-to-image/route.ts` | `style_mode` 받아서 **텍스트로만 언급** ⚠️ |
| 프롬프트 | `lib/prompt.ts` | `buildSystemPrompt()` 다수 파일 조합 가능 ✅ |

### 문제
`style_mode = 'A'`가 API에 도달해도 실제 건축가 시스템 프롬프트가 주입되지 않음.  
API 분석 프롬프트에 `스타일 모드: A` 라는 문자열만 포함될 뿐, Chipperfield의 4-Phase 프로세스는 전혀 전달되지 않음.

### 건축가-스타일 매핑
| 스타일 | 건축가 | 키워드 |
|--------|--------|--------|
| A | David Chipperfield | Vitruvian Tectonics, Fragment-Stagger-Layer |
| B | Richard Meier | Geometric Purity, Grid-Layer-Elevate |
| C | Kengo Kuma | Particlization, Divide-Layer-Dissolve |
| D | Mario Botta | Incised Geometry, Extrude-Incise-Stripe |
| E | Frank Gehry | Sculptural Fluidity, Collide-Curve-Fragment |
| F | Peter Eisenman | Diagrammatic Formalism, Grid-Transform-Index |
| G | Renzo Piano | Tectonic Transparency, Module-Layer-Float |

---

## 구현 계획

### 접근 방식: TypeScript 모듈로 스타일 프롬프트 관리

파일 I/O 없이 빌드타임에 번들링 → 런타임 안전, 타입 지원

---

### 체크리스트

#### Step 1: 스타일 프롬프트 모듈 생성
- [ ] `project_canvas/lib/architect-styles.ts` 생성
  - `ARCHITECT_STYLE_PROMPTS: Record<string, string>` 맵 (A~G)
  - 각 건축가의 4-Phase 전체 프롬프트 포함 (텍스트 파일 내용 그대로)
  - `getStylePrompt(styleMode: string): string | null` 헬퍼 함수

#### Step 2: API 라우트 수정
- [ ] `project_canvas/app/api/sketch-to-image/route.ts` 수정
  - `getStylePrompt(style_mode)` 호출
  - `systemPrompt = buildSystemPrompt(protocolContent, stylePrompt ? [stylePrompt] : [])` 로 변경
  - 분석 프롬프트에 "스타일 모드: ${style_mode}" → "스타일 모드: ${style_mode} (건축가 가이드라인이 시스템 프롬프트에 포함됨)"으로 개선

#### Step 3: (선택) 분석 단계에 스타일 컨텍스트 강화
- [ ] Phase 1 분석 프롬프트에 스타일 키 명시 유지 (이미 시스템 프롬프트에 포함되어 중복 인식)

---

## 수정 파일 목록

```
CREATE  project_canvas/lib/architect-styles.ts     (신규 — 스타일 프롬프트 맵)
MODIFY  project_canvas/app/api/sketch-to-image/route.ts  (스타일 주입 추가)
```

변경 없음:
- `SketchToImagePanel.tsx` — UI 완성 상태 유지
- `useBlueprintGeneration.ts` — 전달 로직 변경 없음
- `lib/prompt.ts` — `buildSystemPrompt()` 그대로 활용
- `_context/protocol-sketch-to-image-v2.3.txt` — 기존 베이스 프로토콜 유지

---

## 주의사항

- 각 건축가 프롬프트는 **베이스 프로토콜(5-Room) 위에 레이어**로 추가됨 (override 아님)
- `style_mode = 'NONE'`이면 stylePrompt = null → 기존 동작 그대로
- 프롬프트 길이 증가로 토큰 비용 증가 예상 (건축가 프롬프트 약 800~1200 토큰)
