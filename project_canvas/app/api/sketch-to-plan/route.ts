import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const url = `${process.env.RENDER_SERVER_URL}/api/sketch-to-plan`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET!,
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sketch-to-plan proxy] error:', message);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 503 });
  }
}
