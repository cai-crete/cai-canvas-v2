import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, loadProtocolFile } from '../lib/prompt';
import { getStylePrompt } from '../lib/architectStyles';
import { uploadToStorage } from '../lib/supabaseUpload';

const router = Router();

const MODEL_ANALYSIS          = 'gemini-3.1-pro-preview';
const MODEL_IMAGE_GEN         = 'gemini-3.1-flash-image-preview';
const MODEL_ANALYSIS_FALLBACK = 'gemini-2.5-pro-preview';
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image';
const TIMEOUT_ANALYSIS  = 90000;
const TIMEOUT_IMAGE_GEN = 120000;

const MAX_IMAGE_BYTES  = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 2000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

async function callWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try { return await primary(); }
  catch (err) {
    console.warn('[sketch-to-image] primary model failed, trying fallback:', err);
    return await fallback();
  }
}

interface InputSource {
  id: string;
  data: string;
  mime_type: string;
  role: string;
}

interface MultiSourceAnalysisReport {
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

function extractJsonSpec(text: string, processKey: string): Record<string, unknown> {
  const jsonFenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonInline = text.match(new RegExp(`\\{[\\s\\S]*?"${processKey}"[\\s\\S]*?\\}`));
  const rawJson = jsonFenced?.[1] ?? jsonInline?.[0];
  if (!rawJson) return {};
  const s = rawJson.indexOf('{'), e = rawJson.lastIndexOf('}');
  if (s === -1 || e === -1) return {};
  try { return JSON.parse(rawJson.slice(s, e + 1)); } catch { return {}; }
}

function buildMultiSourceReport(
  floorplanSpec: Record<string, unknown>,
  elevationSpec: Record<string, unknown>
): MultiSourceAnalysisReport {
  const fp = floorplanSpec as Record<string, unknown>;
  const el = elevationSpec as Record<string, unknown>;
  const sh = fp.spatial_hierarchy as Record<string, unknown> | undefined;
  const gs = el.geometry_sanctuary as Record<string, unknown> | undefined;
  const mat = el.materiality as Record<string, unknown> | undefined;

  return {
    floorPlan: {
      zoning:           String(fp.zoning ?? ''),
      axis:             String(fp.axis ?? ''),
      spatialHierarchy: String(sh?.depth_layers ?? fp.spatial_hierarchy ?? ''),
      depthLayers:      String(sh?.volume_sequence ?? ''),
      confidence:       (['HIGH', 'MID', 'LOW'].includes(String(fp.confidence)) ? fp.confidence : 'MID') as 'HIGH' | 'MID' | 'LOW',
    },
    elevation: {
      geometrySanctuary: String(gs?.opening_rhythm ?? el.geometry_sanctuary ?? ''),
      materiality:       String(mat?.primary ?? el.materiality ?? ''),
      facadeRhythm:      String(gs?.facade_articulation ?? ''),
      proportions:       String(el.proportions ?? ''),
      confidence:        (['HIGH', 'MID', 'LOW'].includes(String(el.confidence)) ? el.confidence : 'MID') as 'HIGH' | 'MID' | 'LOW',
    },
  };
}

router.post('/', async (req, res) => {
  const {
    sketch_image,
    mime_type = 'image/png',
    user_prompt = '',
    viz_mode = 'CONCEPT',
    style_mode = 'NONE',
    resolution = 'NORMAL QUALITY',
    aspect_ratio = '4:3',
    nodeId = 'unknown',
    input_sources,
  } = req.body as {
    sketch_image?: string;
    mime_type?: string;
    user_prompt?: string;
    viz_mode?: string;
    style_mode?: string;
    resolution?: string;
    aspect_ratio?: string;
    nodeId?: string;
    input_sources?: InputSource[];
  };

  const isMultiSource = Array.isArray(input_sources) && input_sources.length >= 2;

  if (!isMultiSource && !sketch_image) {
    res.status(400).json({ error: 'sketch_image is required' }); return;
  }

  const mimeTypeLower = mime_type.toLowerCase();
  if (!isMultiSource) {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeTypeLower)) {
      res.status(400).json({ error: 'Invalid image type. Allowed: JPEG, PNG, WebP' }); return;
    }
    if (Buffer.from(sketch_image!, 'base64').length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'Image size exceeds 10MB limit' }); return;
    }
  }
  if (user_prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit` }); return;
  }

  const protocolFile = isMultiSource
    ? 'protocol-sketch-to-image-v2.3-multi.txt'
    : 'protocol-sketch-to-image-v2.3.txt';

  let systemPrompt: string;
  try {
    const protocol = loadProtocolFile(protocolFile);
    const stylePrompt = getStylePrompt(style_mode);
    systemPrompt = buildSystemPrompt(protocol, stylePrompt ? [stylePrompt] : []);
  } catch (err) {
    console.error('[sketch-to-image] Protocol load failed:', err);
    res.status(500).json({ error: 'Protocol initialization failed' }); return;
  }

  const apiKey = process.env.GEMINI_API_KEY_IMAGE;
  if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY_IMAGE is missing' }); return; }

  const ai = new GoogleGenAI({ apiKey });

  /* ══════════════════════════════════════════════════════════════════
     단일 소스 경로 (v2.3)
  ══════════════════════════════════════════════════════════════════ */
  if (!isMultiSource) {
    const imagePart = { inlineData: { mimeType: mimeTypeLower as AllowedMimeType, data: sketch_image! } };

    // Phase 1: Analysis
    let analysisSpec: Record<string, unknown> = {};
    try {
      const analysisPrompt = [
        '스케치 이미지를 분석하세요.',
        'ROOM 1 (정의의 방) → ROOM 2 (전략의 방) → ROOM 3 (논리의 방) 순서로 실행하고,',
        'ROOM 3 완료 후 반드시 SPEC_OUTPUT: analysis-spec JSON 블록을 출력하세요.',
        '',
        `사용자 요청: ${user_prompt || '(없음)'}`,
        `시각화 모드: ${viz_mode}`,
        `스타일 모드: ${style_mode}${style_mode !== 'NONE' ? ' (건축가 스타일 가이드라인이 시스템 프롬프트에 포함됨 — 해당 건축가의 4-Phase 프로세스를 따를 것)' : ''}`,
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
      analysisSpec = extractJsonSpec(analysisText, 'analysis');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[sketch-to-image] Analysis failed:', msg);
      res.status(503).json({ error: `Analysis failed: ${msg}` }); return;
    }

    // Phase 2: Image Generation
    let generatedImageBase64: string;
    try {
      const generationPrompt = [
        'ROOM 4 (시공의 방) 와 ROOM 5 (검증의 방) 를 실행하여 극사실주의 건축 이미지를 생성하세요.',
        '',
        'analysis-spec (ROOM 3 결과):',
        JSON.stringify(analysisSpec, null, 2),
        '',
        '생성 파라미터:',
        `- 해상도: ${resolution}`,
        `- 비율: ${aspect_ratio}`,
        `- 스타일: ${style_mode}`,
        `- 시각화 모드: ${viz_mode}`,
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
          if (!imgPart?.inlineData?.data) throw new Error('No image in generation response');
          return imgPart.inlineData.data as string;
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_IMAGE_GEN)),
      ]);

      generatedImageBase64 = await callWithFallback(makeGenerationCall(MODEL_IMAGE_GEN), makeGenerationCall(MODEL_IMAGE_GEN_FALLBACK));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[sketch-to-image] Image generation failed:', msg);
      res.status(503).json({ error: `Image generation failed: ${msg}` }); return;
    }

    uploadToStorage(nodeId, generatedImageBase64, 'image/png').catch(() => {});
    res.json({ generated_image: generatedImageBase64, analysis_report: analysisSpec });
    return;
  }

  /* ══════════════════════════════════════════════════════════════════
     다중 소스 경로 (v2.3-multi) — 3-Phase
  ══════════════════════════════════════════════════════════════════ */
  const floorplanSrc = input_sources![0];
  const elevationSrc = input_sources![1];

  const floorplanPart = { inlineData: { mimeType: floorplanSrc.mime_type as AllowedMimeType, data: floorplanSrc.data } };
  const elevationPart = { inlineData: { mimeType: elevationSrc.mime_type as AllowedMimeType, data: elevationSrc.data } };

  // ── Phase 1: 평면도 분석 (ROOM 1+2) ────────────────────────────
  let floorplanSpec: Record<string, unknown> = {};
  try {
    const phase1Prompt = [
      'ROOM 1 (소스 선언의 방) → ROOM 2 (평면도 해부의 방) 순서로 실행하세요.',
      '평면도 이미지만 분석합니다. 입면 정보는 이 단계의 분석 대상이 아닙니다.',
      'ROOM 2 완료 후 반드시 SPEC_OUTPUT: floorplan-analysis-spec JSON 블록을 출력하세요.',
      '',
      `사용자 요청: ${user_prompt || '(없음)'}`,
      `시각화 모드: ${viz_mode}`,
    ].join('\n');

    const makePhase1Call = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt },
        contents: [{ role: 'user', parts: [floorplanPart, { text: phase1Prompt }] }],
      }).then(r => r.text ?? ''),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_ANALYSIS)),
    ]);

    const phase1Text = await callWithFallback(makePhase1Call(MODEL_ANALYSIS), makePhase1Call(MODEL_ANALYSIS_FALLBACK));
    floorplanSpec = extractJsonSpec(phase1Text, 'source');
    if (!floorplanSpec.passed) floorplanSpec = extractJsonSpec(phase1Text, 'phase');
    console.log('[sketch-to-image] Phase 1 (평면도 분석) 완료');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-image] Phase 1 failed:', msg);
    res.status(503).json({ error: `Phase 1 (평면도 분석) 실패: ${msg}` }); return;
  }

  // ── Phase 2: 입면도 분석 (ROOM 3) — Phase 1 페어 컨텍스트 수신 ──
  let elevationSpec: Record<string, unknown> = {};
  try {
    const phase2Prompt = [
      'ROOM 3 (입면도 해부의 방)을 실행하세요.',
      '입면도 이미지를 분석하되, 아래 평면도 분석 결과(floorplan-spec)를 컨텍스트로 활용하세요.',
      '',
      '=== Phase 1 페어: 평면도 이미지 + 평면도 분석 스펙 ===',
      'floorplan-analysis-spec:',
      JSON.stringify(floorplanSpec, null, 2),
      '=== (위 스펙은 첨부된 평면도 이미지와 페어됨) ===',
      '',
      'ROOM 3 완료 후 반드시 SPEC_OUTPUT: elevation-analysis-spec JSON 블록을 출력하세요.',
      '',
      `사용자 요청: ${user_prompt || '(없음)'}`,
      `스타일 모드: ${style_mode}`,
    ].join('\n');

    const makePhase2Call = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt },
        // 평면도 이미지 + 입면도 이미지 모두 전달 (Phase 1 페어 유지)
        contents: [{ role: 'user', parts: [floorplanPart, elevationPart, { text: phase2Prompt }] }],
      }).then(r => r.text ?? ''),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_ANALYSIS)),
    ]);

    const phase2Text = await callWithFallback(makePhase2Call(MODEL_ANALYSIS), makePhase2Call(MODEL_ANALYSIS_FALLBACK));
    elevationSpec = extractJsonSpec(phase2Text, 'source');
    if (!elevationSpec.passed) elevationSpec = extractJsonSpec(phase2Text, 'phase');
    console.log('[sketch-to-image] Phase 2 (입면도 분석) 완료');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-image] Phase 2 failed:', msg);
    res.status(503).json({ error: `Phase 2 (입면도 분석) 실패: ${msg}` }); return;
  }

  // ── Phase 3: 합성 생성 (ROOM 4+5+6) — 4개 입력 전체 수신 ────────
  let generatedImageBase64: string;
  try {
    const phase3Prompt = [
      'ROOM 4 (합성 전략의 방) → ROOM 5 (시공의 방) → ROOM 6 (검증의 방) 순서로 실행하여 극사실주의 3D 외관 투시 이미지를 생성하세요.',
      '',
      '=== Phase 1 페어: 평면도 이미지 + floorplan-analysis-spec ===',
      JSON.stringify(floorplanSpec, null, 2),
      '',
      '=== Phase 2 페어: 입면도 이미지 + elevation-analysis-spec ===',
      JSON.stringify(elevationSpec, null, 2),
      '',
      '이중 권위 원칙:',
      '- 수평 차원(배치/깊이): 평면도 우선 (Spatial Authority)',
      '- 수직 차원(비율/파사드): 입면도 우선 (Formal Authority)',
      '',
      '출력: 인간 눈높이 45° 3/4 외관 투시뷰 (Eye-level Exterior Perspective)',
      '',
      '생성 파라미터:',
      `- 해상도: ${resolution}`,
      `- 비율: ${aspect_ratio}`,
      `- 스타일: ${style_mode}`,
      `- 사용자 요청: ${user_prompt || '(없음)'}`,
    ].join('\n');

    const makePhase3Call = (model: string) => () => Promise.race([
      ai.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt, responseModalities: ['IMAGE', 'TEXT'] },
        // 평면도 이미지 + 입면도 이미지 + 두 스펙 텍스트
        contents: [{ role: 'user', parts: [floorplanPart, elevationPart, { text: phase3Prompt }] }],
      }).then(r => {
        const parts = r.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
          p.inlineData?.mimeType?.startsWith('image/')
        );
        if (!imgPart?.inlineData?.data) throw new Error('No image in generation response');
        return imgPart.inlineData.data as string;
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_IMAGE_GEN)),
    ]);

    generatedImageBase64 = await callWithFallback(makePhase3Call(MODEL_IMAGE_GEN), makePhase3Call(MODEL_IMAGE_GEN_FALLBACK));
    console.log('[sketch-to-image] Phase 3 (합성 생성) 완료');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-image] Phase 3 failed:', msg);
    res.status(503).json({ error: `Phase 3 (합성 생성) 실패: ${msg}` }); return;
  }

  const multiSourceReport = buildMultiSourceReport(floorplanSpec, elevationSpec);

  uploadToStorage(nodeId, generatedImageBase64, 'image/png').catch(() => {});
  res.json({ generated_image: generatedImageBase64, analysis_report: multiSourceReport });
});

export default router;
