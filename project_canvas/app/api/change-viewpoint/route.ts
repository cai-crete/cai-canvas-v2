import { NextRequest, NextResponse } from 'next/server';

const VALID_VIEWPOINTS = ['aerial', 'street', 'quarter', 'detail'] as const;
type Viewpoint = (typeof VALID_VIEWPOINTS)[number];

const MAX_IMAGE_BYTES   = 10 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 2000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

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
    mime_type   = 'image/png',
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

  const apiUrl = process.env.VIEWPOINT_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: 'API configuration error: VIEWPOINT_API_URL is missing' }, { status: 500 });
  }

  const imageBlob = new Blob([imageBuffer], { type: mimeTypeLower });
  const formData  = new FormData();
  formData.append('image',     imageBlob, 'image.png');
  formData.append('viewpoint', viewpoint);
  if (user_prompt) {
    formData.append('feedback', user_prompt);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${apiUrl}/api/generate`, {
      method: 'POST',
      body:   formData,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Viewpoint backend unreachable:', msg);
    return NextResponse.json({ error: `Backend unreachable: ${msg}` }, { status: 503 });
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => '');
    console.error(`Viewpoint backend error ${upstreamRes.status}:`, text);
    return NextResponse.json(
      { error: `Backend error: ${upstreamRes.status}` },
      { status: 503 }
    );
  }

  let upstreamData: { image?: string; mimeType?: string; analysis?: string };
  try {
    upstreamData = await upstreamRes.json();
  } catch {
    return NextResponse.json({ error: 'Invalid response from backend' }, { status: 503 });
  }

  if (!upstreamData.image) {
    return NextResponse.json({ error: 'No image in backend response' }, { status: 503 });
  }

  const mimeTypeOut = upstreamData.mimeType ?? 'image/png';
  const imageDataUrl = upstreamData.image.startsWith('data:')
    ? upstreamData.image
    : `data:${mimeTypeOut};base64,${upstreamData.image}`;

  return NextResponse.json({
    generated_image: imageDataUrl,
    analysis:        upstreamData.analysis ?? '',
  });
}
