import { NextResponse } from 'next/server';

const PLANNERS_BACKEND_URL = 'https://cai-planners-v2.vercel.app';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const res = await fetch(`${PLANNERS_BACKEND_URL}/api/vworld-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[VWorld Proxy] 백엔드 오류:', res.status, text.slice(0, 200));
      return NextResponse.json(
        { success: false, error: `VWorld 백엔드 통신 오류 (${res.status}).` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[VWorld Proxy] 오류:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
