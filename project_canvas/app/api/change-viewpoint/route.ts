import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, loadProtocolFile, buildReportExtractionPrompt } from '@/lib/prompt';
import type { ViewpointAnalysisReport } from '@/types/canvas';

const MODEL_ANALYSIS = 'gemini-3.1-pro-preview';
const MODEL_IMAGE_GEN = 'gemini-3.1-flash-image-preview';
const MODEL_ANALYSIS_FALLBACK = 'gemini-2.5-pro-preview';
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image';

const TIMEOUT_ANALYSIS = 120000;
const TIMEOUT_IMAGE_GEN = 180000;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 2000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const VALID_VIEWPOINTS = ['aerial', 'street', 'quarter', 'detail'] as const;
type Viewpoint = (typeof VALID_VIEWPOINTS)[number];

const VIEWPOINT_LABEL: Record<Viewpoint, string> = {
  street: "Street View / Eye Level",
  aerial: "Aerial View / Bird's Eye",
  detail: "Detail View / Close-up",
  quarter: "Quarter View / Corner Shot",
};

async function callWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    console.warn('[viewpoint] Primary model failed, trying fallback:', err);
    return await fallback();
  }
}

export async function POST(req: NextRequest) {
  let body: {
    image_base64: string;
    mime_type?: string;
    viewpoint: Viewpoint;
    user_prompt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    image_base64,
    mime_type = 'image/png',
    viewpoint,
    user_prompt = '',
  } = body;

  if (!image_base64) {
    return NextResponse.json({ error: 'image_base64 is required' }, { status: 400 });
  }

  if (!(VALID_VIEWPOINTS as readonly string[]).includes(viewpoint)) {
    return NextResponse.json(
      { error: `Invalid viewpoint. Allowed: ${VALID_VIEWPOINTS.join(', ')}` },
      { status: 400 }
    );
  }

  const mimeTypeLower = mime_type.toLowerCase();
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeTypeLower)) {
    return NextResponse.json({ error: 'Invalid image type. Allowed: JPEG, PNG, WebP' }, { status: 400 });
  }

  const imageBuffer = Buffer.from(image_base64, 'base64');
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image size exceeds 10MB limit' }, { status: 400 });
  }

  if (user_prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `Prompt exceeds ${MAX_PROMPT_LENGTH} character limit` },
      { status: 400 }
    );
  }

  let systemPrompt: string;
  try {
    const protocolContent = loadProtocolFile('protocol-change-viewpoint-v1.txt');
    const knowledgeTemplates = loadProtocolFile('knowledge-viewpoint-templates.txt');
    systemPrompt = buildSystemPrompt(protocolContent, [knowledgeTemplates]);
  } catch (err) {
    console.error('[viewpoint] Protocol load failed:', err);
    return NextResponse.json({ error: 'Protocol initialization failed' }, { status: 500 });
  }

  const apiKey = process.env.GEMINI_API_KEY_VIEWPOINT ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API configuration error: GEMINI_API_KEY_VIEWPOINT is missing' },
      { status: 500 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const imagePart = {
    inlineData: {
      mimeType: mimeTypeLower as AllowedMimeType,
      data: image_base64,
    },
  };

  const startTime = Date.now();

  // Phase 1: 시점 분석 — Metacognitive Analysis + Final Execution Prompt 생성
  let executionPrompt: string;

  try {
    const analysisPrompt = [
      '## TASK',
      `Change the viewpoint of this architectural image to: **${VIEWPOINT_LABEL[viewpoint]}**`,
      '',
      '## EXECUTION INSTRUCTIONS',
      'Follow the ACTION PROTOCOL (Steps 1–4) in sequence.',
      'Output format must include:',
      '  1. [Metacognitive Analysis] — using the Section 3 template in knowledge',
      '  2. [Final Execution Prompt] — using the Section 4 template in knowledge',
      '',
      'End the Final Execution Prompt with: [GENERATE IMAGE NOW]',
      ...(user_prompt ? ['', '## USER FEEDBACK (integrate into this simulation)', user_prompt] : []),
    ].join('\n');

    const makeAnalysisCall = (modelName: string) => () =>
      Promise.race([
        ai.models.generateContent({
          model: modelName,
          config: { systemInstruction: systemPrompt },
          contents: [{ role: 'user', parts: [imagePart, { text: analysisPrompt }] }],
        }).then(r => r.text ?? ''),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_ANALYSIS}ms`)), TIMEOUT_ANALYSIS)
        ),
      ]);

    executionPrompt = await callWithFallback(
      makeAnalysisCall(MODEL_ANALYSIS),
      makeAnalysisCall(MODEL_ANALYSIS_FALLBACK)
    );

    console.log(`[viewpoint] analysis done in ${Date.now() - startTime}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[viewpoint] Analysis failed:', msg);
    return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 503 });
  }

  // Phase 1.5: 구조화 리포트 추출 (non-fatal — 실패해도 이미지 생성 계속)
  let viewpointReport: ViewpointAnalysisReport | null = null;
  try {
    const reportPrompt = buildReportExtractionPrompt(executionPrompt);
    const makeReportCall = (modelName: string) => () =>
      Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: reportPrompt }] }],
        }).then(r => r.text ?? ''),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Report extraction timeout')), 30000)
        ),
      ]);
    const rawJson = await callWithFallback(
      makeReportCall(MODEL_ANALYSIS),
      makeReportCall(MODEL_ANALYSIS_FALLBACK)
    );
    viewpointReport = JSON.parse(rawJson.trim()) as ViewpointAnalysisReport;
    console.log(`[viewpoint] report extracted in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.warn('[viewpoint] Report extraction failed (non-fatal):', err);
  }

  // Phase 2: 이미지 생성
  let generatedImageBase64: string;
  let generatedMimeType: string;

  try {
    const generationPrompt = [
      executionPrompt,
      '',
      '## FORM PROTECTION SHIELD (NON-NEGOTIABLE)',
      '- Floor count: LOCKED — do not add or remove floors',
      '- Window count and placement: LOCKED — do not alter grid',
      '- Building proportions and mass: LOCKED — no geometric deformation',
      '- Material identity (concrete/glass/metal): LOCKED — texture only shifts with light',
      '- No hallucinated ornaments or structural elements',
    ].join('\n');

    const makeGenerationCall = (modelName: string) => () =>
      Promise.race([
        ai.models.generateContent({
          model: modelName,
          config: { responseModalities: ['IMAGE', 'TEXT'] },
          contents: [{ role: 'user', parts: [imagePart, { text: generationPrompt }] }],
        }).then(r => {
          const parts = r.candidates?.[0]?.content?.parts ?? [];
          const imgPart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
            p.inlineData?.mimeType?.startsWith('image/')
          );
          if (!imgPart?.inlineData?.data) throw new Error('No image in generation response');
          return {
            data: imgPart.inlineData.data as string,
            mimeType: imgPart.inlineData.mimeType ?? 'image/png',
          };
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_IMAGE_GEN}ms`)), TIMEOUT_IMAGE_GEN)
        ),
      ]);

    const result = await callWithFallback(
      makeGenerationCall(MODEL_IMAGE_GEN),
      makeGenerationCall(MODEL_IMAGE_GEN_FALLBACK)
    );

    generatedImageBase64 = result.data;
    generatedMimeType = result.mimeType;

    console.log(`[viewpoint] viewpoint=${viewpoint} total elapsed=${Date.now() - startTime}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[viewpoint] Image generation failed:', msg);
    return NextResponse.json(
      { error: `Image generation failed: ${msg}`, analysis: executionPrompt },
      { status: 503 }
    );
  }

  // NodeCard.tsx: artboardType='image' 노드는 thumbnailData를 src로 직접 사용하므로 data URL 반환
  const imageDataUrl = generatedImageBase64.startsWith('data:')
    ? generatedImageBase64
    : `data:${generatedMimeType};base64,${generatedImageBase64}`;

  return NextResponse.json({
    generated_image: imageDataUrl,
    analysis: executionPrompt,
    report: viewpointReport,
  });
}
