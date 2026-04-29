import { NextResponse } from 'next/server';
import https from 'https';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VWORLD_KEY = process.env.VWORLD_API_KEY || '2A63345D-557F-32C5-89D5-DE55A65CF23B';
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN || 'https://cai-planners-v2.vercel.app/';

/* Vercel undici fetch의 UND_ERR_SOCKET 문제를 우회하기 위해
   Node.js https 모듈로 직접 요청한다. */
function vworldFetch(url: string, timeoutMs = 15000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('VWorld 요청 타임아웃')); });
    req.on('error', reject);
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, pnu, bbox } = body;

    console.log('[VWorld API] 직통 호출 시작 — action:', action, 'pnu:', pnu ?? 'none', 'bbox:', bbox ?? 'none');

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
        return NextResponse.json({ error: 'road-wfs 요청에는 bbox [minLng, minLat, maxLng, maxLat]가 필요합니다.', data: { features: [] } }, { status: 400 });
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
        if (roadRes.status < 200 || roadRes.status >= 300) {
          return NextResponse.json({ data: { type: 'FeatureCollection', features: [] }, note: '도로 WFS 실패' });
        }
        const roadData = JSON.parse(roadRes.body);
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

    let wfsUrl = '';

    if (action === 'wfs') {
      if (!pnu) return NextResponse.json({ error: 'pnu required', data: { features: [] } }, { status: 400 });
      // XML Filter — lp_pa_cbnd_bubun 레이어는 CQL_FILTER 미지원, XML ogc:Filter 필수
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

    console.log(`[VWorld API] WFS Fetch 요청 — URL Length: ${wfsUrl.length}`);

    const res = await vworldFetch(wfsUrl);

    if (res.status < 200 || res.status >= 300) {
      console.error('[VWorld API] 통신 오류:', res.status, res.body.slice(0, 300));
      return NextResponse.json(
        { error: `VWorld API 오류 (${res.status})`, data: { features: [] }, note: res.body.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = JSON.parse(res.body);
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
