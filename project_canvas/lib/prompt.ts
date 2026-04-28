import { readFileSync } from 'fs';
import { join } from 'path';

export function buildSystemPrompt(principleProtocol: string, knowledgeDocs: string[] = []): string {
  const parts = [principleProtocol, ...knowledgeDocs].filter(Boolean);
  return parts.join('\n\n---\n\n');
}

export function loadProtocolFile(filename: string): string {
  const candidates = [
    join(process.cwd(), 'sketch-to-image', '_context', filename),
    join(process.cwd(), 'sketch-to-plan', '_context', filename),
    join(process.cwd(), 'change-viewpoint', '_context', filename),
    join(process.cwd(), 'elevation', '_context', filename),
    join(process.cwd(), '_context', filename),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8'); } catch { /* try next */ }
  }
  throw new Error(`Protocol file not found: ${filename}`);
}

// Viewpoint Analysis Report — JSON 추출 스키마 및 프롬프트

const VIEWPOINT_REPORT_SCHEMA = `{
  "optical": {
    "viewpoint": "촬영 시점 (예: 하이 앵글 코너 뷰, 부분 조감됨)",
    "azimuth": "방위각 (예: 04:30 방향, 건물 전면 06:00 기준)",
    "altitude": "촬영 고도 (예: 100m ~ 150m, 교차로 상공)",
    "perspective": "투시 왜곡 (예: 2점 투시, 수직선 유지)",
    "sensor": "센서 포맷 (예: 미디엄 포맷)",
    "focalLength": "이점 거리 (예: 45mm ~ 50mm, 표준 화각)",
    "lighting": "광선 및 날씨 (예: 확산광(Overcast), 이른 아침)",
    "contrast": "대비 강도 (예: 낮음, 부드러운 그림자)"
  },
  "geometric": {
    "skin": "인피 시스템 (예: 이중 인피 구조(Double-skin facade))",
    "innerFacade": "내부 파사드 (예: 평탄한 유리 커튼월(Glass Curtain Wall))",
    "outerFacade": "외부 파사드 (예: 전체역학적 3D 곡선 패턴의 파라메트릭 루버)",
    "baseMass": "기본 매스 (예: 견고한 직육면체 매스(Solid Glass Box))",
    "baseFloor": "하층부 (예: 필로티 구조, 독립 노출 기둥 배치)",
    "midBody": "중인층부 (예: 코어부 V형 스틸 데코(보이드 공간))",
    "roof": "상층부 (예: 평지붕, 옥상 기계실비(MEP) 박스, 루버 연장형 플랫폼)"
  },
  "conceptual": {
    "designAlgorithm": "디자인 알고리즘 (예: 파라메트리시즘(Parametricism))",
    "colorPalette": "주조색 (예: 무채색(밝은 화이트), 투명(유리))",
    "formMotif": "형태 모티브 (예: 무한한 에너지(바람, 흐름, 데이터 흐름))",
    "formContrast": "형태적 대비 (예: 직교 체계 → 파사드의 전기적 곡선)",
    "moodContrast": "감성적 대비 (예: 하이테크/미래지향적 특성 → 시각적 연속함)"
  }
}`;

export function buildReportExtractionPrompt(executionPrompt: string): string {
  return [
    '## TASK',
    'Extract architectural analysis data from the source text below and return it as a JSON object matching the schema.',
    '',
    '## OUTPUT SCHEMA',
    VIEWPOINT_REPORT_SCHEMA,
    '',
    '## RULES',
    '- Return ONLY valid JSON. No markdown, no code fences, no explanation.',
    '- Use Korean for all values.',
    '- If a field cannot be determined from the source text, use "미확인" as the value.',
    '- Do not include any text before or after the JSON object.',
    '',
    '## SOURCE TEXT',
    executionPrompt,
  ].join('\n');
}
