// types/vworld.d.ts
// V-World WebGL 3D SDK — window.vw 전역 타입 선언
// SDK는 npm 패키지가 아닌 <script> 동적 주입 방식으로 로드됩니다.

declare global {
  interface Window {
    vw: {
      Map: new () => VwMap;
      CameraPosition: new (coord: VwCoordZ, direction: VwDirection) => VwCameraPosition;
      CoordZ: new (lng: number, lat: number, height: number) => VwCoordZ;
      Direction: new (heading: number, pitch: number, roll: number) => VwDirection;
    };
  }
}

interface VwMap {
  setOption(options: VwMapOptions): void;
  start(): void;
  destroy(): void;
  getMap(): any;
  moveTo(position: VwCameraPosition): void;
}

interface VwMapOptions {
  mapId: string;
  initPosition: VwCameraPosition;
  logo?: boolean;
  navigation?: boolean;
}

interface VwCameraPosition {
  // SDK 내부 사용 — 생성자로만 접근
}

interface VwCoordZ {
  // lng, lat, height 보관
}

interface VwDirection {
  // heading, pitch, roll 보관
}

export {};
