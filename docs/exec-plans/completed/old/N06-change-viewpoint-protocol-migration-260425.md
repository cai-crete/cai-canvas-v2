# N06 Change Viewpoint — Protocol 이식 및 구조 정렬 계획

> **작성일**: 2026-04-25  
> **작성자**: AGENT A  
> **기반 세션**: 260424-190000-progress.txt (SDK 마이그레이션 완료 후 후속 작업)

---

## 문제 진단

### 왜 여전히 503이 발생할 수 있는가

SDK 마이그레이션(`@google/generative-ai` → `@google/genai`)은 완료됐지만,  
`change-viewpoint/route.ts`의 구조가 `sketch-to-image` / `sketch-to-plan`과 다르다.

| 항목 | STI / STP | change-viewpoint (현재) |
|------|-----------|------------------------|
| 프로토콜 위치 | `_context/*.txt` 파일로 분리 | `route.ts` 안에 인라인 문자열 상수 |
| `lib/prompt.ts` 통해 로드 | ✅ `loadProtocolFile` 사용 | ❌ 직접 상수 참조 |
| `project_canvas/[feature]/` 폴더 | ✅ 존재 | ❌ 없음 |
| `callWithFallback` 시그니처 | 클로저 패턴 | `ai` 파라미터 방식 (불일치) |
| `config.systemInstruction` 위치 | 분석 Phase에만 포함 | 분석 Phase에만 포함 (동일) |

추가로, `lib/prompt.ts`의 `loadProtocolFile()`은 `change-viewpoint/_context/` 경로를 탐색하지 않아,  
향후 프로토콜 파일을 분리해도 로드가 불가능한 상태다.

---

## 목표

`sketch-to-image` · `sketch-to-plan`과 동일한 구조로 `change-viewpoint`를 정렬:
1. 프로토콜을 별도 `.txt` 파일로 분리
2. `lib/prompt.ts`에 `change-viewpoint/_context/` 탐색 경로 추가
3. `route.ts`를 `loadProtocolFile` + `buildSystemPrompt` 패턴으로 리팩터링
4. `callWithFallback` 시그니처를 STI/STP 클로저 패턴으로 통일

---

## 파일 변경 목록

| 파일 | 작업 | 비고 |
|------|------|------|
| `project_canvas/change-viewpoint/_context/protocol-change-viewpoint-v1.txt` | **신규 생성** | 인라인 `PROTOCOL_VIEWPOINT_V1` 추출 |
| `project_canvas/change-viewpoint/_context/knowledge-viewpoint-spec.txt` | **신규 생성** | `VIEWPOINT_SPEC` + 프롬프트 빌더 로직 추출 |
| `project_canvas/lib/prompt.ts` | **수정** | `change-viewpoint/_context/` 탐색 경로 추가 |
| `project_canvas/app/api/change-viewpoint/route.ts` | **수정** | `loadProtocolFile` 패턴으로 리팩터링 |

---

## 작업 체크리스트

### Phase 1: 프로토콜 파일 분리
- [x] `project_canvas/change-viewpoint/_context/` 디렉터리 생성 ✅
- [x] `protocol-change-viewpoint-v1.txt` 생성 ✅ (sys-prompt-changeviewpoint-v1.txt 기준)
- [x] `knowledge-viewpoint-templates.txt` 생성 ✅ (template-analysis/output1/output2 통합)

### Phase 2: lib/prompt.ts 수정
- [x] `loadProtocolFile()` 탐색 후보 배열에 `change-viewpoint/_context/` 경로 추가 ✅

### Phase 3: route.ts 리팩터링
- [x] `PROTOCOL_VIEWPOINT_V1` 인라인 상수 제거 ✅
- [x] `VIEWPOINT_SPEC` 인라인 상수 제거 ✅
- [x] `buildAnalysisPrompt` / `buildGenerationPrompt` 함수 제거 ✅
- [x] `loadProtocolFile` + `buildSystemPrompt` 패턴 적용 ✅
- [x] `callWithFallback` 시그니처 STI/STP 클로저 패턴으로 통일 ✅
- [x] `config.systemInstruction: systemPrompt` Phase 1에 적용 ✅
- [x] `generated_image` data URL 형식 유지 확인 ✅

### Phase 4: 빌드 검증
- [x] `npm run build` 성공 (TypeScript 0 errors) ✅

---

## 기술 상세

### callWithFallback — 목표 패턴 (STI/STP와 동일)

```ts
async function callWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    console.warn('Primary model failed, trying fallback:', err);
    return await fallback();
  }
}

// 사용 예시
const makeCall = (modelName: string) => () =>
  Promise.race([
    ai.models.generateContent({ model: modelName, config: { systemInstruction: systemPrompt }, contents: [...] })
      .then(r => r.text ?? ''),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_ANALYSIS}ms`)), TIMEOUT_ANALYSIS)
    ),
  ]);

const analysisText = await callWithFallback(
  makeCall(MODEL_ANALYSIS),
  makeCall(MODEL_ANALYSIS_FALLBACK)
);
```

### knowledge-viewpoint-spec.txt — 구조 예시

```
# VIEWPOINT SPECIFICATIONS

## Street View
- Vector: 06:00 (Front facade), Height 1.6m
- Camera: Fujifilm GFX 100S + 23mm Tilt-Shift Lens
- Perspective: 1-Point (vertical lines strictly parallel)
- Priority: Zero vertical distortion, architectural stability

## Aerial View
...
```

### 응답 필드 매핑

| 필드 | 현재 route.ts | 목표 (STI와 동일 패턴) |
|------|--------------|----------------------|
| `generated_image` | `data:${mimeType};base64,...` (data URL 형식) | 동일 유지 |
| `analysis` | 분석 텍스트 전체 | 동일 유지 |

> ⚠️ 현재 `generated_image`는 `data:` prefix를 붙여 반환하지만 STI/STP는 순수 base64를 반환함.  
> 클라이언트(`useViewpointGeneration.ts`)가 어떻게 처리하는지 확인 후 일관성 맞출 것.

---

`COPYRIGHTS 2026. CRE-TE CO.,LTD. ALL RIGHTS RESERVED.`
