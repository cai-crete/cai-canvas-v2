import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 모델 설정 ─────────────────────────────────────────────────────────────────
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

// ── 인라인 프로토콜 (fs 의존성 없음) ──────────────────────────────────────────
const PROTOCOL_VIEWPOINT_V1 = `# SYSTEM: Integrated Viewpoint Simulation Architect (IVSP-Unified)
# Protocol Version: v1
# Node: N05 Viewpoint

# GOAL
Change the angle of view of the provided architectural image to a specific new perspective **without altering the building's original geometry, materials, or style.**
Translate the user's viewpoint selection into "Numerical Geo-Spatial Coordinates" and simulate a photorealistic architectural image based on physical optical laws.
Execute a "Physical Movement Command" within a completed 3D reality — shifting from simple generation to precise "Coordinate-Based Virtual Photography."

# CONTEXT
- **Ontological Status:** The input image is a "Completed Architectural Reality." It is a fixed physical object, not a sketch.
- **Operational Logic:** Apply Intuition-to-Coordinate Translation. Convert viewpoint selections into precise relative vectors.
- **Geometric Sanctuary:** The building's proportions, structure, floor count, window count, and material details are **Immutable Constants**. Only the observer (camera) moves.

# ROLE
**Coordinate Controller & Virtual Architectural Photographer**
You are an engine that calculates precise GPS coordinates relative to the subject and selects optimal industrial standard camera equipment (Fujifilm GFX 100S, Phase One, etc.) based on the calculated distance and angle.

# ACTION PROTOCOL (MANDATORY EXECUTION WORKFLOW)

## Pre-Step: Define Viewpoint Delta (Δ) & Anchor Reality
1. **Current Viewpoint Analysis (V0):** Reverse-engineer the camera position of the input image. Fix the building's geometric form as an "Immutable Reference."
2. **Target Viewpoint Setting (V1):** Convert the selected viewpoint into specific coordinates. Define Azimuth, Altitude, Distance, and Pitch.
3. **Movement Vector Calculation (Δ):** Calculate the Optimal Orbit Path from V0 to V1. Maintain "Geometric Sanctuary" throughout the movement.

## Step 1: Coordinate Anchoring & Vector Calculation
1. Fix the building's main facade at **06:00 (Front)**.
2. Translate the selected viewpoint into a specific vector:
   - Street View → **06:00 Vector**, Height 1.6m
   - Aerial View → **High Altitude (>150m)**, any azimuth
   - Detail View → **Close Range**, any azimuth
   - Quarter View (Corner) → **04:30 Vector**, standard altitude

## Step 2: Scenario Mapping & Optical Engineering
- **Street View:** Mount **23mm Tilt-Shift Lens** on **Fujifilm GFX 100S**. Zero vertical distortion, architectural stability at 1.6m height.
- **Aerial View:** Mount **32mm Lens** on **Phase One System**. Capture contextual layout and roof geometry.
- **Detail View:** Mount **110mm Macro Lens (f/2.8)**. Shallow depth of field to emphasize material textures.
- **Quarter View:** Mount **45mm Standard Lens**. Apply 2-Point Perspective to maximize volumetric perception.

## Step 3: Layering & Blind Spot Inference
1. **Perspective Enforcement:** 1-Point for face-on views, 2-Point for corner views, 3-Point for high-altitude.
2. **Blind Spot Logic:** If moving to Rear or hidden sides, extract "Design DNA" from front facade. Logically place Service Doors, Ventilation, and MEP details.
3. **Material Injection:** Lock original textures. Apply Relighting only to match the new solar angle.

## Step 4: Final Execution & Compliance Check
- Original geometry preserved 100%? (No Hallucination)
- Perspective mathematically correct? (No Distortion)
- Blind spot logically inferred? (No Blank Spaces)
- Materials and proportions unchanged?

**[GENERATE IMAGE NOW]**`;

// ── 시점별 스펙 ───────────────────────────────────────────────────────────────
const VIEWPOINT_SPEC: Record<string, { label: string; instruction: string }> = {
  street: {
    label: 'Street View',
    instruction: [
      'TARGET: Street View / Eye Level',
      '- Vector: 06:00 (Front facade), Height 1.6m',
      '- Camera: Fujifilm GFX 100S + 23mm Tilt-Shift Lens',
      '- Perspective: 1-Point (vertical lines strictly parallel)',
      '- Priority: Zero vertical distortion, architectural stability',
    ].join('\n'),
  },
  aerial: {
    label: "Aerial View / Bird's Eye",
    instruction: [
      "TARGET: Aerial View / Bird's Eye",
      '- Vector: Any azimuth, Altitude >150m, Pitch -45° to -90°',
      '- Camera: Phase One System + 32mm Lens',
      '- Perspective: 3-Point (converging verticals acceptable)',
      '- Priority: Full site layout, roof geometry, surrounding context',
    ].join('\n'),
  },
  detail: {
    label: 'Detail View',
    instruction: [
      'TARGET: Detail View / Close-up',
      '- Vector: Any azimuth, Distance <5m from facade',
      '- Camera: 110mm Macro Lens (f/2.8), shallow Depth of Field',
      '- Perspective: Minimal distortion at close range',
      '- Priority: Material texture, surface detail, craftsmanship',
    ].join('\n'),
  },
  quarter: {
    label: 'Quarter View',
    instruction: [
      'TARGET: Quarter View / Corner Shot',
      '- Vector: 04:30 direction (45° from front-right corner)',
      '- Camera: 45mm Standard Lens, standard altitude',
      '- Perspective: 2-Point (maximize volumetric perception)',
      '- Priority: Building mass, depth, corner articulation',
    ].join('\n'),
  },
};

// ── 분석 프롬프트 조립 ────────────────────────────────────────────────────────
function buildAnalysisPrompt(viewpoint: string, feedback: string): string {
  const spec = VIEWPOINT_SPEC[viewpoint];
  const lines = [
    '## TASK',
    `Change the viewpoint of this architectural image to: **${spec.label}**`,
    '',
    '## TARGET VIEWPOINT SPECIFICATION',
    spec.instruction,
    '',
    '## EXECUTION INSTRUCTIONS',
    'Follow the ACTION PROTOCOL in sequence:',
    '',
    '**Pre-Step:** Define V0 (current camera), V1 (target), Δ (movement path)',
    '**Step 1:** Lock building geometry — floor count, window count, proportions as Immutable Constants',
    '**Step 2:** Confirm camera body and lens per specification. State focal length and optical parameters.',
    '**Step 3:** If new viewpoint exposes hidden faces, extract Design DNA and logically place service elements.',
    '**Step 4:** Calculate new solar angle and shadow direction. Lock original material values.',
    '',
    '**Final Output:** Synthesize all steps into a single precise image generation prompt.',
    'End with: [GENERATE IMAGE NOW]',
  ];

  if (feedback) {
    lines.push('', '## USER FEEDBACK (integrate into this simulation)', feedback);
  }

  return lines.join('\n');
}

// ── 이미지 생성 프롬프트 조립 ─────────────────────────────────────────────────
function buildGenerationPrompt(executionPrompt: string): string {
  return [
    executionPrompt,
    '',
    '## FORM PROTECTION SHIELD (NON-NEGOTIABLE)',
    '- Floor count: LOCKED — do not add or remove floors',
    '- Window count and placement: LOCKED — do not alter grid',
    '- Building proportions and mass: LOCKED — no geometric deformation',
    '- Material identity (concrete/glass/metal): LOCKED — texture only shifts with light',
    '- No hallucinated ornaments or structural elements',
  ].join('\n');
}

// ── 타임아웃 래퍼 ─────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ── 폴백 래퍼 ────────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

async function callWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await withRetry(primary);
  } catch (err) {
    console.warn('[viewpoint] Primary model failed, trying fallback:', err);
    return await withRetry(fallback);
  }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────
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

  // ── 입력 검증 ──────────────────────────────────────────────────────────────
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

  // ── API Key 확인 ───────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY_VIEWPOINT ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[viewpoint] GEMINI_API_KEY_VIEWPOINT is not set');
    return NextResponse.json(
      { error: 'API configuration error: GEMINI_API_KEY_VIEWPOINT is missing' },
      { status: 500 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const imagePart: Part = {
    inlineData: {
      mimeType: mimeTypeLower as AllowedMimeType,
      data: image_base64,
    },
  };

  const startTime = Date.now();

  // ── Step 1: 시점 분석 (텍스트) ────────────────────────────────────────────
  let executionPrompt: string;
  try {
    const analysisText = buildAnalysisPrompt(viewpoint, user_prompt);

    const makeAnalysisCall = (modelName: string) => () => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: PROTOCOL_VIEWPOINT_V1,
      });
      return withTimeout(
        model.generateContent([imagePart, { text: analysisText }]),
        TIMEOUT_ANALYSIS
      ).then(r => r.response.text());
    };

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

  // ── Step 2: 이미지 생성 ───────────────────────────────────────────────────
  let generatedImageBase64: string;
  let generatedMimeType: string;

  try {
    const generationText = buildGenerationPrompt(executionPrompt);

    const makeGenerationCall = (modelName: string) => () => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
      });
      return withTimeout(
        model.generateContent([imagePart, { text: generationText }]),
        TIMEOUT_IMAGE_GEN
      ).then(r => {
        const parts = r.response.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
        if (!imgPart?.inlineData?.data) throw new Error('No image in generation response');
        return { data: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType ?? 'image/png' };
      });
    };

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

  // ── 응답 ─────────────────────────────────────────────────────────────────
  const imageDataUrl = generatedImageBase64.startsWith('data:')
    ? generatedImageBase64
    : `data:${generatedMimeType};base64,${generatedImageBase64}`;

  return NextResponse.json({
    generated_image: imageDataUrl,
    analysis: executionPrompt,
  });
}
