import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const renderUrl = process.env.RENDER_SERVER_URL;
  if (!renderUrl) {
    return NextResponse.json({ error: 'RENDER_SERVER_URL is not configured' }, { status: 500 });
  }

  const response = await fetch(`${renderUrl}/api/sketch-to-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
