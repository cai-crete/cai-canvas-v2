import { NextResponse } from 'next/server';

const VWORLD_KEY = process.env.VWORLD_API_KEY || '2A63345D-557F-32C5-89D5-DE55A65CF23B';
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN || 'https://cai-planners-v2.vercel.app';

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
        const roadRes = await fetch(roadUrl);
        if (!roadRes.ok) {
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

    let wfsUrl = '';

    if (action === 'wfs') {
      if (!pnu) return NextResponse.json({ error: 'pnu required', data: { features: [] } }, { status: 400 });
      // Planners 서버와 동일한 방식 — lt_c_landseries + CQL_FILTER
      const params = new URLSearchParams({
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lt_c_landseries',
        VERSION: '1.1.0',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        MAXFEATURES: '40',
        KEY: VWORLD_KEY,
        DOMAIN: VWORLD_DOMAIN,
        CQL_FILTER: `pnu='${pnu}'`,
      });
      wfsUrl = `https://api.vworld.kr/req/wfs?${params.toString()}`;
    } else if (action === 'wfs-bbox') {
      if (!bbox) return NextResponse.json({ error: 'bbox required', data: { features: [] } }, { status: 400 });
      const params = new URLSearchParams({
        SERVICE: 'WFS',
        REQUEST: 'GetFeature',
        TYPENAME: 'lt_c_landseries',
        VERSION: '1.1.0',
        SRSNAME: 'EPSG:4326',
        OUTPUT: 'application/json',
        MAXFEATURES: '1000',
        KEY: VWORLD_KEY,
        DOMAIN: VWORLD_DOMAIN,
        BBOX: `${bbox},EPSG:4326`,
      });
      wfsUrl = `https://api.vworld.kr/req/wfs?${params.toString()}`;
    }

    console.log(`[VWorld API] WFS Fetch 요청 — URL Length: ${wfsUrl.length}`);
    
    const res = await fetch(wfsUrl);

    if (!res.ok) {
      const text = await res.text();
      console.error('[VWorld API] 통신 오류:', res.status, text.slice(0, 300));
      return NextResponse.json(
        { error: `VWorld API 오류 (${res.status})`, data: { features: [] }, note: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const featureCount = data?.features?.length ?? 0;
    
    console.log(`[VWorld API] GeoJSON 응답 성공 — features: ${featureCount}건`);
    
    // 프론트엔드가 기대하는 JSON 구조 { data: GeoJson, note: string } 로 반환
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
    // 빈 features 배열을 주어 프론트 크래시 방지
    return NextResponse.json({ error: message, data: { features: [] } }, { status: 500 });
  }
}
