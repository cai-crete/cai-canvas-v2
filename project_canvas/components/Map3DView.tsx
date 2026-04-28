// components/Map3DView.tsx
'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
 * V-World SDK는 map.start() 시 전역 객체에 viewer를 non-configurable로 등록.
 * map.destroy() 후에도 이 프로퍼티가 남아 재초기화 시 "Cannot redefine property: viewer" 발생.
 *
 * 핵심 문제: Next.js Fast Refresh 시 JS 모듈이 리로드 → _map = null 리셋.
 *           그러나 DOM(div#vw3d-global)은 유지 → isDivInitialized()=true.
 *           결과: _map=null인데 초기화 건너뜀 → capture() 등 모든 기능 무동작.
 *
 * 해결: window._vwMap에 map 참조를 저장 → 모듈 리로드 후에도 복구 가능.
 * ───────────────────────────────────────────────────────────────────────── */

const GLOBAL_DIV_ID = 'vw3d-global';

/** 모듈 리로드에서 살아남는 map 참조 */
function getMap(): any {
  return (window as any)._vwMap ?? null;
}
function setMap(map: any) {
  (window as any)._vwMap = map;
}

function ensureDiv(): HTMLDivElement {
  let div = document.getElementById(GLOBAL_DIV_ID) as HTMLDivElement | null;
  if (!div) {
    div = document.createElement('div');
    div.id = GLOBAL_DIV_ID;
    div.style.cssText =
      'position:fixed;z-index:500;display:none;pointer-events:auto;' +
      'border-radius:12px;overflow:hidden;background:#1a1a2e;';
    document.body.appendChild(div);
  }
  return div;
}

function isDivInitialized(): boolean {
  return document.getElementById(GLOBAL_DIV_ID)?.dataset.initialized === 'true';
}

/* ── 카메라 위치 계산 ─────────────────────────────────────────────────── */
// heading: 대지→도로 외향 법선 (0=북, 시계방향 degree)
// V-World Direction.tilt: 0=top-down, 90=horizontal (양수=수평 방향)
// 45° Bird's Eye → tilt=45
function calcCamera(
  center: { lng: number; lat: number },
  heading: number,
  height: number,
) {
  const camDeg = (heading + 45 + 360) % 360;
  const camRad = (camDeg * Math.PI) / 180;
  const off = height / 111000;
  return {
    lng: center.lng + Math.sin(camRad) * off,
    lat: center.lat + Math.cos(camRad) * off,
    alt: height,
    dir: (camDeg + 180) % 360,
    tilt: 45,
  };
}

/* ── 캡처: 동기 render → toDataURL (preserveDrawingBuffer 무관) ───────── */
function captureCanvas(cesium: any, canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    // 방법 1: 동기 render + toDataURL (같은 동기 블록 → 버퍼 미클리어)
    try {
      cesium.scene.render();
      const url = canvas.toDataURL('image/png');
      console.log('[Map3D capture] 방법1 동기 toDataURL, length:', url?.length ?? 0);
      if (url && url.length > 1000) { resolve(url); return; }
    } catch (e) {
      console.warn('[Map3D capture] 방법1 실패:', e);
    }

    // 방법 2: readPixels → 2D canvas (toDataURL 실패 시 폴백)
    try {
      cesium.scene.render();
      const gl: WebGLRenderingContext | null =
        canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ??
        canvas.getContext('webgl', { preserveDrawingBuffer: true });
      if (gl) {
        const w = canvas.width, h = canvas.height;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // 빈 이미지 체크 (모두 0이면 실패)
        let nonZero = 0;
        for (let i = 0; i < Math.min(pixels.length, 4000); i++) { if (pixels[i] > 0) nonZero++; }
        console.log('[Map3D capture] 방법2 readPixels nonZero samples:', nonZero);

        if (nonZero > 10) {
          const c2 = document.createElement('canvas');
          c2.width = w; c2.height = h;
          const ctx = c2.getContext('2d')!;
          const img = ctx.createImageData(w, h);
          // WebGL은 y축이 뒤집혀 있음
          for (let y = 0; y < h; y++) {
            const src = (h - y - 1) * w * 4;
            const dst = y * w * 4;
            img.data.set(pixels.subarray(src, src + w * 4), dst);
          }
          ctx.putImageData(img, 0, 0);
          const url2 = c2.toDataURL('image/png');
          console.log('[Map3D capture] 방법2 성공, length:', url2.length);
          resolve(url2);
          return;
        }
      }
    } catch (e) {
      console.warn('[Map3D capture] 방법2 실패:', e);
    }

    console.error('[Map3D capture] 모든 캡처 방법 실패');
    resolve(null);
  });
}

/* ── 레이블/POI 토글 ─────────────────────────────────────────────────── */
function applyLabelsVisible(map: any, visible: boolean) {
  console.log('[Map3D labels] applyLabelsVisible 호출, visible:', visible);
  let changed = 0;

  try {
    // 1) V-World SDK 레이어 리스트
    const hasGetLayerList = typeof map.getLayerList === 'function';
    console.log('[Map3D labels] map.getLayerList 존재:', hasGetLayerList);

    if (hasGetLayerList) {
      const layers: any[] = map.getLayerList() ?? [];
      console.log('[Map3D labels] 레이어 수:', layers.length);
      layers.forEach((l: any) => {
        const id = (l.get?.('id') ?? l.id ?? l.name ?? '').toLowerCase();
        console.log('[Map3D labels]   레이어:', id);
        if (/poi|label|text|ann|name|place|symbol|icon/i.test(id)) {
          l.setVisible?.(visible);
          changed++;
        }
      });
    }

    // 2) Cesium primitives
    const cesium = map.getMap?.();
    if (cesium?.scene?.primitives) {
      const prims = cesium.scene.primitives;
      console.log('[Map3D labels] Cesium primitives 수:', prims.length);
      for (let i = 0; i < prims.length; i++) {
        const p = prims.get(i);
        if (!p) continue;
        const ctor = p.constructor?.name ?? '';
        if (
          p._labels !== undefined ||
          p._billboards !== undefined ||
          ctor.includes('Label') ||
          ctor.includes('Billboard') ||
          ctor.includes('Point')
        ) {
          p.show = visible;
          changed++;
          console.log('[Map3D labels]   primitive 토글:', ctor);
        }
      }
    }

    // 3) Cesium entities
    if (cesium?.entities?.values) {
      const ents = cesium.entities.values;
      console.log('[Map3D labels] Cesium entities 수:', ents.length);
      ents.forEach((e: any) => {
        if (e.label) { e.label.show = visible; changed++; }
        if (e.point) { e.point.show = visible; changed++; }
        if (e.billboard) { e.billboard.show = visible; changed++; }
      });
    }
  } catch (err) {
    console.error('[Map3D labels] 에러:', err);
  }

  console.log('[Map3D labels] 총 토글된 항목:', changed);
}

/* ── 타입 ────────────────────────────────────────────────────────────── */
export interface Map3DViewRef {
  capture: () => Promise<string | null>;
  setLabelsVisible: (visible: boolean) => void;
}

interface Map3DViewProps {
  containerId: string;
  center: { lng: number; lat: number };
  heading: number | null;
  height?: number;
  showLabels?: boolean;
}

/* ── 컴포넌트 ────────────────────────────────────────────────────────── */
export const Map3DView = memo(forwardRef<Map3DViewRef, Map3DViewProps>(({
  containerId: _containerId,
  center,
  heading,
  height = 800,
  showLabels = true,
}, ref) => {
  const placeholderRef = useRef<HTMLDivElement>(null);

  /* ── 외부 메서드 ── */
  useImperativeHandle(ref, () => ({
    capture: async (): Promise<string | null> => {
      const map = getMap();
      if (!map) return null;
      try {
        const cesium = map.getMap?.();
        const canvas: HTMLCanvasElement | null = cesium?.scene?.canvas ?? null;
        if (!cesium || !canvas) return null;
        return await captureCanvas(cesium, canvas);
      } catch { return null; }
    },

    setLabelsVisible: (visible: boolean) => {
      const map = getMap();
      if (map) applyLabelsVisible(map, visible);
    },
  }), []);

  /* ── placeholder → 싱글톤 div 위치 동기화 ── */
  const syncPosition = useCallback(() => {
    const ph = placeholderRef.current;
    const div = document.getElementById(GLOBAL_DIV_ID) as HTMLDivElement | null;
    if (!ph || !div) return;
    const r = ph.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    Object.assign(div.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      display: 'block',
    });
  }, []);

  /* ── 카메라 이동 ── */
  const moveCamera = useCallback((h: number) => {
    const map = getMap();
    if (!map) return;
    try {
      const cam = calcCamera(center, h, height);
      const cesium = map.getMap?.();
      if (cesium?.camera?.setView) {
        const C = (window as any).Cesium;
        cesium.camera.setView({
          destination: C?.Cartesian3?.fromDegrees?.(cam.lng, cam.lat, cam.alt),
          orientation: {
            heading: C?.Math?.toRadians?.(cam.dir) ?? 0,
            pitch: C?.Math?.toRadians?.(-(90 - cam.tilt)) ?? -0.785,
            roll: 0,
          },
        });
      } else if (map.setCamera) {
        map.setCamera(
          new window.vw.CoordZ(cam.lng, cam.lat, cam.alt),
          new window.vw.Direction(cam.dir, cam.tilt, 0),
        );
      }
    } catch { /* 무시 */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lng, center.lat, height]);

  /* ── SDK 준비 대기 ── */
  const waitForSDK = useCallback((cb: () => void) => {
    if (window.vw?.Map) { setTimeout(cb, 500); return; }
    const t = setInterval(() => {
      if (window.vw?.Map) { clearInterval(t); setTimeout(cb, 500); }
    }, 300);
    setTimeout(() => clearInterval(t), 15000);
  }, []);

  /* ── 초기화 (단 1회) ── */
  const tryInit = useCallback((h: number) => {
    if (isDivInitialized()) {
      // 이미 초기화됨 (Fast Refresh 후 포함) → 카메라만 이동
      moveCamera(h);
      return;
    }
    if (!window.vw?.Map) return;

    const div = ensureDiv();
    div.dataset.initialized = 'true'; // 동기 세팅 → race condition 방지

    const cam = calcCamera(center, h, height);
    try {
      const map = new window.vw.Map();
      map.setOption({
        mapId: GLOBAL_DIV_ID,
        initPosition: new window.vw.CameraPosition(
          new window.vw.CoordZ(cam.lng, cam.lat, cam.alt),
          new window.vw.Direction(cam.dir, cam.tilt, 0),
        ),
        logo: false,
        navigation: false,
      });
      map.start();
      setMap(map); // window._vwMap에 저장 → Fast Refresh 후에도 복구
    } catch (e) {
      console.error('[Map3D] 초기화 실패:', e);
      div.dataset.initialized = 'false';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lng, center.lat, height]);

  /* ── 마운트 ── */
  useEffect(() => {
    ensureDiv();
    syncPosition();
    const ro = new ResizeObserver(syncPosition);
    if (placeholderRef.current) ro.observe(placeholderRef.current);
    window.addEventListener('resize', syncPosition);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncPosition);
      const div = document.getElementById(GLOBAL_DIV_ID) as HTMLDivElement | null;
      if (div) div.style.display = 'none';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── heading 확정 시 초기화 or 카메라 이동 ── */
  useEffect(() => {
    if (heading === null) return;
    if (isDivInitialized()) {
      syncPosition();
      moveCamera(heading);
    } else {
      waitForSDK(() => { tryInit(heading); syncPosition(); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heading]);

  /* ── showLabels 변경 ── */
  useEffect(() => {
    const map = getMap();
    if (!isDivInitialized() || !map) return;
    applyLabelsVisible(map, showLabels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLabels]);

  return (
    <div
      ref={placeholderRef}
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 300,
        background: '#1a1a2e', borderRadius: '12px',
      }}
    >
      {heading === null && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(26,26,46,0.85)', borderRadius: '12px',
        }}>
          <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>도로 분석 중...</span>
        </div>
      )}
    </div>
  );
}));

Map3DView.displayName = 'Map3DView';
