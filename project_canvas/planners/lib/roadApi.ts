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
  heading: number;      // 카메라 heading (0=북, 시계방향 degrees)
  height: number;       // 카메라 높이 (m) — 면적 기반 동적 계산
  offsetAngle: number;  // 카메라 좌우 오프셋 각도 (+45=우측, -45=좌측, 0=정면)
  roadInfo: string;     // 예: "북측 8m 도로 접면"
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
  landArea?: number | null,
): FacadeResult {
  const feature = boundary.features[0];
  if (!feature) {
    return { heading: 0, height: 500, offsetAngle: 45, roadInfo: '경계 데이터 없음' };
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
    return { heading: 0, height: 500, offsetAngle: 45, roadInfo: '변 계산 실패' };
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

  // ── 면적 기반 카메라 높이 계산 ──
  const rawArea = (Number.isFinite(landArea) && landArea! > 0)
    ? landArea!
    : calcPolygonArea(coords);
  const effectiveArea = (Number.isFinite(rawArea) && rawArea > 0) ? rawArea : 2000; // fallback 2000㎡
  const camHeight = Math.max(150, Math.min(600,
    Math.sqrt(effectiveArea / Math.PI) * 3.5
  ));
  console.log('[roadApi] calculateFacade — landArea:', landArea, 'rawArea:', rawArea, 'effectiveArea:', effectiveArea, 'camHeight:', camHeight);

  // ── 도로 없으면 fallback: 가장 긴 변 ──
  if (roads.length === 0) {
    const longest = edges.reduce((a, b) => a.length > b.length ? a : b);
    const direction = getDirectionName(longest.normalAngle);
    return {
      heading: longest.normalAngle,
      height: camHeight,
      offsetAngle: 45,
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

  // ── 좌우 개방 판단 (메인 도로 접면 변 기준) ──
  const bestIdx = edges.indexOf(bestEdge);
  const leftEdge = edges[(bestIdx - 1 + edges.length) % edges.length];
  const rightEdge = edges[(bestIdx + 1) % edges.length];

  const leftHasRoad = hasAdjacentRoad(leftEdge, roads);
  const rightHasRoad = hasAdjacentRoad(rightEdge, roads);

  let offsetAngle: number;
  if (leftHasRoad && !rightHasRoad) {
    // 좌측 열림 → 좌측에서 바라봄
    offsetAngle = -45;
  } else if (!leftHasRoad && !rightHasRoad) {
    // 양측 막힘 → 정면
    offsetAngle = 0;
  } else {
    // 우측 열림 or 양측 열림 → 우측에서 바라봄 (기본값)
    offsetAngle = 45;
  }

  const result = {
    heading: bestEdge.normalAngle,
    height: camHeight,
    offsetAngle,
    roadInfo: `${direction} ${widthStr}${nameStr} 도로 접면`,
  };
  console.log('[roadApi] FacadeResult:', JSON.stringify(result));
  return result;
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

/** 대지 변의 중점 근처에 도로가 있는지 판단 (0.001도 ≈ 110m 이내) */
function hasAdjacentRoad(
  edge: { midLng: number; midLat: number },
  roads: RoadFeature[],
): boolean {
  for (const road of roads) {
    const roadCoords = extractLineCoords(road);
    if (roadCoords.length === 0) continue;
    const dist = minDistToLine(edge.midLng, edge.midLat, roadCoords);
    if (dist < 0.001) return true;
  }
  return false;
}

/** Shoelace 공식으로 다각형 면적(㎡) 계산 — WGS84 좌표를 미터 근사 변환 */
function calcPolygonArea(coords: [number, number][]): number {
  const n = coords.length;
  if (n < 3) return 0;
  // 중심점 기준 미터 변환 상수
  const cLat = coords.reduce((s, c) => s + c[1], 0) / n;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(cLat * Math.PI / 180);
  // Shoelace
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i][0] * mPerDegLng;
    const yi = coords[i][1] * mPerDegLat;
    const xj = coords[j][0] * mPerDegLng;
    const yj = coords[j][1] * mPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}
