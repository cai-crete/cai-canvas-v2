import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PRINT_API_URL     = process.env.PRINT_API_URL;
const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET;

const TARGET_URL = PRINT_API_URL ? `${PRINT_API_URL.replace(/\/+$/, '')}/api/library` : null;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (!TARGET_URL) {
    console.error('[print-bff/library] PRINT_API_URL 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ error: 'Print 서버 URL이 설정되지 않았습니다.' }, { status: 503 });
  }
  if (!CANVAS_API_SECRET) {
    console.error('[print-bff/library] CANVAS_API_SECRET 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ error: 'Print 서버 인증이 설정되지 않았습니다.' }, { status: 503 });
  }

  const startTime = Date.now();
  console.log(`\n[print-bff/library] ▶ GET /api/library → ${TARGET_URL}`);

  const forwardHeaders = new Headers();
  forwardHeaders.set('x-canvas-api-secret', CANVAS_API_SECRET);

  try {
    const upstream = await fetch(TARGET_URL, { headers: forwardHeaders });

    const elapsed = Date.now() - startTime;
    console.log(`[print-bff/library] ◀ ${upstream.status} (${elapsed}ms)`);

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');

    return new NextResponse(upstream.body, {
      status:  upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[print-bff/library] ✕ FETCH FAILED (${elapsed}ms):`, err);
    return NextResponse.json(
      { error: `Print 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
