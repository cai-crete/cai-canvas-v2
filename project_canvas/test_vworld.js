const pnu = '1168010800102130012';
const key = '2A63345D-557F-32C5-89D5-DE55A65CF23B';
const domain = 'https://cai-planners-v2.vercel.app';

const urlCql = `https://api.vworld.kr/req/wfs?key=${key}&domain=${encodeURIComponent(domain)}&SERVICE=WFS&REQUEST=GetFeature&TYPENAME=lp_pa_cbnd_bubun&VERSION=1.1.0&MAXFEATURES=40&SRSNAME=EPSG:4326&OUTPUT=application/json&CQL_FILTER=pnu='${pnu}'`;

const xmlFilter = `<ogc:Filter><ogc:PropertyIsEqualTo matchCase="true"><ogc:PropertyName>pnu</ogc:PropertyName><ogc:Literal>${pnu}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`;
const urlXml = `https://api.vworld.kr/req/wfs?key=${key}&domain=${encodeURIComponent(domain)}&SERVICE=WFS&REQUEST=GetFeature&TYPENAME=lp_pa_cbnd_bubun&VERSION=1.1.0&MAXFEATURES=40&SRSNAME=EPSG:4326&OUTPUT=application/json&FILTER=${encodeURIComponent(xmlFilter)}`;

async function run() {
  console.log('=== Vworld WFS 직접 호출 디버깅 ===');
  
  try {
    console.log('\n1. CQL_FILTER 방식 호출 중...');
    const r1 = await fetch(urlCql);
    const t1 = await r1.text();
    console.log(`[HTTP ${r1.status}] 응답:\n${t1.substring(0, 500)}`);
  } catch(e) {
    console.error(e.message);
  }
  
  try {
    console.log('\n2. XML FILTER 방식 호출 중...');
    const r2 = await fetch(urlXml);
    const t2 = await r2.text();
    console.log(`[HTTP ${r2.status}] 응답:\n${t2.substring(0, 500)}`);
  } catch(e) {
    console.error(e.message);
  }
}
run();
