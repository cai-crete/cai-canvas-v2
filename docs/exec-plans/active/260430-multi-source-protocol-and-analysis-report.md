# 작업지시서: Multi-Source Protocol v2.3-multi + Analysis Report 사이드바

## 목적
- 다중 아트보드(평면도+입면도) 선택 시 발동되는 전용 프로토콜 `v2.3-multi` 설계 및 연결
- RESOLUTION 탭 UI 제거 (소스 유지)
- Phase 1~2 분석 결과를 노드 카드에 저장 → Expanded 사이드바에 표시

---

## 설계 원칙 (Q&A 확정 사항)
- **Phase 구조**: 3-Phase (평면도 분석 → 입면도 분석 → 합성 생성)
- **Phase 이양**: 각 Phase 종료 시 `이미지 + 분석 스펙 페어`를 다음 Phase에 전달
- **합성 뷰**: 인간 눈높이 3D 외관 투시뷰
- **기하학적 권위**:
  - 수평(배치/깊이) → 평면도 우선
  - 수직(비율/파사드/개구부) → 입면도 우선
- **ROOM 구조**: 6-ROOM (v2.3 5-ROOM 재설계)
- **분석 리포트**: 평면도/입면도 각각 별도 섹션 [B안], 생성 완료 후 저장 [A안], 기존 UI 스타일 따름 [C안]

---

## 체크리스트

### Tier 0 — 프로토콜 문서 생성
- [ ] `project_canvas/sketch-to-image/_context/protocol-sketch-to-image-v2.3-multi.txt` 생성
  - 6-ROOM 구조 (소스 선언 / 평면도 해부 / 입면도 해부 / 합성 전략 / 시공 / 검증)
  - 3-Phase 실행 플로우 명세
  - `floorplan-analysis-spec` JSON 스키마
  - `elevation-analysis-spec` JSON 스키마
  - `synthesis-spec` JSON 스키마
  - Conflict Resolution Protocol 명세

### Tier 1 — types/canvas.ts
- [ ] `MultiSourceAnalysisReport` 인터페이스 추가
  ```typescript
  export interface MultiSourceAnalysisReport {
    floorPlan: {
      zoning: string;
      axis: string;
      spatialHierarchy: string;
      depthLayers: string;
      confidence: 'HIGH' | 'MID' | 'LOW';
    };
    elevation: {
      geometrySanctuary: string;
      materiality: string;
      facadeRhythm: string;
      proportions: string;
      confidence: 'HIGH' | 'MID' | 'LOW';
    };
  }
  ```
- [ ] `CanvasNode`에 `multiSourceAnalysisReport?: MultiSourceAnalysisReport` 추가

### Tier 2 — render-server/src/routes/sketchToImage.ts
- [ ] `isMultiSource` 시 `protocol-sketch-to-image-v2.3-multi.txt` 로드
- [ ] 3-Phase 분기 구현:
  - **Phase 1**: 평면도 이미지 단독 → ROOM 2 실행 → `floorplan-analysis-spec` 추출
  - **Phase 2**: 입면도 이미지 + Phase 1 스펙(텍스트) → ROOM 3 실행 → `elevation-analysis-spec` 추출
  - **Phase 3**: 평면도 이미지 + 입면도 이미지 + 두 스펙 모두 → ROOM 4+5+6 실행 → 이미지 생성
- [ ] 응답에 `analysis_report: { floorPlan, elevation }` 포함

### Tier 3 — hooks/useBlueprintGeneration.ts
- [ ] `MultiSourceAnalysisReport` import 추가
- [ ] `analysisReport` 타입을 `MultiSourceAnalysisReport | Record<string, unknown> | null`로 확장 (또는 union)

### Tier 4 — ExpandedView.tsx (sketch-to-image)
- [ ] `useBlueprintGeneration` 에서 `analysisReport` 추가 destructure
- [ ] `onGenerateComplete` 콜백에 `multiSourceAnalysisReport` 필드 추가 전달
  - 조건: `validInputSources.length >= 2`인 경우만
- [ ] `SketchToImagePanel`에 `analysisReport={node.multiSourceAnalysisReport}` prop 전달

### Tier 5 — app/page.tsx
- [ ] `onGenerateComplete` 핸들러에서 `multiSourceAnalysisReport` 수신 시 해당 노드에 저장

### Tier 6 — SketchToImagePanel.tsx (UI 변경)
- [ ] **Feature 1**: RESOLUTION 섹션 주석 처리 (소스 삭제 안 함)
  ```tsx
  {/* RESOLUTION — 일시 비활성화 (추후 복구용)
  <div>
    ...기존 코드...
  </div>
  */}
  ```
- [ ] **Feature 2**: `analysisReport?: MultiSourceAnalysisReport` prop 추가
- [ ] ANALYSIS REPORT 섹션 추가 (RESOLUTION 자리, 다중 소스 노드에서만 표시):
  ```
  ANALYSIS REPORT
  ├── [평면도]
  │   ├── Zoning: ...
  │   ├── Axis: ...
  │   ├── Spatial Hierarchy: ...
  │   └── Depth Layers: ...
  └── [입면도]
      ├── Geometry Sanctuary: ...
      ├── Materiality: ...
      ├── Facade Rhythm: ...
      └── Proportions: ...
  ```

---

## 파일 변경 대상
| 파일 | 변경 유형 |
|------|-----------|
| `project_canvas/sketch-to-image/_context/protocol-sketch-to-image-v2.3-multi.txt` | 신규 생성 |
| `project_canvas/types/canvas.ts` | 인터페이스 추가 |
| `render-server/src/routes/sketchToImage.ts` | 3-Phase 로직 |
| `project_canvas/hooks/useBlueprintGeneration.ts` | 타입 확장 |
| `project_canvas/sketch-to-image/ExpandedView.tsx` | 콜백 확장 |
| `app/page.tsx` | 노드 저장 |
| `project_canvas/components/panels/SketchToImagePanel.tsx` | UI 변경 2건 |

---

## 의존 관계
```
Tier 0 (프로토콜) → Tier 2 (렌더서버)
Tier 1 (타입)     → Tier 3, 4, 5, 6
Tier 2, 3         → Tier 4
Tier 4            → Tier 5
Tier 1, 4         → Tier 6
```
