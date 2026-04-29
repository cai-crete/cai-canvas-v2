# Known Issues & Troubleshooting

이 문서는 개발 과정에서 발견된 문제점과 해결 방법을 기록합니다.

---

## 1. Vercel 배포 리전 (CRITICAL)

**증상:** VWorld API 호출 시 502 Bad Gateway 또는 UND_ERR_SOCKET 에러  
**원인:** Vercel 기본 리전은 미국(iad1). VWorld는 한국 정부 API로 해외 IP 요청에 502를 반환함  
**해결:** `vercel.json`에 `"regions": ["icn1"]` (서울) 설정 필수

```json
{
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

**참고:** Planners(cai-planners-v2)는 처음부터 `icn1`이 설정되어 있어 문제없이 작동했음. 한국 공공 API(VWorld, 공공데이터포탈, 법제처 등)를 사용하는 모든 Vercel 프로젝트는 반드시 서울 리전으로 설정해야 함.

---

## 2. VWorld API 키 & 도메인

**증상:** VWorld WFS/WMS 응답 없음, INCORRECT_KEY 에러  
**원인:** VWorld API 키는 등록 시 입력한 도메인과 요청의 DOMAIN 파라미터가 일치해야 함

**체크리스트:**
- [ ] `VWORLD_API_KEY` 환경변수가 Vercel에 설정되어 있는가
- [ ] `VWORLD_DOMAIN` 환경변수가 키 등록 시 입력한 도메인과 일치하는가 (슬래시 포함: `https://도메인/`)
- [ ] `NEXT_PUBLIC_VWORLD_KEY` 환경변수가 설정되어 있는가 (클라이언트 WMTS 타일용)
- [ ] 1개 도메인 당 1개 키만 발급 가능 — 키 재발급 시 기존 키는 무효화됨

**키 발급:** https://map.vworld.kr → 인증키 발급 → 서비스 URL에 Vercel 도메인 등록

---

## 3. VWorld WFS 레이어 차이

| 레이어 | 용도 | 필터 방식 | 비고 |
|--------|------|-----------|------|
| `lp_pa_cbnd_bubun` | 개별 필지(연속지적도 부분) | XML `ogc:Filter` 필수 | CQL_FILTER 사용 시 필터 무시됨 |
| `lt_c_landseries` | 연속지적도 | `CQL_FILTER` 지원 | API 키에 따라 접근 불가할 수 있음 |
| `lt_l_roa_lnm` | 도로 중심선 | BBOX | 3D 뷰용 |

**주의:** `lp_pa_cbnd_bubun`에 `CQL_FILTER`를 사용하면 에러 없이 **엉뚱한 필지가 반환**됨. 반드시 XML `ogc:Filter`를 사용해야 정확한 PNU 조회 가능.

```xml
<ogc:Filter>
  <ogc:PropertyIsEqualTo matchCase="true">
    <ogc:PropertyName>pnu</ogc:PropertyName>
    <ogc:Literal>{PNU}</ogc:Literal>
  </ogc:PropertyIsEqualTo>
</ogc:Filter>
```

---

## 4. Vercel fetch UND_ERR_SOCKET

**증상:** `fetch failed` / `UND_ERR_SOCKET: other side closed`  
**원인:** Vercel의 undici HTTP 클라이언트가 커넥션 풀링 시 소켓을 조기 종료  
**해결:** 재시도 로직 (최대 3회, 300ms 간격)

```typescript
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 300 * i));
    }
  }
  throw new Error('unreachable');
}
```

**주의:** Node.js `https` 모듈로 우회하면 UND_ERR_SOCKET은 해결되지만 VWorld에서 502가 발생할 수 있음. 표준 `fetch` + 재시도가 가장 안정적.

---

## 5. Planners 썸네일 미표시

**증상:** Planners 노드 생성 후 캔버스에서 썸네일이 보이지 않음  
**원인:** `InfiniteCanvas.tsx`에서 NodeCard에 `plannerMessages` prop을 전달하지 않음  
**해결:** NodeCard 렌더링 시 `plannerMessages={node.plannerMessages}` prop 추가

---

## 6. 3D Map 노드 미생성

**증상:** Planners에서 지적도 분석 후 3D Map 노드가 캔버스에 나타나지 않음  
**원인:** `page.tsx`의 조건 `if (mapCenter && geoJson)` — VWorld WFS가 실패하면 geoJson이 null이므로 3D 노드가 생성되지 않음  
**해결:** VWorld WFS 502 문제 해결 (리전 설정) → geoJson 정상 반환 → 3D 노드 자동 생성

---

## 7. CORS 에러 (Planners ↔ Canvas 간 통신)

**증상:** Canvas에서 Planners API 호출 시 CORS 에러  
**원인:** Planners 서버의 `ALLOWED_ORIGINS`에 Canvas 도메인이 없음  
**해결:** Planners의 CORS 허용 목록에 `cai-canvas-v2*.vercel.app` 패턴 추가

---

## 8. Next.js 환경변수 접근

| 접두사 | 접근 범위 | 용도 |
|--------|----------|------|
| `VWORLD_API_KEY` | 서버사이드만 | API route에서 WFS/WMS 호출 |
| `NEXT_PUBLIC_VWORLD_KEY` | 클라이언트 + 서버 | 브라우저에서 WMTS 벡터 타일 직접 로드 |

**주의:** `NEXT_PUBLIC_` 접두사 없는 환경변수는 클라이언트 코드에서 `undefined`가 됨. WMTS 타일은 브라우저에서 직접 VWorld CDN을 호출하므로 반드시 `NEXT_PUBLIC_` 접두사가 필요.

---

## 9. WFS BBOX 좌표 순서

VWorld WFS BBOX는 좌표계에 따라 순서가 다름:

| 좌표계 | BBOX 순서 |
|--------|-----------|
| EPSG:4326, 5185~5188 | `ymin,xmin,ymax,xmax` (위도,경도 순) |
| 기타 (EPSG:900913 등) | `xmin,ymin,xmax,ymax` (경도,위도 순) |

코드에서 bbox를 `[minLng, minLat, maxLng, maxLat]`로 관리할 경우, EPSG:4326 WFS 호출 시 `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`로 변환해야 함.
