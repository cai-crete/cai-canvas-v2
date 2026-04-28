'use client';

import { memo, useMemo, useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { CadastralGeoJson } from '@/types/canvas';
import * as turfHelpers from '@turf/helpers';
import turfUnion from '@turf/union';

// ── 상수 ──────────────────────────────────────────────────────────────────
const ZOOM = 19;          // 고정 줌 레벨 (타일 & 경로 좌표 통일)
const TILE_SIZE = 256;    // VWorld TMS 타일 크기 (px)
const MIN_SCALE = 1;
const MAX_SCALE = 40;
const TILE_PAD = 3;       // 필지 bbox 주변 타일 확장 수 (좌우 각 3 → 최대 ~7×7 = 49장)

function pnuToLotNumber(pnu: string): string {
  if (!pnu || pnu.length < 19) return '';
  const isDasan = pnu[10] === '2';
  const mainNum = parseInt(pnu.slice(11, 15), 10);
  const subNum = parseInt(pnu.slice(15, 19), 10);
  const prefix = isDasan ? '산' : '';
  return subNum > 0 ? `${prefix}${mainNum}-${subNum}` : `${prefix}${mainNum}`;
}



// ── Web Mercator 변환: lng/lat → 픽셀 (ZOOM 기준, 원점 오프셋 적용) ──────
// 원점 오프셋을 적용하여 SVG 좌표를 0 근처로 정규화 → 부동소수점 정밀도 확보
function lngLatToPixel(lng: number, lat: number): { x: number; y: number } {
  const scale = Math.pow(2, ZOOM) * TILE_SIZE;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    scale;
  return { x, y };
}

export interface CadastralMapViewRef {
  exportToImage: () => Promise<string | null>;
}

interface CadastralMapViewProps {
  boundary: CadastralGeoJson;
  center: { lng: number; lat: number };
  width?: number;
  height?: number;
  className?: string;
  tmsType?: 'None' | 'Base' | 'Satellite' | 'Vector';
  hideControls?: boolean;
  onThumbnailCaptured?: (base64Url: string) => void;
  showSurrounding?: boolean;
  showLotNumbers?: boolean;
  fillSelected?: boolean;
  isOffsetMode?: boolean;
  mapOffset?: { x: number; y: number };
  onChangeOffset?: (offset: { x: number; y: number }) => void;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────
export const CadastralMapView = memo(forwardRef<CadastralMapViewRef, CadastralMapViewProps>(
  ({
    boundary,
    center,
    className,
    hideControls = false,
    tmsType: tmsTypeProp = 'Base',
    showSurrounding = true,
    showLotNumbers = true,
    fillSelected = true,
    onThumbnailCaptured,
    isOffsetMode = false,
    mapOffset = { x: 0, y: 0 },
    onChangeOffset,
  }, ref) => {
    const [tmsType, setTmsType] = useState(tmsTypeProp);
    useEffect(() => {
      setTmsType(tmsTypeProp);
    }, [tmsTypeProp]);

    const [surroundingFeatures, setSurroundingFeatures] = useState<any[]>([]);

    // pan/zoom: CSS transform 기반
    const [view, setView] = useState({ x: 0, y: 0, scale: 1, rotation: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const lastPos = useRef({ x: 0, y: 0 });

    const [offsetHistory, setOffsetHistory] = useState<{x:number, y:number}[]>([{x:0, y:0}]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const currentOffsetRef = useRef(mapOffset);
    useEffect(() => { currentOffsetRef.current = mapOffset; }, [mapOffset]);

    const handleUndoOffset = useCallback(() => {
      if (historyIndex > 0) {
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        onChangeOffset?.(offsetHistory[idx]);
      }
    }, [historyIndex, offsetHistory, onChangeOffset]);

    const handleRedoOffset = useCallback(() => {
      if (historyIndex < offsetHistory.length - 1) {
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        onChangeOffset?.(offsetHistory[idx]);
      }
    }, [historyIndex, offsetHistory, onChangeOffset]);

    const handleResetOffset = useCallback(() => {
      const newOffset = { x: 0, y: 0 };
      const newHistory = [...offsetHistory.slice(0, historyIndex + 1), newOffset];
      setOffsetHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      onChangeOffset?.(newOffset);
    }, [historyIndex, offsetHistory, onChangeOffset]);

    useImperativeHandle(ref, () => ({
      exportToImage: async () => {
        const svg = svgRef.current;
        const container = containerRef.current;
        if (!svg || !container) return null;
        
        const rect = container.getBoundingClientRect();
        const clone = svg.cloneNode(true) as SVGSVGElement;
        
        const images = Array.from(clone.querySelectorAll('image'));
        await Promise.all(images.map(async (img) => {
          const href = img.getAttribute('href');
          if (href && href.startsWith('http')) {
            try {
              const res = await fetch('/api/vworld-map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'proxy-image', url: href })
              });
              const json = await res.json();
              if (json.success && json.dataUrl) img.setAttribute('href', json.dataUrl);
              else img.remove();
            } catch (e) { img.remove(); }
          }
        }));
        
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(clone);
        if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
          source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
        const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        return new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // 297:210 (A4) 비율 계산
            const targetRatio = 297 / 210;
            const rectRatio = rect.width / rect.height;
            
            let targetWidth = rect.width;
            let targetHeight = rect.height;

            if (rectRatio > targetRatio) {
              // 화면이 목표 비율보다 가로로 김 -> 세로에 맞추고 가로를 줄임 (크롭)
              targetHeight = rect.height;
              targetWidth = rect.height * targetRatio;
            } else {
              // 화면이 목표 비율보다 세로로 김 -> 가로에 맞추고 세로를 줄임 (크롭)
              targetWidth = rect.width;
              targetHeight = rect.width / targetRatio;
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            
            // 배경색 칠하기
            ctx.fillStyle = tmsType === 'None' ? '#f5f5f5' : '#e5e7eb';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 중앙 정렬을 위한 오프셋 (크롭 영역을 원래 화면의 중앙에 위치시킴)
            const offsetX = (rect.width - targetWidth) / 2;
            const offsetY = (rect.height - targetHeight) / 2;
            
            ctx.translate(-offsetX, -offsetY); // 오프셋만큼 이동하여 원래 rect 좌표계와 맞춤
            
            ctx.translate(rect.width / 2, rect.height / 2);
            ctx.rotate((view.rotation || 0) * Math.PI / 180);
            ctx.translate(-rect.width / 2, -rect.height / 2);
            ctx.translate(view.x, view.y);
            ctx.scale(view.scale, view.scale);
            
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
            resolve(canvas.toDataURL('image/png', 1.0));
            URL.revokeObjectURL(url);
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      }
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        setContainerSize({ w: width, h: height });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    function clampView(x: number, y: number, scale: number, w: number, h: number) {
      if (w === 0 || h === 0) return { x, y };
      const contentW = w * scale;
      const contentH = h * scale;
      const clampedX = Math.min(0, Math.max(w - contentW, x));
      const clampedY = Math.min(0, Math.max(h - contentH, y));
      return { x: clampedX, y: clampedY };
    }

    // ── 1. 주변 필지 WFS 요청 ───────────────────────────────────────────
    useEffect(() => {
      if (!center) return;
      const d = 0.0015; // 약 160m 반경 (MAXFEATURES=1000 제한 회피)
      // WFS 1.1.0 with EPSG:4326 expects BBOX in minLat,minLon,maxLat,maxLon order
      const bbox = `${center.lat - d},${center.lng - d},${center.lat + d},${center.lng + d}`;
      fetch('/api/vworld-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'wfs-bbox', bbox }),
      })
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data?.features) {
            console.log('[MAP DIAG] 주변 필지:', json.data.features.length, '건');
            const pnu = boundary.features[0]?.properties?.pnu;
            setSurroundingFeatures(
              json.data.features.filter((f: any) => f.properties?.pnu !== pnu),
            );
          }
        })
        .catch(err => console.error('[CadastralMap] 주변 지적도 로드 실패', err));
    }, [center, boundary]);

    // ── 2. SVG 썸네일 캡처 ─────────────────────────────────────────────
    const onThumbRef = useRef(onThumbnailCaptured);
    useEffect(() => { onThumbRef.current = onThumbnailCaptured; }, [onThumbnailCaptured]);

    useEffect(() => {
      if (!svgRef.current) return;
      const timer = setTimeout(() => {
        const capture = async () => {
          const svg = svgRef.current;
          if (!svg) return;
          try {
            const clone = svg.cloneNode(true) as SVGSVGElement;
            
            // 타일 이미지를 base64로 변환하여 임베드 (CORS 허용 시)
            const images = Array.from(clone.querySelectorAll('image'));
            await Promise.all(images.map(async (img) => {
              const href = img.getAttribute('href');
              if (href && href.startsWith('http')) {
                try {
                  const res = await fetch('/api/vworld-map', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'proxy-image', url: href })
                  });
                  const json = await res.json();
                  if (json.success && json.dataUrl) {
                    img.setAttribute('href', json.dataUrl);
                  } else {
                    img.remove();
                  }
                } catch (e) {
                  img.remove();
                }
              }
            }));
            
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const [minX, minY, w, h] = clone.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 256, 256];
            rect.setAttribute('x', minX.toString());
            rect.setAttribute('y', minY.toString());
            rect.setAttribute('width', w.toString());
            rect.setAttribute('height', h.toString());
            rect.setAttribute('fill', tmsType === 'None' ? '#f5f5f5' : '#e5e7eb');
            clone.insertBefore(rect, clone.firstChild);

            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(clone);
            if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
              source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
            
            if (onThumbRef.current) {
              onThumbRef.current('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source));
            }
          } catch (e) {
            console.error('SVG Capture failed', e);
          }
        };
        capture();
      }, 1500);
      return () => clearTimeout(timer);
    }, [boundary, tmsType, showSurrounding, showLotNumbers]);

    // ── 3. Mercator 픽셀 좌표계로 경로/타일 계산 (원점 오프셋 적용) ─────
    const { paths, surroundPaths, viewBox, tiles, lotLabels } = useMemo(() => {
      // 중심점의 절대 픽셀 좌표를 오프셋으로 사용
      const originPx = lngLatToPixel(center.lng, center.lat);
      const ox = originPx.x;
      const oy = originPx.y;

      // 오프셋 적용된 좌표 변환
      const toLocal = (lng: number, lat: number) => {
        const abs = lngLatToPixel(lng, lat);
        return { x: abs.x - ox, y: abs.y - oy };
      };

      // 폴리곤 링 → SVG path d (로컬 좌표)
      const buildPath = (rings: number[][][]) =>
        rings
          .map(ring =>
            ring
              .map((c, i) => {
                const { x, y } = toLocal(c[0], c[1]);
                return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(' ') + ' Z',
          )
          .join(' ');

      const allPx: { x: number; y: number }[] = [];
      const svgPaths: string[] = [];
      const lotLabels: { text: string, x: number, y: number, isMain: boolean }[] = [];

      for (const feat of boundary.features) {
        const pnu = feat.properties?.pnu as string;
        const pts: {x:number, y:number}[] = [];
        const { type, coordinates } = feat.geometry;
        if (type === 'Polygon') {
          svgPaths.push(buildPath(coordinates as number[][][]));
          (coordinates as number[][][]).forEach(ring =>
            ring.forEach(c => {
               const p = toLocal(c[0], c[1]);
               allPx.push(p);
               pts.push(p);
            })
          );
        } else if (type === 'MultiPolygon') {
          for (const poly of coordinates as number[][][][]) {
            svgPaths.push(buildPath(poly));
            poly.forEach(ring => ring.forEach(c => {
               const p = toLocal(c[0], c[1]);
               allPx.push(p);
               pts.push(p);
            }));
          }
        }
        if (pts.length > 0 && pnu) {
           const xs = pts.map(p => p.x);
           const ys = pts.map(p => p.y);
           lotLabels.push({
              text: pnuToLotNumber(pnu),
              x: (Math.min(...xs) + Math.max(...xs)) / 2,
              y: (Math.min(...ys) + Math.max(...ys)) / 2,
              isMain: true
           });
        }
      }

      if (allPx.length === 0) {
        return { paths: [], surroundPaths: [], viewBox: '0 0 256 256', tiles: [], lotLabels: [] };
      }

      const xs = allPx.map(p => p.x);
      const ys = allPx.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // viewBox: 필지 크기 기준 여백 (2.5배)
      const extentPx = Math.max(maxX - minX, maxY - minY, 200);
      const pad = extentPx * 2.5;
      const vMinX = minX - pad;
      const vMaxX = maxX + pad;
      const vMinY = minY - pad;
      const vMaxY = maxY + pad;
      const vW = vMaxX - vMinX;
      const vH = vMaxY - vMinY;
      const vb = `${vMinX.toFixed(0)} ${vMinY.toFixed(0)} ${vW.toFixed(0)} ${vH.toFixed(0)}`;

      // 주변 필지 PNU별 그룹화 및 병합
      const sPaths: string[] = [];
      const surroundByPnu: Record<string, any[]> = {};
      for (const feat of surroundingFeatures) {
        const pnu = feat.properties?.pnu as string;
        if (pnu) {
          if (!surroundByPnu[pnu]) surroundByPnu[pnu] = [];
          surroundByPnu[pnu].push(feat);
        }
      }

      for (const pnu in surroundByPnu) {
        const feats = surroundByPnu[pnu];
        let mergedFeat = feats[0];
        try {
           for (let i = 1; i < feats.length; i++) {
             // WFS MultiPolygon or Polygon features
             const polyA = mergedFeat.geometry.type === 'Polygon' ? turfHelpers.polygon(mergedFeat.geometry.coordinates) : turfHelpers.multiPolygon(mergedFeat.geometry.coordinates);
             const polyB = feats[i].geometry.type === 'Polygon' ? turfHelpers.polygon(feats[i].geometry.coordinates) : turfHelpers.multiPolygon(feats[i].geometry.coordinates);
             const unioned = turfUnion(turfHelpers.featureCollection([polyA, polyB] as any)) as any;
             if (unioned) mergedFeat = unioned;
           }
        } catch (e) {
           console.error('Turf union failed for PNU', pnu, e);
        }
        
        const type = mergedFeat.geometry.type;
        const polys = type === 'Polygon' ? [mergedFeat.geometry.coordinates] : mergedFeat.geometry.coordinates;
        const pts: {x:number, y:number}[] = [];
        
        for (const poly of polys) {
          const coords = poly[0]; // exterior ring
          if (!coords) continue;
          const mappedPts = coords.map((c: any) => toLocal(c[0], c[1]));
          pts.push(...mappedPts);
          const d =
            `M ${mappedPts[0].x} ${mappedPts[0].y} ` +
            mappedPts.slice(1).map((p: any) => `L ${p.x} ${p.y}`).join(' ') +
            ' Z';
          sPaths.push(d);
        }
        
        if (pts.length > 0) {
           const xs = pts.map(p => p.x);
           const ys = pts.map(p => p.y);
           lotLabels.push({
              text: pnuToLotNumber(pnu),
              x: (Math.min(...xs) + Math.max(...xs)) / 2,
              y: (Math.min(...ys) + Math.max(...ys)) / 2,
              isMain: false
           });
        }
      }

      // ── 타일 계산 (수량 제한: 필지 bbox + TILE_PAD 타일만 로드) ───────
      const tilesList: {
        id: string;
        href: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];

      if (tmsType !== 'None') {
        const ext = tmsType === 'Satellite' ? 'jpeg' : 'png';
        const baseUrl = tmsType === 'Vector'
          ? `https://api.vworld.kr/req/wmts/vector/${process.env.NEXT_PUBLIC_VWORLD_KEY || '2A63345D-557F-32C5-89D5-DE55A65CF23B'}/Base`
          : `https://xdworld.vworld.kr/2d/${tmsType}/service`;

        // 필지 bbox 기준으로 필요한 타일 범위 계산 (절대 좌표 기준)
        const absMinX = minX + ox;
        const absMaxX = maxX + ox;
        const absMinY = minY + oy;
        const absMaxY = maxY + oy;

        const tilMinX = Math.floor(absMinX / TILE_SIZE) - TILE_PAD;
        const tilMaxX = Math.floor(absMaxX / TILE_SIZE) + TILE_PAD;
        const tilMinY = Math.floor(absMinY / TILE_SIZE) - TILE_PAD;
        const tilMaxY = Math.floor(absMaxY / TILE_SIZE) + TILE_PAD;

        for (let tx = tilMinX; tx <= tilMaxX; tx++) {
          for (let ty = tilMinY; ty <= tilMaxY; ty++) {
            tilesList.push({
              id: `${ZOOM}-${tx}-${ty}`,
              href: `${baseUrl}/${ZOOM}/${tx}/${ty}.${ext}`,
              x: tx * TILE_SIZE - ox, // 로컬 좌표로 변환
              y: ty * TILE_SIZE - oy,
              w: TILE_SIZE,
              h: TILE_SIZE,
            });
          }
        }

        console.log(`[MAP DIAG] tiles: ${tilesList.length}장, viewBox: ${vb}`);
        if (tilesList.length > 0) {
          console.log(`[MAP DIAG] 샘플 타일 URL: ${tilesList[0].href}`);
          console.log(`[MAP DIAG] 샘플 타일 로컬 좌표: x=${tilesList[0].x.toFixed(0)}, y=${tilesList[0].y.toFixed(0)}`);
        }
      }

      return { paths: svgPaths, surroundPaths: sPaths, viewBox: vb, tiles: tilesList, lotLabels };
    }, [boundary, center, surroundingFeatures, tmsType]);

    // ── 4. 휠 줌 — 네이티브 리스너 (passive: false) ─────────────────────
    // React onWheel은 passive로 등록되어 preventDefault() 호출 불가.
    // useEffect에서 직접 non-passive 리스너를 등록하여 해결.
    const viewRef = useRef(view);
    viewRef.current = view;

    useEffect(() => {
      const el = containerRef.current;
      if (!el || hideControls) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

        setView(prev => {
          const nextScale = Math.min(Math.max(MIN_SCALE, prev.scale * factor), MAX_SCALE);
          const ratio = nextScale / prev.scale;
          const nx = cx - (cx - prev.x) * ratio;
          const ny = cy - (cy - prev.y) * ratio;
          return {
            scale: nextScale,
            rotation: prev.rotation,
            ...clampView(nx, ny, nextScale, containerSize.w, containerSize.h)
          };
        });
      };

      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [hideControls]);

    // 드래그 pan
    const handlePointerDown = (e: React.PointerEvent) => {
      if (hideControls) return;
      setIsDragging(true);
      lastPos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging || hideControls) return;
      
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      
      if (isOffsetMode) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && svgRef.current) {
          const viewBoxAttr = svgRef.current.getAttribute('viewBox');
          const [vx, vy, vw, vh] = viewBoxAttr ? viewBoxAttr.split(' ').map(Number) : [0,0,1,1];
          const internalScale = Math.min(rect.width / vw, rect.height / vh);
          
          const angle = (view.rotation || 0) * (Math.PI / 180);
          const cos = Math.cos(-angle);
          const sin = Math.sin(-angle);
          const rdx = dx * cos - dy * sin;
          const rdy = dx * sin + dy * cos;
          
          const svgDx = rdx / (view.scale * internalScale);
          const svgDy = rdy / (view.scale * internalScale);
          
          currentOffsetRef.current = { 
             x: currentOffsetRef.current.x + svgDx, 
             y: currentOffsetRef.current.y + svgDy 
          };
          onChangeOffset?.(currentOffsetRef.current);
        }
      } else if (e.altKey) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const angle1 = Math.atan2(lastPos.current.y - cy, lastPos.current.x - cx);
          const angle2 = Math.atan2(e.clientY - cy, e.clientX - cx);
          const dTheta = (angle2 - angle1) * (180 / Math.PI);
          setView(prev => ({ ...prev, rotation: (prev.rotation || 0) + dTheta }));
        }
      } else {
        setView(prev => {
          const angle = (prev.rotation || 0) * (Math.PI / 180);
          const cos = Math.cos(-angle);
          const sin = Math.sin(-angle);
          const rdx = dx * cos - dy * sin;
          const rdy = dx * sin + dy * cos;
          return {
            ...prev,
            ...clampView(prev.x + rdx, prev.y + rdy, prev.scale, containerSize.w, containerSize.h)
          };
        });
      }
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      if (hideControls) return;
      if (isOffsetMode && isDragging) {
        const newHistory = [...offsetHistory.slice(0, historyIndex + 1), currentOffsetRef.current];
        setOffsetHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
      setIsDragging(false);
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    };

    // ── 5. 타일 로드 실패 핸들러 ─────────────────────────────────────────
    const handleTileError = useCallback((e: React.SyntheticEvent<SVGImageElement>) => {
      const img = e.target as SVGImageElement;
      img.style.opacity = '0';
      console.warn('[MAP] 타일 로드 실패:', img.getAttribute('href'));
    }, []);

    if (paths.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${className ?? ''}`}
        style={{
          touchAction: 'none',
          background: tmsType === 'None' ? '#f5f5f5' : '#e5e7eb',
          cursor: isDragging ? 'grabbing' : hideControls ? 'default' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* 오프셋 모드 툴바 */}
        {isOffsetMode && !hideControls && (
          <div
            style={{
              position: 'absolute',
              left: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-white)',
              borderRadius: '999px',
              padding: '6px',
              boxShadow: 'var(--shadow-float)',
              zIndex: 10,
              gap: '6px'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleUndoOffset}
              disabled={historyIndex === 0}
              title="뒤로 가기 (Undo)"
              style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'transparent',
                cursor: historyIndex === 0 ? 'default' : 'pointer',
                opacity: historyIndex === 0 ? 0.3 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gray-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
            </button>
            <button
              onClick={handleRedoOffset}
              disabled={historyIndex === offsetHistory.length - 1}
              title="앞으로 가기 (Redo)"
              style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'transparent',
                cursor: historyIndex === offsetHistory.length - 1 ? 'default' : 'pointer',
                opacity: historyIndex === offsetHistory.length - 1 ? 0.3 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gray-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
            </button>
            <div style={{ width: '20px', height: '1px', background: 'var(--color-gray-200)', margin: '2px auto' }} />
            <button
              onClick={handleResetOffset}
              title="처음으로 (Reset)"
              style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'transparent',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gray-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        )}

        {/* Rotation Wrapper (중앙 기준 회전) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '50% 50%',
            transform: `rotate(${view.rotation || 0}deg)`,
          }}
        >
          {/* Pan/Zoom Wrapper: willChange 제외하여 네이티브 렌더링 강제 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: '0 0',
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          >
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={viewBox}
              aria-label="지적 경계 맵"
              role="img"
              style={{ display: 'block' }}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* TMS 타일 배경 */}
              {tiles.map(t => (
                <image
                  key={t.id}
                  href={t.href}
                  x={t.x + mapOffset.x}
                  y={t.y + mapOffset.y}
                  width={t.w}
                  height={t.h}
                  preserveAspectRatio="none"
                  crossOrigin="anonymous"
                  style={{ filter: tmsType === 'Vector' ? 'grayscale(100%)' : 'none' }}
                  onError={handleTileError}
                />
              ))}

              {/* 주변 필지 (회색 선) */}
              {showSurrounding && surroundPaths.map((d, i) => (
                <path
                  key={`s-${i}`}
                  d={d}
                  stroke="#9ca3af"
                  strokeWidth={1 / view.scale}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* 대상 필지 (빨간 선 + 반투명 채움) */}
              {paths.map((d, i) => (
                <path
                  key={`m-${i}`}
                  d={d}
                  stroke="#EF4444"
                  strokeWidth={2 / view.scale}
                  fill={fillSelected ? 'rgba(239, 68, 68, 0.3)' : 'transparent'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

            {/* 지번 라벨 */}
            {showLotNumbers && lotLabels.map((lbl, i) => (
              <text
                key={`lot-${i}`}
                x={lbl.x}
                y={lbl.y}
                fill={lbl.isMain ? '#EF4444' : '#6B7280'}
                fontSize={lbl.isMain ? '12.5' : '10'}
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="central"
                stroke="#ffffff"
                strokeWidth="2"
                paintOrder="stroke"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {lbl.text}
              </text>
            ))}
            </svg>
          </div>
        </div>
      </div>
    );
  }
));

CadastralMapView.displayName = 'CadastralMapView';
