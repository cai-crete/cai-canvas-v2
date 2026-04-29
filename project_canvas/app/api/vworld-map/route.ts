import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// VWorld는 한국 정부 API — 서울 리전에서 호출해야 안정적
export const preferredRegion = ['icn1', 'hnd1'];

const VWORLD_KEY = process.env.VWORLD_API_KEY || '2A63345D-557F-32C5-89D5-DE55A65CF23B';
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN || 'https://cai-planners-v2.vercel.app/';

/* Planners 서버와 동일한 패턴: AbortController + 표준 fetch + 재시도
   UND_ERR_SOCKET은 Vercel undici의 간헐적 소켓 에러이므로 재시도로 해결 */
async function vworldFetch(url: string, timeoutMs = 12000, retries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      return res;
    } catch (e: unknown) {
      clearTimeout(timer);
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[VWorld API] fetch 시도 ${attempt}/${retries} 실패: ${msg}`);
      if (attempt < retries) {
        // 재시도 전 짧은 대기
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, pnu, bbox } = body;

    console.log('[VWorld API] 호출 — action:', action, 'pnu:', pnu ?? 'none', 'bbox:', bbox ?? 'none');

    if (!['wfs', 'wfs-bbox', 'proxy-image', 'road-wfs'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action', data: { features: [] } }, { status: 400 });
    }

    if (action === 'proxy-image') {
      const { url } = body;
      if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 });
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = imgRes.headers.get('content-type') || 'image/png';
        return NextResponse.json({ success: true, dataUrl: `data:${contentType};base64,${base64}` });
      } catch (e) {
        return NextResponse.json({ error: 'Proxy fetch exception' }, { status: 500 });
      }
    }

    // ── 도로 중심선 WFS (3D 버드아이 뷰용) ──
    if (action === 'road-wfs') {
      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
        return NextResponse.json({ error: 'road-wfs requires bbox', data: { features: [] } }, { status: 400 });
      }
      const roadParams = new URLSearchParams({
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lt_l_roa_lnm',
        VERSION: '1.1.0',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        MAXFEATURES: '50',
        BBOX: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`,
        KEY: VWORLD_KEY,
        DOMAIN: VWORLD_DOMAIN,
      });
      const roadUrl = `https://api.vworld.kr/req/wfs?${roadParams.toString()}`;
      try {
        const roadRes = await vworldFetch(roadUrl);
        if (!roadRes.ok) {
          console.error(`[VWorld API] 도로 WFS 실패: ${roadRes.status}`);
          return NextResponse.json({ data: { type: 'FeatureCollection', features: [] }, note: '도로 WFS 실패' });
        }
        const roadData = await roadRes.json();
        const count = roadData?.features?.length ?? 0;
        console.log(`[VWorld API] 도로 WFS — ${count}건 조회`);
        if (!roadData || roadData.type !== 'FeatureCollection' || !Array.isArray(roadData.features)) {
          return NextResponse.json({ data: { type: 'FeatureCollection', features: [] }, note: '응답 형식 오류' });
        }
        return NextResponse.json({ data: roadData, note: `${count}건 도로 조회` });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        console.error(`[VWorld API] 도로 WFS 요청 실패:`, msg);
        return NextResponse.json({ data: { type: 'FeatureCollection', features: [] }, note: msg });
      }
    }

    // ── WFS 지적도 요청 URL 구성 ──
    let wfsUrl = '';

    if (action === 'wfs') {
      if (!pnu) return NextResponse.json({ error: 'pnu required', data: { features: [] } }, { status: 400 });
      // lp_pa_cbnd_bubun 레이어는 CQL_FILTER 미지원 → XML ogc:Filter 필수
      const xmlFilter = `<ogc:Filter><ogc:PropertyIsEqualTo matchCase="true"><ogc:PropertyName>pnu</ogc:PropertyName><ogc:Literal>${pnu}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`;
      const params = new URLSearchParams({
        KEY: VWORLD_KEY,
        DOMAIN: VWORLD_DOMAIN,
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lp_pa_cbnd_bubun',
        VERSION: '1.1.0',
        MAXFEATURES: '40',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        FILTER: xmlFilter,
      });
      wfsUrl = `https://api.vworld.kr/req/wfs?${params.toString()}`;
    } else if (action === 'wfs-bbox') {
      if (!bbox) return NextResponse.json({ error: 'bbox required', data: { features: [] } }, { status: 400 });
      const params = new URLSearchParams({
        KEY: VWORLD_KEY,
        DOMAIN: VWORLD_DOMAIN,
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lp_pa_cbnd_bubun',
        VERSION: '1.1.0',
        MAXFEATURES: '1000',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        BBOX: `${bbox},EPSG:4326`,
      });
      wfsUrl = `https://api.vworld.kr/req/wfs?${params.toString()}`;
    }

    console.log(`[VWorld API] WFS URL Length: ${wfsUrl.length}`);

    const res = await vworldFetch(wfsUrl);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[VWorld API] 통신 오류:', res.status, errBody.slice(0, 300));
      return NextResponse.json(
        { error: `VWorld API 오류 (${res.status})`, data: { features: [] }, note: errBody.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const featureCount = data?.features?.length ?? 0;

    console.log(`[VWorld API] GeoJSON 응답 성공 — features: ${featureCount}건`);

    return NextResponse.json({
      success: true,
      data: data,
      note: featureCount > 0 ? 'WFS 조회 성공' : 'WFS 응답 없음 또는 조회 실패'
    }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    console.error('[VWorld API] 예외 발생:', message, '| cause:', cause);
    console.error('[VWorld API] KEY prefix:', VWORLD_KEY.slice(0, 8), '| DOMAIN:', VWORLD_DOMAIN);
    return NextResponse.json({ error: message, data: { features: [] } }, { status: 500 });
  }
}
