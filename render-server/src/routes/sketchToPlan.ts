import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, loadProtocolFile } from '../lib/prompt';
import { uploadToStorage, getUserFromToken } from '../lib/supabaseUpload';

const router = Router();

const MODEL_ANALYSIS           = 'gemini-3.1-pro-preview';
const MODEL_IMAGE_GEN          = 'gemini-3.1-flash-image-preview';
const MODEL_ANALYSIS_FALLBACK  = 'gemini-2.5-pro-preview';
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image';
const TIMEOUT_ANALYSIS  = 120000;
const TIMEOUT_IMAGE_GEN = 180000;

const MAX_IMAGE_BYTES   = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 2000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

async function callWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try { return await primary(); }
  catch (err) {
    console.warn('[sketch-to-plan] primary model failed, trying fallback:', err);
    return await fallback();
  }
}

router.post('/', async (req, res) => {
  const token = (req.headers.authorization as string | undefined)?.replace('Bearer ', '');
  const userIdPromise = getUserFromToken(token);

  const {
    sketch_image,
    mime_type = 'image/png',
    cadastral_image,
    cadastral_mime_type = 'image/png',
    composite_image,
    composite_mime_type = 'image/png',
    user_prompt = '',
    floor_type = 'RESIDENTIAL',
    grid_module = 4000,
    nodeId = 'unknown',
  } = req.body;

  if (!sketch_image) { res.status(400).json({ error: 'sketch_image is required' }); return; }

  const mimeTypeLower = mime_type.toLowerCase();
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeTypeLower)) {
    res.status(400).json({ error: 'Invalid image type. Allowed: JPEG, PNG, WebP' }); return;
  }
  if (Buffer.from(sketch_image, 'base64').length > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: 'Image size exceeds 10MB limit' }); return;
  }
  if (cadastral_image && Buffer.from(cadastral_image, 'base64').length > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: 'Cadastral image size exceeds 10MB limit' }); return;
  }
  if (composite_image && Buffer.from(composite_image, 'base64').length > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: 'Composite image size exceeds 10MB limit' }); return;
  }
  if (user_prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit` }); return;
  }

  let systemPrompt: string;
  try {
    const protocol       = loadProtocolFile('protocol-sketch-to-plan-v3.9.txt');
    const knowledgeWpGrid   = loadProtocolFile('knowledge-wp-grid-mapping.txt');
    const knowledgeArchStd  = loadProtocolFile('knowledge-architectural-standards.txt');
    const knowledgeTemplateA = loadProtocolFile('knowledge-template-a.txt');
    systemPrompt = buildSystemPrompt(protocol, [knowledgeWpGrid, knowledgeArchStd, knowledgeTemplateA]);
  } catch (err) {
    console.error('[sketch-to-plan] Protocol load failed:', err);
    res.status(500).json({ error: 'Protocol initialization failed' }); return;
  }

  const apiKey = process.env.GEMINI_API_KEY_PLAN;
  if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY_PLAN is missing' }); return; }

  const ai = new GoogleGenAI({ apiKey });
  const sketchPart    = { inlineData: { mimeType: mimeTypeLower as AllowedMimeType, data: sketch_image } };
  const cadastralPart = cadastral_image
    ? { inlineData: { mimeType: (cadastral_mime_type.toLowerCase()) as AllowedMimeType, data: cadastral_image } }
    : null;
  const compositePart = composite_image
    ? { inlineData: { mimeType: (composite_mime_type.toLowerCase()) as AllowedMimeType, data: composite_image } }
    : null;

  // composite(지적도+스트로크 합성)가 있으면: [composite, sketch] — AI가 스케치의 대지 내 위치를 정확히 파악
  // composite 없고 cadastral만 있으면: [cadastral, sketch] — 기존 동작
  // 둘 다 없으면: [sketch] — 단일 이미지 모드 (v3.8)
  const imageParts = compositePart
    ? [compositePart, sketchPart]
    : cadastralPart
      ? [cadastralPart, sketchPart]
      : [sketchPart];

  const cadastralContext = compositePart
    ? [
        '---',
        '【입력 이미지 역할 정의 — 듀얼 이미지 모드】',
        '- 첫 번째 이미지 (IMAGE_1): 지적도/위성사진 위에 스케치 스트로크를 오버레이한 합성 이미지',
        '  → 이 이미지에서 두 가지 정보를 동시에 읽으세요:',
        '  ① 대지 경계·도로 접면·방향 (지적도/위성사진 배경에서 추출)',
        '  ② 건물 풋프린트의 대지 내 정확한 위치·크기·이격거리 (스트로크 오버레이에서 추출)',
        '- 두 번째 이미지 (IMAGE_2): 순수 스케치 스트로크 — 방의 위상학적 관계(Room Topology) 분석 전용',
        '절대 규칙 1: IMAGE_1의 대지 경계 밖으로 건물이 나가면 즉시 재생성.',
        '절대 규칙 2: IMAGE_1의 스트로크 오버레이가 점유하는 위치·크기 비율을 그대로 반영하여 평면도를 생성하세요.',
        '  (예: 스케치가 대지 좌상단의 약 30% 영역을 점유하면, 생성된 평면도도 대지 좌상단 30% 영역에 위치해야 합니다.)',
        '---',
      ].join('\n')
    : cadastralPart
      ? [
          '---',
          '【입력 이미지 역할 정의】',
          '- 첫 번째 이미지 (IMAGE_1): 지적도 또는 위성사진 — 대지 경계·스케일·방향의 절대 기준 (Immutable Site Anchor)',
          '- 두 번째 이미지 (IMAGE_2): 스케치 스트로크 — 대지 내 건물의 위상학적 평면 (Room Topology)',
          '절대 규칙: IMAGE_1에서 파악된 대지 경계와 방향은 어떤 경우에도 변경 불가. 평면도는 반드시 이 대지 경계 안에 위치해야 합니다.',
          '---',
        ].join('\n')
      : '';

  // Phase 1: Spatial Analysis
  let analysisSpec: Record<string, unknown> = {};
  try {
    const analysisPrompt = [
      cadastralContext,
      '스케치 이미지를 분석하여 위상적 평면 데이터로 변환하세요.',
      '',
      `건물 용도: ${floor_type}`,
      `구조 그리드 모듈: ${grid_module}mm`,
      `사용자 요청: ${user_prompt || '(없음)'}`,
      '',
      '4단계 보정 위계 프로토콜(Hierarchy 0→3)을 순서대로 실행하고,',
      '최종 SPATIAL_SPEC JSON 블록을 출력하세요.',
    ].filter(Boolean).join('\n');

    const makeAnalysisCall = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt },
        contents: [{ role: 'user', parts: [...imageParts, { text: analysisPrompt }] }],
      }).then(r => r.text ?? ''),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_ANALYSIS)),
    ]);

    const analysisText = await callWithFallback(makeAnalysisCall(MODEL_ANALYSIS), makeAnalysisCall(MODEL_ANALYSIS_FALLBACK));
    const jsonFenced = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonInline = analysisText.match(/\{[\s\S]*?"process"\s*:\s*"spatial"[\s\S]*?\}/);
    const rawJson = jsonFenced?.[1] ?? jsonInline?.[0];
    if (rawJson) {
      const s = rawJson.indexOf('{'), e = rawJson.lastIndexOf('}');
      if (s !== -1 && e !== -1) try { analysisSpec = JSON.parse(rawJson.slice(s, e + 1)); } catch { /* non-critical */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-plan] Analysis failed:', msg);
    res.status(503).json({ error: `Analysis failed: ${msg}` }); return;
  }

  // Phase 2: CAD Floor Plan Image Generation
  let generatedImageBase64: string;
  let roomAnalysisText = '';
  try {
    const generationPrompt = [
      cadastralContext,
      'TEMPLATE-A 스타일의 미니멀리스트 CAD 평면도를 생성하세요.',
      '',
      'spatial-spec (위상 분석 결과):',
      JSON.stringify(analysisSpec, null, 2),
      '',
      '렌더링 규칙:',
      '- Monochrome(흑백), Solid Poche, Pure White 배경',
      '- 내력벽: 두껍고 검은 솔리드 해치 / 비내력벽: 얇게',
      '- 개구부 천공(문·창), 문 열림 궤적(Arc)',
      '- 실명 텍스트 + 하단 그래픽 스케일 바 표기',
      `- 그리드 모듈: ${grid_module}mm 기준`,
      '',
      '생성 완료 후 각 실의 면적과 비율 등 공간 분석 요약(ROOM ANALYSIS)을 텍스트로 출력하세요.',
    ].join('\n');

    const makeGenerationCall = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt, responseModalities: ['IMAGE', 'TEXT'] },
        contents: [{ role: 'user', parts: [...imageParts, { text: generationPrompt }] }],
      }).then(r => {
        const parts = r.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
          p.inlineData?.mimeType?.startsWith('image/')
        );
        const textPart = parts.find((p: { text?: string }) => typeof p.text === 'string' && p.text.trim().length > 0);
        if (!imgPart?.inlineData?.data) throw new Error('No image in generation response');
        return { image: imgPart.inlineData.data as string, text: (textPart as { text?: string })?.text ?? '' };
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_IMAGE_GEN)),
    ]);

    const result = await callWithFallback(makeGenerationCall(MODEL_IMAGE_GEN), makeGenerationCall(MODEL_IMAGE_GEN_FALLBACK));
    generatedImageBase64 = result.image;
    roomAnalysisText = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-plan] Image generation failed:', msg);
    res.status(503).json({ error: `Image generation failed: ${msg}` }); return;
  }

  const userId = await userIdPromise;
  uploadToStorage(nodeId, generatedImageBase64, 'image/png', userId ?? undefined, 'plan').catch(() => {});

  res.json({ generated_plan_image: generatedImageBase64, room_analysis: roomAnalysisText, analysis_spec: analysisSpec });
});

export default router;
