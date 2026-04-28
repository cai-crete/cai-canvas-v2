// planners/lib/roadApi.ts
// 도로 WFS 조회 + 메인 입면 방향(camera heading) 계산 유틸

import type { CadastralGeoJson } from '@/types/canvas';

const API_BASE = '/api/vworld-map';

// ── 타입 ────────────────────────────────────────────────────────────
export interface RoadFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][] | number[][][] };
  properties: {
    RN?: string;       // 도로명
    RD_WTH?: number;   // 도로폭 (미터)
    ROA_CLS_CD?: string; // 도로등급코드
    [key: string]: unknown;
  };
}

export interface FacadeResult {
  heading: number;   // 카메라 heading (0=북, 시계방향 degrees)
  height: number;    // 카메라 높이 (m)
  roadInfo: string;  // 예: "북측 8m 도로 접면"
}

// ── 1. 도로 WFS 조회 ────────────────────────────────────────────────
export async function fetchRoads(
  center: { lng: number; lat: number },
): Promise<RoadFeature[]> {
  const d = 0.002; // 약 200m 반경
  const bbox: [number, number, number, number] = [
    center.lng - d, center.lat - d,
    center.lng + d, center.lat + d,
  ];

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'road-wfs', bbox }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.features ?? [];
  } catch {
    return [];
  }
}

// ── 2. 메인 입면 방향 계산 ──────────────────────────────────────────
/**
 * 대지 경계 GeoJSON + 도로 WFS 데이터로 카메라 heading을 계산합니다.
 *
 * 알고리즘:
 * 1. 대지 외곽선 각 변의 중점과 외향 법선 각도를 구합니다.
 * 2. 도로 중 폭원(RD_WTH)이 가장 크고, 변에 가장 가까운 도로를 선택합니다.
 * 3. 해당 도로에 가장 가까운 변의 법선 방향 = camera heading
 * 4. 도로 없으면 가장 긴 변의 법선을 사용합니다 (fallback).
 */
export function calculateFacade(
  boundary: CadastralGeoJson,
  roads: RoadFeature[],
): FacadeResult {
  const feature = boundary.features[0];
  if (!feature) {
    return { heading: 0, height: 500, roadInfo: '경계 데이터 없음' };
  }

  const coords: [number, number][] =
    feature.geometry.type === 'Polygon'
      ? (feature.geometry.coordinates as number[][][])[0].map(c => [c[0], c[1]])
      : (feature.geometry.coordinates as number[][][][])[0][0].map(c => [c[0], c[1]]);

  // ── 각 변의 중점·법선·길이 계산 ──
  const edges: { midLng: number; midLat: number; normalAngle: number; length: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const midLng = (lng1 + lng2) / 2;
    const midLat = (lat1 + lat2) / 2;
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const length = Math.sqrt(dx * dx + dy * dy);
    // 외향 법선 → degrees (0=북, 시계방향)
    const normalRad = Math.atan2(dy, -dx);
    const normalAngle = ((90 - normalRad * 180 / Math.PI) % 360 + 360) % 360;
    edges.push({ midLng, midLat, normalAngle, length });
  }

  if (edges.length === 0) {
    return { heading: 0, height: 500, roadInfo: '변 계산 실패' };
  }

  // ── centroid ──
  const centLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

  // ── 법선 방향이 외향인지 검증 (centroid에서 멀어지는 방향이 외향) ──
  for (const edge of edges) {
    const outRad = (90 - edge.normalAngle) * Math.PI / 180;
    const testLng = edge.midLng + Math.cos(outRad) * 0.0001;
    const testLat = edge.midLat + Math.sin(outRad) * 0.0001;
    const distOrig = Math.hypot(edge.midLng - centLng, edge.midLat - centLat);
    const distTest = Math.hypot(testLng - centLng, testLat - centLat);
    if (distTest < distOrig) {
      edge.normalAngle = (edge.normalAngle + 180) % 360;
    }
  }

  // ── 도로 없으면 fallback: 가장 긴 변 ──
  if (roads.length === 0) {
    const longest = edges.reduce((a, b) => a.length > b.length ? a : b);
    const direction = getDirectionName(longest.normalAngle);
    return {
      heading: longest.normalAngle,
      height: 500,
      roadInfo: `${direction} (도로 데이터 없음, 최장변 기준)`,
    };
  }

  // ── 도로별 폭원 + 대지 변과의 최소 거리로 메인 입면 결정 ──
  let bestEdge = edges[0];
  let bestRoadWidth = 0;
  let bestRoadName = '';

  for (const road of roads) {
    const width = road.properties?.RD_WTH ?? 0;
    const roadCoords = extractLineCoords(road);
    if (roadCoords.length === 0) continue;

    for (const edge of edges) {
      const dist = minDistToLine(edge.midLng, edge.midLat, roadCoords);
      // 0.001도 ≈ 약 110m 이내의 도로만 "접도"로 판정
      if (dist < 0.001 && width > bestRoadWidth) {
        bestRoadWidth = width;
        bestEdge = edge;
        bestRoadName = road.properties?.RN ?? '';
      }
    }
  }

  // 접도 판정 실패 시 → 가장 큰 도로에 가장 가까운 변
  if (bestRoadWidth === 0) {
    const widestRoad = roads.reduce((a, b) =>
      (a.properties?.RD_WTH ?? 0) > (b.properties?.RD_WTH ?? 0) ? a : b
    );
    bestRoadWidth = widestRoad.properties?.RD_WTH ?? 0;
    bestRoadName = widestRoad.properties?.RN ?? '';
    const widestCoords = extractLineCoords(widestRoad);
    if (widestCoords.length > 0) {
      let minDist = Infinity;
      for (const edge of edges) {
        const d = minDistToLine(edge.midLng, edge.midLat, widestCoords);
        if (d < minDist) { minDist = d; bestEdge = edge; }
      }
    }
  }

  const direction = getDirectionName(bestEdge.normalAngle);
  const widthStr = bestRoadWidth > 0 ? `${bestRoadWidth}m` : '폭 미상';
  const nameStr = bestRoadName ? ` ${bestRoadName}` : '';

  return {
    heading: bestEdge.normalAngle,
    height: 500,
    roadInfo: `${direction} ${widthStr}${nameStr} 도로 접면`,
  };
}

// ── 헬퍼 함수 ────────────────────────────────────────────────────────

function extractLineCoords(road: RoadFeature): [number, number][] {
  const { type, coordinates } = road.geometry;
  if (type === 'LineString') {
    return (coordinates as number[][]).map(c => [c[0], c[1]]);
  }
  if (type === 'MultiLineString') {
    return (coordinates as number[][][]).flat().map(c => [c[0], c[1]]);
  }
  return [];
}

function minDistToLine(px: number, py: number, line: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentDist(px, py, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getDirectionName(heading: number): string {
  const dirs = ['북측', '북동측', '동측', '남동측', '남측', '남서측', '서측', '북서측'];
  return dirs[Math.round(heading / 45) % 8];
}
