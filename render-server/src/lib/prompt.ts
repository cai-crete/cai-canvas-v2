import { readFileSync } from 'fs';
import { join } from 'path';

// Render 배포 시: __dirname = render-server/dist/lib/
// project_canvas/는 ../../../project_canvas/ 경로에 위치
const PROJECT_CANVAS = join(__dirname, '../../../project_canvas');

export function buildSystemPrompt(principleProtocol: string, knowledgeDocs: string[] = []): string {
  return [principleProtocol, ...knowledgeDocs].filter(Boolean).join('\n\n---\n\n');
}

export function loadProtocolFile(filename: string): string {
  const candidates = [
    join(PROJECT_CANVAS, 'sketch-to-image', '_context', filename),
    join(PROJECT_CANVAS, 'sketch-to-plan', '_context', filename),
    join(PROJECT_CANVAS, 'change-viewpoint', '_context', filename),
    join(PROJECT_CANVAS, 'elevation', '_context', filename),
    join(PROJECT_CANVAS, '_context', filename),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8'); } catch { /* try next */ }
  }
  throw new Error(`Protocol file not found: ${filename}`);
}

const VIEWPOINT_REPORT_SCHEMA = `{
  "optical": {
    "viewpoint": "촬영 시점",
    "azimuth": "방위각",
    "altitude": "촬영 고도",
    "perspective": "투시 왜곡",
    "sensor": "센서 포맷",
    "focalLength": "이점 거리",
    "lighting": "광선 및 날씨",
    "contrast": "대비 강도"
  },
  "geometric": {
    "skin": "인피 시스템",
    "innerFacade": "내부 파사드",
    "outerFacade": "외부 파사드",
    "baseMass": "기본 매스",
    "baseFloor": "하층부",
    "midBody": "중인층부",
    "roof": "상층부"
  },
  "conceptual": {
    "designAlgorithm": "디자인 알고리즘",
    "colorPalette": "주조색",
    "formMotif": "형태 모티브",
    "formContrast": "형태적 대비",
    "moodContrast": "감성적 대비"
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
