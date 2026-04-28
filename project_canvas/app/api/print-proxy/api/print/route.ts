import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PRINT_API_URL     = process.env.PRINT_API_URL;
const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET;

const TARGET_URL = PRINT_API_URL ? `${PRINT_API_URL.replace(/\/+$/, '')}/api/print` : null;
const MAX_BYTES  = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 환경변수 검증
  if (!TARGET_URL) {
    console.error('[print-bff] PRINT_API_URL 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ error: 'Print 서버 URL이 설정되지 않았습니다.' }, { status: 503 });
  }
  if (!CANVAS_API_SECRET) {
    console.error('[print-bff] CANVAS_API_SECRET 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ error: 'Print 서버 인증이 설정되지 않았습니다.' }, { status: 503 });
  }

  // Content-Type 검증 — multipart/form-data만 허용
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json(
      { error: `지원하지 않는 Content-Type: ${contentType}` },
      { status: 415 },
    );
  }

  const startTime = Date.now();

  // 요청 본문 버퍼링 (스트리밍 대신 ArrayBuffer — Next.js 15 dev 환경 호환성)
  let buffer: ArrayBuffer;
  try {
    buffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽는 데 실패했습니다.' }, { status: 400 });
  }

  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: '요청 크기가 50MB를 초과했습니다.' }, { status: 413 });
  }

  console.log(`\n[print-bff] ▶ POST /api/print → ${TARGET_URL} (${buffer.byteLength} bytes)`);

  const forwardHeaders = new Headers();
  forwardHeaders.set('content-type', contentType);
  forwardHeaders.set('content-length', String(buffer.byteLength));
  forwardHeaders.set('x-canvas-api-secret', CANVAS_API_SECRET);
  forwardHeaders.set('host', new URL(TARGET_URL).host);

  const UPSTREAM_TIMEOUT_MS = 120_000;

  try {
    const upstream = await fetch(TARGET_URL, {
      method:  'POST',
      headers: forwardHeaders,
      body:    buffer,
      signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const elapsed   = Date.now() - startTime;
    const resLength = upstream.headers.get('content-length') ?? 'unknown';
    console.log(`[print-bff] ◀ ${upstream.status} (${elapsed}ms, ${resLength} bytes)`);

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');

    return new NextResponse(upstream.body, {
      status:  upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    if (isTimeout) {
      console.error(`[print-bff] ✕ TIMEOUT (${elapsed}ms): upstream did not respond`);
      return NextResponse.json({ error: 'Print 서버 응답 시간 초과' }, { status: 504 });
    }
    console.error(`[print-bff] ✕ FETCH FAILED (${elapsed}ms):`, err);
    return NextResponse.json(
      { error: `Print 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
