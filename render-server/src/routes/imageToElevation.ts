import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, loadProtocolFile } from '../lib/prompt';
import { uploadToStorage } from '../lib/supabaseUpload';

const router = Router();

const MODEL_ANALYSIS           = 'gemini-3.1-pro-preview';
const MODEL_IMAGE_GEN          = 'gemini-3.1-flash-image-preview';
const MODEL_ANALYSIS_FALLBACK  = 'gemini-2.5-pro-preview';
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image';
const TIMEOUT_ANALYSIS  = 90_000;
const TIMEOUT_IMAGE_GEN = 120_000;

const MAX_IMAGE_BYTES   = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 1000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

interface AeplData {
  width: number; height: number; depth: number;
  voidRatio: number; baseMaterial: string; secondaryMaterial: string;
  style?: string;
  inferred_rear?: string; inferred_left?: string;
  inferred_right?: string; inferred_top?: string;
}

async function callWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>, label: string): Promise<T> {
  try { return await primary(); }
  catch (err) {
    console.warn(`[elevation] ${label} primary model failed, trying fallback:`, err);
    return await fallback();
  }
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return text.trim();
}

function buildViewPrompt(view: 'rear' | 'left' | 'right' | 'top', aepl: AeplData, guideContent: string, userPrompt: string): string {
  const viewLabels = {
    rear:  'REAR ELEVATION — from behind, opposite front facade',
    left:  'LEFT ELEVATION — 90° left of front-facing direction',
    right: 'RIGHT ELEVATION — 90° right of front-facing direction',
    top:   'TOP VIEW / ROOF PLAN — directly above, looking down',
  };
  const inferredMap: Record<string, string | undefined> = {
    rear: aepl.inferred_rear, left: aepl.inferred_left,
    right: aepl.inferred_right, top: aepl.inferred_top,
  };
  const inferred = inferredMap[view];
  return [
    `Generate an architectural elevation drawing: ${viewLabels[view]}`,
    '',
    '## BUILDING DATA',
    `Style: ${aepl.style ?? 'contemporary'}`,
    `Proportions: W=${aepl.width} × H=${aepl.height} × D=${aepl.depth}`,
    `Void ratio: ${aepl.voidRatio} (${Math.round(aepl.voidRatio * 100)}% glazed)`,
    `Primary material: ${aepl.baseMaterial}`,
    `Secondary material: ${aepl.secondaryMaterial}`,
    ...(inferred ? ['', '## VIEW DESCRIPTION', inferred] : []),
    ...(userPrompt ? ['', '## USER NOTES', userPrompt] : []),
    '',
    '## RENDERING RULES',
    'Clean orthographic architectural drawing, white/light gray background.',
    'No perspective distortion. No entourage (no people, trees, cars).',
    'Consistent scale and floor height relative to front elevation.',
    guideContent ? `\n## STYLE GUIDE\n${guideContent.slice(0, 500)}` : '',
  ].join('\n');
}

router.post('/', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', prompt: userPrompt = '', nodeId = 'unknown' } = req.body;

  if (!imageBase64) { res.status(400).json({ error: 'imageBase64 is required' }); return; }

  const mimeTypeLower = mimeType.toLowerCase();
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeTypeLower)) {
    res.status(400).json({ error: 'Invalid image type. Allowed: JPEG, PNG, WebP' }); return;
  }
  if (Buffer.from(imageBase64, 'base64').length > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: 'Image size exceeds 10MB limit' }); return;
  }
  if (userPrompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit` }); return;
  }

  const apiKey = process.env.GEMINI_API_KEY_IMAGE;
  if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY_IMAGE is missing' }); return; }

  let analysisSystemPrompt: string;
  let guideContent = '';
  try {
    const protocol = loadProtocolFile('protocol-image-to-elevation-v7.txt');
    const schema   = loadProtocolFile('knowledge-aeps-schema-v4.txt');
    analysisSystemPrompt = buildSystemPrompt(protocol, [schema]);
    guideContent = loadProtocolFile('knowledge-elevation-guide.txt');
  } catch (err) {
    console.error('[elevation] Protocol load failed:', err);
    res.status(500).json({ error: 'Protocol initialization failed' }); return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const imagePart = { inlineData: { mimeType: mimeTypeLower as AllowedMimeType, data: imageBase64 } };
  const startTime = Date.now();

  // Stage 1: Analysis → AEPLSchema
  let aepl: AeplData;
  try {
    const makeAnalysisCall = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: analysisSystemPrompt },
        contents: [{ role: 'user', parts: [imagePart, { text: `Analyze this building image and return AEPLSchema JSON.${userPrompt ? `\n\nAdditional context: ${userPrompt}` : ''}` }] }],
      }).then(r => r.text ?? ''),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_ANALYSIS)),
    ]);

    const rawJson = await callWithFallback(makeAnalysisCall(MODEL_ANALYSIS), makeAnalysisCall(MODEL_ANALYSIS_FALLBACK), 'analysis');
    const rawAepl = JSON.parse(extractJson(rawJson)) as Record<string, unknown>;

    const articulation  = (rawAepl.articulation  as Record<string, unknown> | undefined) ?? {};
    const materials     = (rawAepl.materials      as Record<string, unknown> | undefined) ?? {};
    const base          = (materials.base          as Record<string, unknown> | undefined) ?? {};
    const secondary     = (materials.secondary     as Record<string, unknown> | undefined) ?? {};
    const inferredViews = (rawAepl.inferred_views  as Record<string, unknown> | undefined) ?? {};

    aepl = {
      width:             typeof rawAepl.width  === 'number' ? rawAepl.width  : 3,
      height:            typeof rawAepl.height === 'number' ? rawAepl.height : 5,
      depth:             typeof rawAepl.depth  === 'number' ? rawAepl.depth  : 2,
      voidRatio:         typeof articulation.void_ratio === 'number' ? articulation.void_ratio : 0.3,
      baseMaterial:      typeof base.name      === 'string' ? base.name      : 'concrete',
      secondaryMaterial: typeof secondary.name === 'string' ? secondary.name : 'glass',
      style:             typeof rawAepl.style  === 'string' ? rawAepl.style  : 'contemporary',
      inferred_rear:     typeof inferredViews.rear  === 'string' ? inferredViews.rear  : '',
      inferred_left:     typeof inferredViews.left  === 'string' ? inferredViews.left  : '',
      inferred_right:    typeof inferredViews.right === 'string' ? inferredViews.right : '',
      inferred_top:      typeof inferredViews.top   === 'string' ? inferredViews.top   : '',
    };
    console.log(`[elevation] Stage 1 done in ${Date.now() - startTime}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Analysis failed: ${msg}` }); return;
  }

  // Stage 2: 4-view parallel image generation
  const views = ['rear', 'left', 'right', 'top'] as const;
  const makeImageCall = (model: string, view: typeof views[number]) => () => Promise.race([
    ai.models.generateContent({
      model,
      config: { responseModalities: ['IMAGE', 'TEXT'] },
      contents: [{ role: 'user', parts: [imagePart, { text: buildViewPrompt(view, aepl, guideContent, userPrompt) }] }],
    }).then(r => {
      const parts = r.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) => p.inlineData?.mimeType?.startsWith('image/'));
      if (!imgPart?.inlineData?.data) throw new Error(`No image returned for ${view}`);
      const data = imgPart.inlineData.data as string;
      const mime = imgPart.inlineData.mimeType ?? 'image/png';
      return data.startsWith('data:') ? data : `data:${mime};base64,${data}`;
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_IMAGE_GEN)),
  ]);

  let generatedViews: Record<typeof views[number], string>;
  try {
    const results = await Promise.all(
      views.map(view => callWithFallback(makeImageCall(MODEL_IMAGE_GEN, view), makeImageCall(MODEL_IMAGE_GEN_FALLBACK, view), `image-${view}`))
    );
    generatedViews = { rear: results[0], left: results[1], right: results[2], top: results[3] };
    console.log(`[elevation] Stage 2 done in ${Date.now() - startTime}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Image generation failed: ${msg}` }); return;
  }

  const frontDataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:${mimeTypeLower};base64,${imageBase64}`;
  const images = { front: frontDataUrl, ...generatedViews };
  const aeplResult = { width: aepl.width, height: aepl.height, depth: aepl.depth, voidRatio: aepl.voidRatio, baseMaterial: aepl.baseMaterial, secondaryMaterial: aepl.secondaryMaterial };

  // 백그라운드 Storage 저장 (front 제외)
  for (const [view, dataUrl] of Object.entries(generatedViews)) {
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    uploadToStorage(`${nodeId}-${view}`, b64, 'image/png').catch(() => {});
  }

  console.log(`[elevation] total elapsed=${Date.now() - startTime}ms`);
  res.json({ success: true, aepl: aeplResult, images });
});

export default router;
