import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, loadProtocolFile } from '../lib/prompt';
import { uploadToStorage } from '../lib/supabaseUpload';

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
  const {
    sketch_image,
    mime_type = 'image/png',
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
  if (user_prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit` }); return;
  }

  let systemPrompt: string;
  try {
    const protocol       = loadProtocolFile('protocol-sketch-to-plan-v3.8.txt');
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
  const imagePart = { inlineData: { mimeType: mimeTypeLower as AllowedMimeType, data: sketch_image } };

  // Phase 1: Spatial Analysis
  let analysisSpec: Record<string, unknown> = {};
  try {
    const analysisPrompt = [
      '스케치 이미지를 분석하여 위상적 평면 데이터로 변환하세요.',
      '',
      `건물 용도: ${floor_type}`,
      `구조 그리드 모듈: ${grid_module}mm`,
      `사용자 요청: ${user_prompt || '(없음)'}`,
      '',
      '4단계 보정 위계 프로토콜(Hierarchy 0→3)을 순서대로 실행하고,',
      '최종 SPATIAL_SPEC JSON 블록을 출력하세요.',
    ].join('\n');

    const makeAnalysisCall = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt },
        contents: [{ role: 'user', parts: [imagePart, { text: analysisPrompt }] }],
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
        contents: [{ role: 'user', parts: [imagePart, { text: generationPrompt }] }],
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

  uploadToStorage(nodeId, generatedImageBase64, 'image/png').catch(() => {});

  res.json({ generated_plan_image: generatedImageBase64, room_analysis: roomAnalysisText, analysis_spec: analysisSpec });
});

export default router;
